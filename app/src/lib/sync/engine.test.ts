import { beforeEach, describe, expect, it } from 'vitest'
import { syncOnce, type RemoteApi, type VaultAdapter } from './engine'
import { GitHubError, type NewTreeEntry, type TreeEntry } from './github'
import { gitBlobSha } from './sha'
import { EMPTY_META, type NoteFile, type SyncMeta } from '../types'

// A tiny in-memory git host good enough for the Git Data API calls we make.
class FakeGitHub implements RemoteApi {
  blobs = new Map<string, string>()
  trees = new Map<string, Record<string, string>>() // tree sha -> path -> blob sha
  commits = new Map<string, { tree: string; parents: string[] }>()
  head: string | null = null
  empty = true
  calls: string[] = []
  beforeUpdateHead?: () => Promise<void> | void
  onBlobFetch?: () => void
  private n = 0

  private id(prefix: string) {
    return `${prefix}${++this.n}`
  }

  async commitFiles(files: Record<string, string | null>, message = 'remote') {
    const base = this.head ? this.trees.get(this.commits.get(this.head)!.tree)! : {}
    const next = { ...base }
    for (const [p, c] of Object.entries(files)) {
      if (c === null) delete next[p]
      else {
        const sha = await gitBlobSha(c)
        this.blobs.set(sha, c)
        next[p] = sha
      }
    }
    const tree = this.id('t')
    this.trees.set(tree, next)
    const commit = this.id('c')
    this.commits.set(commit, { tree, parents: this.head ? [this.head] : [] })
    this.head = commit
    this.empty = false
    void message
    return commit
  }

  files(): Record<string, string> {
    if (!this.head) return {}
    const t = this.trees.get(this.commits.get(this.head)!.tree)!
    return Object.fromEntries(Object.entries(t).map(([p, s]) => [p, this.blobs.get(s)!]))
  }

  async getHead() {
    this.calls.push('getHead')
    return this.head
  }
  async getCommitTree(sha: string) {
    return this.commits.get(sha)!.tree
  }
  async listBlobs(treeSha: string): Promise<TreeEntry[]> {
    this.calls.push('listBlobs')
    return Object.entries(this.trees.get(treeSha)!).map(([path, sha]) => ({ path, sha, mode: '100644', type: 'blob' as const }))
  }
  async getBlobText(sha: string) {
    this.calls.push('getBlob')
    this.onBlobFetch?.()
    return this.blobs.get(sha)!
  }
  async createTree(baseTree: string | null, entries: NewTreeEntry[]) {
    if (this.empty) throw new GitHubError(409, 'Git Repository is empty.')
    const base = baseTree ? this.trees.get(baseTree)! : {}
    const next = { ...base }
    for (const e of entries) {
      if ('content' in e) {
        const sha = await gitBlobSha(e.content)
        this.blobs.set(sha, e.content)
        next[e.path] = sha
      } else {
        if (!(e.path in next)) throw new GitHubError(422, 'path not in tree')
        delete next[e.path]
      }
    }
    const tree = this.id('t')
    this.trees.set(tree, next)
    return tree
  }
  async createCommit(_message: string, tree: string, parents: string[]) {
    this.calls.push('createCommit')
    const c = this.id('c')
    this.commits.set(c, { tree, parents })
    return c
  }
  async updateHead(sha: string) {
    await this.beforeUpdateHead?.()
    const parent = this.commits.get(sha)!.parents[0]
    if (parent !== this.head) return false
    this.head = sha
    return true
  }
  async createBranch(sha: string) {
    if (this.head) return false
    this.head = sha
    return true
  }
  async initEmptyRepo(path: string, content: string) {
    this.empty = false
    await this.commitFiles({ [path]: content })
  }
}

class MemoryVault implements VaultAdapter {
  data: Record<string, NoteFile> = {}
  m: SyncMeta = EMPTY_META
  files() {
    return this.data
  }
  apply(put: NoteFile[], remove: string[]) {
    const next = { ...this.data }
    for (const f of put) next[f.path] = f
    for (const p of remove) delete next[p]
    this.data = next
  }
  meta() {
    return this.m
  }
  setMeta(m: SyncMeta) {
    this.m = m
  }
  // Mimic the vault store's editing actions.
  edit(path: string, content: string) {
    const f = this.data[path]
    this.data = {
      ...this.data,
      [path]: f
        ? { ...f, content, dirty: content !== f.baseContent }
        : { path, content, baseSha: null, baseContent: null, dirty: true, deleted: false, mtime: 0, ctime: 0 },
    }
  }
  remove(path: string) {
    const f = this.data[path]
    const next = { ...this.data }
    if (f.baseSha) next[path] = { ...f, content: '', deleted: true, dirty: true }
    else delete next[path]
    this.data = next
  }
  text() {
    return Object.fromEntries(
      Object.values(this.data)
        .filter((f) => !f.deleted)
        .map((f) => [f.path, f.content]),
    )
  }
}

let gh: FakeGitHub
let a: MemoryVault
let b: MemoryVault

beforeEach(async () => {
  gh = new FakeGitHub()
  a = new MemoryVault()
  b = new MemoryVault()
})

describe('sync engine', () => {
  it('pulls existing notes and ignores app code and dot folders', async () => {
    await gh.commitFiles({
      'Welcome.md': 'hi\n',
      'Folder/Deep.md': 'deep\n',
      'app/README.md': 'not a note',
      'app/src/main.tsx': 'code',
      '.obsidian/x.md': 'cfg',
      'image.png': 'binary',
    })
    const r = await syncOnce(gh, a)
    expect(a.text()).toEqual({ 'Welcome.md': 'hi\n', 'Folder/Deep.md': 'deep\n' })
    expect(r.pulled.sort()).toEqual(['Folder/Deep.md', 'Welcome.md'])
    expect(Object.values(a.data).every((f) => !f.dirty && f.baseSha)).toBe(true)
  })

  it('a quiet second sync makes no downloads or commits', async () => {
    await gh.commitFiles({ 'A.md': 'a' })
    await syncOnce(gh, a)
    gh.calls = []
    await syncOnce(gh, a)
    expect(gh.calls).toEqual(['getHead'])
  })

  it('pushes local edits in one commit and keeps other files', async () => {
    await gh.commitFiles({ 'A.md': 'a\n', 'app/index.html': '<html>' })
    await syncOnce(gh, a)
    a.edit('A.md', 'a edited\n')
    a.edit('New.md', 'new\n')
    const r = await syncOnce(gh, a)
    expect(r.pushed.sort()).toEqual(['A.md', 'New.md'])
    expect(gh.files()).toEqual({ 'A.md': 'a edited\n', 'New.md': 'new\n', 'app/index.html': '<html>' })
    expect(Object.values(a.data).every((f) => !f.dirty)).toBe(true)
    expect(a.data['A.md'].baseSha).toBe(await gitBlobSha('a edited\n'))
    gh.calls = []
    await syncOnce(gh, a)
    expect(gh.calls).toEqual(['getHead'])
  })

  it('two devices: edits flow both ways', async () => {
    await gh.commitFiles({ 'A.md': 'one\n' })
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    a.edit('A.md', 'one\ntwo\n')
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    expect(b.text()).toEqual({ 'A.md': 'one\ntwo\n' })
  })

  it('merges non-overlapping edits from two devices', async () => {
    await gh.commitFiles({ 'A.md': 'l1\nl2\nl3\nl4\n' })
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    a.edit('A.md', 'L1 from a\nl2\nl3\nl4\n')
    b.edit('A.md', 'l1\nl2\nl3\nL4 from b\n')
    await syncOnce(gh, a)
    const r = await syncOnce(gh, b)
    expect(r.conflicts).toEqual([])
    expect(gh.files()['A.md']).toBe('L1 from a\nl2\nl3\nL4 from b\n')
    await syncOnce(gh, a)
    expect(a.text()['A.md']).toBe('L1 from a\nl2\nl3\nL4 from b\n')
  })

  it('conflicting edits keep both versions', async () => {
    await gh.commitFiles({ 'A.md': 'same line\n' })
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    a.edit('A.md', 'from a\n')
    b.edit('A.md', 'from b\n')
    await syncOnce(gh, a)
    const r = await syncOnce(gh, b, () => new Date(2026, 9, 12, 9, 5).getTime())
    expect(r.conflicts).toEqual(['A (conflict 2026-10-12 0905).md'])
    expect(b.text()).toEqual({ 'A.md': 'from a\n', 'A (conflict 2026-10-12 0905).md': 'from b\n' })
    expect(gh.files()['A (conflict 2026-10-12 0905).md']).toBe('from b\n')
  })

  it('deletions propagate', async () => {
    await gh.commitFiles({ 'A.md': 'a', 'B.md': 'b' })
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    a.remove('A.md')
    await syncOnce(gh, a)
    expect(Object.keys(gh.files())).toEqual(['B.md'])
    expect(a.data['A.md']).toBeUndefined()
    await syncOnce(gh, b)
    expect(b.text()).toEqual({ 'B.md': 'b' })
  })

  it('editing a note deleted elsewhere keeps the edit', async () => {
    await gh.commitFiles({ 'A.md': 'a' })
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    a.remove('A.md')
    await syncOnce(gh, a)
    b.edit('A.md', 'a but better')
    await syncOnce(gh, b)
    expect(gh.files()).toEqual({ 'A.md': 'a but better' })
  })

  it('deleting a note edited elsewhere brings the edit back', async () => {
    await gh.commitFiles({ 'A.md': 'a' })
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    b.edit('A.md', 'edited')
    await syncOnce(gh, b)
    a.remove('A.md')
    await syncOnce(gh, a)
    expect(a.text()).toEqual({ 'A.md': 'edited' })
    expect(gh.files()).toEqual({ 'A.md': 'edited' })
  })

  it('retries when another device pushes first', async () => {
    await gh.commitFiles({ 'A.md': 'a\n', 'B.md': 'b\n' })
    await syncOnce(gh, a)
    a.edit('A.md', 'a2\n')
    let raced = false
    gh.beforeUpdateHead = async () => {
      if (raced) return
      raced = true
      await gh.commitFiles({ 'B.md': 'b2\n' })
    }
    await syncOnce(gh, a)
    expect(gh.files()).toEqual({ 'A.md': 'a2\n', 'B.md': 'b2\n' })
    expect(a.text()).toEqual({ 'A.md': 'a2\n', 'B.md': 'b2\n' })
  })

  it('typing during a push is never lost', async () => {
    await gh.commitFiles({ 'A.md': 'v1' })
    await syncOnce(gh, a)
    a.edit('A.md', 'v2')
    gh.beforeUpdateHead = () => {
      a.edit('A.md', 'v3 typed mid-sync')
    }
    await syncOnce(gh, a)
    expect(gh.files()['A.md']).toBe('v2')
    expect(a.data['A.md'].content).toBe('v3 typed mid-sync')
    expect(a.data['A.md'].dirty).toBe(true)
    gh.beforeUpdateHead = undefined
    await syncOnce(gh, a)
    expect(gh.files()['A.md']).toBe('v3 typed mid-sync')
    expect(a.data['A.md'].dirty).toBe(false)
  })

  it('typing during a pull is never lost', async () => {
    await gh.commitFiles({ 'A.md': 'top\nmiddle\nbottom' })
    await syncOnce(gh, a)
    await gh.commitFiles({ 'A.md': 'TOP\nmiddle\nbottom' })
    a.edit('A.md', 'top\nmiddle\nbottom')
    gh.onBlobFetch = () => {
      gh.onBlobFetch = undefined
      a.edit('A.md', 'top\nmiddle\nBOTTOM')
    }
    await syncOnce(gh, a)
    // Skipped this round because the note changed underneath; nothing pushed over the remote edit.
    expect(gh.files()['A.md']).toBe('TOP\nmiddle\nbottom')
    expect(a.data['A.md'].content).toBe('top\nmiddle\nBOTTOM')
    await syncOnce(gh, a)
    expect(gh.files()['A.md']).toBe('TOP\nmiddle\nBOTTOM')
    expect(a.data['A.md'].content).toBe('TOP\nmiddle\nBOTTOM')
  })

  it('deleting a note while it is being pushed still deletes it', async () => {
    await gh.commitFiles({ 'Keep.md': 'k' })
    await syncOnce(gh, a)
    a.edit('New.md', 'fresh')
    gh.beforeUpdateHead = () => a.remove('New.md')
    await syncOnce(gh, a)
    expect(a.data['New.md']?.deleted).toBe(true)
    gh.beforeUpdateHead = undefined
    await syncOnce(gh, a)
    expect(Object.keys(gh.files())).toEqual(['Keep.md'])
    expect(a.data['New.md']).toBeUndefined()
  })

  it('seeds an empty repository', async () => {
    a.edit('First.md', 'first')
    a.edit('Second.md', 'second')
    await syncOnce(gh, a)
    expect(gh.files()).toEqual({ 'First.md': 'first', 'Second.md': 'second' })
    expect(Object.values(a.data).every((f) => !f.dirty)).toBe(true)
  })

  it('same new file name on two devices does not lose either', async () => {
    await gh.commitFiles({ 'Keep.md': 'k' })
    await syncOnce(gh, a)
    await syncOnce(gh, b)
    a.edit('Untitled.md', 'from a')
    b.edit('Untitled.md', 'from b')
    await syncOnce(gh, a)
    await syncOnce(gh, b, () => new Date(2026, 0, 2, 3, 4).getTime())
    const all = Object.values(gh.files())
    expect(all).toContain('from a')
    expect(all).toContain('from b')
  })
})

describe('notes folder inside a repo', () => {
  it('only syncs notes under the folder and writes back into it', async () => {
    await gh.commitFiles({ 'README.md': 'repo readme\n', 'notes/A.md': 'a\n', 'notes/Sub/B.md': 'b\n', 'app/x.md': 'code' })
    await syncOnce(gh, a, Date.now, 'notes/')
    expect(a.text()).toEqual({ 'A.md': 'a\n', 'Sub/B.md': 'b\n' })
    a.edit('New.md', 'new\n')
    await syncOnce(gh, a, Date.now, 'notes/')
    expect(gh.files()['notes/New.md']).toBe('new\n')
    expect(gh.files()['New.md']).toBeUndefined()
    expect(gh.files()['README.md']).toBe('repo readme\n')
  })
})
