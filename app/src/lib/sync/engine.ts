import { merge } from 'node-diff3'
import { dirname, isVaultNotePath, joinPath, titleOf } from '../paths'
import type { NoteFile, SyncMeta } from '../types'
import { GitHubError, type GitHubApi, type NewTreeEntry } from './github'
import { gitBlobSha } from './sha'

export type RemoteApi = Pick<
  GitHubApi,
  'getHead' | 'getCommitTree' | 'listBlobs' | 'getBlobText' | 'createTree' | 'createCommit' | 'updateHead' | 'createBranch' | 'initEmptyRepo'
>

// The engine never holds note state itself; it reads a snapshot, does network
// work, then applies results synchronously so typing can't interleave.
export interface VaultAdapter {
  files(): Record<string, NoteFile>
  apply(put: NoteFile[], remove: string[]): void
  meta(): SyncMeta
  setMeta(m: SyncMeta): void
}

export interface SyncResult {
  pulled: string[]
  pushed: string[]
  conflicts: string[] // paths of conflict copies created
}

const keepDir = (dir: string) => !dir.split('/').some((p) => p.startsWith('.')) && dir !== 'app' && dir !== 'node_modules'

export async function syncOnce(api: RemoteApi, vault: VaultAdapter, now: () => number = Date.now): Promise<SyncResult> {
  const result: SyncResult = { pulled: [], pushed: [], conflicts: [] }
  for (let attempt = 0; attempt < 5; attempt++) {
    const head = await api.getHead()
    let meta = vault.meta()
    if (head === null) {
      meta = { head: null, tree: null, remote: {} }
    } else if (head !== meta.head) {
      const tree = await api.getCommitTree(head)
      const blobs = await api.listBlobs(tree, keepDir)
      const remote: Record<string, string> = {}
      for (const b of blobs) if (isVaultNotePath(b.path)) remote[b.path] = b.sha
      meta = { head, tree, remote }
    }
    await reconcile(api, vault, meta.remote, result, now)
    vault.setMeta(meta)
    const outcome = await push(api, vault, meta, result, now)
    if (outcome === 'done') return result
  }
  throw new Error('Sync kept colliding with changes from another device. It will try again shortly.')
}

function conflictPath(path: string, files: Record<string, NoteFile>, now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`
  const base = `${titleOf(path)} (conflict ${stamp})`
  let p = joinPath(dirname(path), `${base}.md`)
  let n = 2
  while (files[p]) p = joinPath(dirname(path), `${base} ${n++}.md`)
  return p
}

async function reconcile(api: RemoteApi, vault: VaultAdapter, remote: Record<string, string>, result: SyncResult, now: () => number) {
  const snapshot = vault.files()
  const paths = new Set([...Object.keys(remote), ...Object.keys(snapshot)])
  type Plan = { path: string; local: NoteFile | undefined; remoteSha: string | undefined }
  const plans: Plan[] = []
  for (const path of paths) {
    const local = snapshot[path]
    const remoteSha = remote[path]
    if (remoteSha && (!local || local.baseSha !== remoteSha)) plans.push({ path, local, remoteSha })
    else if (!remoteSha && local && local.baseSha) plans.push({ path, local, remoteSha })
  }
  if (!plans.length) return

  // Download what we need (in small parallel batches).
  const texts = new Map<string, string>()
  const need = plans.filter((p) => p.remoteSha).map((p) => p.remoteSha!)
  for (let i = 0; i < need.length; i += 6) {
    const batch = [...new Set(need.slice(i, i + 6))]
    const got = await Promise.all(batch.map((sha) => api.getBlobText(sha)))
    batch.forEach((sha, k) => texts.set(sha, got[k]))
  }

  // Apply synchronously, skipping files that changed while we were downloading.
  const current = vault.files()
  const put: NoteFile[] = []
  const remove: string[] = []
  const t = now()
  for (const { path, local, remoteSha } of plans) {
    const cur = current[path]
    if ((cur?.content ?? null) !== (local?.content ?? null) || (cur?.deleted ?? null) !== (local?.deleted ?? null)) continue

    if (remoteSha) {
      const text = texts.get(remoteSha)!
      const fresh: NoteFile = {
        path,
        content: text,
        baseSha: remoteSha,
        baseContent: text,
        dirty: false,
        deleted: false,
        mtime: t,
        ctime: local?.ctime ?? t,
      }
      if (!local || local.deleted || !local.dirty) {
        put.push(fresh)
        result.pulled.push(path)
      } else if (local.content === text) {
        put.push({ ...local, baseSha: remoteSha, baseContent: text, dirty: false })
      } else {
        const m = merge(local.content.split('\n'), (local.baseContent ?? '').split('\n'), text.split('\n'))
        if (!m.conflict) {
          const merged = m.result.join('\n')
          put.push({ ...local, content: merged, baseSha: remoteSha, baseContent: text, dirty: merged !== text, mtime: t })
          result.pulled.push(path)
        } else {
          // Keep the remote version in place and save ours next to it.
          const copy = conflictPath(path, { ...current, ...Object.fromEntries(put.map((f) => [f.path, f])) }, t)
          put.push(fresh)
          put.push({ path: copy, content: local.content, baseSha: null, baseContent: null, dirty: true, deleted: false, mtime: t, ctime: t })
          result.pulled.push(path)
          result.conflicts.push(copy)
        }
      }
    } else if (local) {
      // Deleted on GitHub.
      if (local.deleted || !local.dirty) remove.push(path)
      else put.push({ ...local, baseSha: null, baseContent: null })
      if (!local.deleted && !local.dirty) result.pulled.push(path)
    }
  }
  vault.apply(put, remove)
}

function commitMessage(changes: { path: string; kind: 'add' | 'update' | 'delete' }[]): string {
  if (changes.length === 1) {
    const c = changes[0]
    const verb = c.kind === 'add' ? 'Add' : c.kind === 'delete' ? 'Delete' : 'Update'
    return `${verb} ${titleOf(c.path)}`
  }
  const adds = changes.filter((c) => c.kind === 'add').length
  const dels = changes.filter((c) => c.kind === 'delete').length
  const extra = [adds && `+${adds}`, dels && `-${dels}`].filter(Boolean).join(' ')
  return `Sync ${changes.length} files${extra ? ` (${extra})` : ''}`
}

async function push(api: RemoteApi, vault: VaultAdapter, meta: SyncMeta, result: SyncResult, now: () => number): Promise<'done' | 'retry'> {
  const files = vault.files()
  const entries: NewTreeEntry[] = []
  const sent: { path: string; content: string | null; kind: 'add' | 'update' | 'delete' }[] = []
  for (const f of Object.values(files)) {
    if (!f.dirty) continue
    const r = meta.remote[f.path]
    if (f.deleted) {
      if (f.baseSha && r === f.baseSha) {
        entries.push({ path: f.path, mode: '100644', type: 'blob', sha: null })
        sent.push({ path: f.path, content: null, kind: 'delete' })
      }
      continue
    }
    if ((f.baseSha ?? undefined) !== r) continue // not reconciled yet; next round
    entries.push({ path: f.path, mode: '100644', type: 'blob', content: f.content })
    sent.push({ path: f.path, content: f.content, kind: f.baseSha ? 'update' : 'add' })
  }
  if (!entries.length) return 'done'

  let commit: string
  let tree: string
  const message = commitMessage(sent)
  if (meta.head === null) {
    const adds = entries.filter((e): e is Extract<NewTreeEntry, { content: string }> => 'content' in e)
    if (!adds.length) return 'done'
    try {
      tree = await api.createTree(null, adds)
      commit = await api.createCommit(message, tree, [])
    } catch (e) {
      if (e instanceof GitHubError && e.status === 409) {
        // Brand-new empty repo: seed it with one file, then go around again.
        await api.initEmptyRepo(adds[0].path, adds[0].content, `Add ${titleOf(adds[0].path)}`)
        return 'retry'
      }
      throw e
    }
    if (!(await api.createBranch(commit))) return 'retry'
  } else {
    tree = await api.createTree(meta.tree, entries)
    commit = await api.createCommit(message, tree, [meta.head])
    if (!(await api.updateHead(commit))) return 'retry'
  }

  const shas = await Promise.all(sent.map((s) => (s.content === null ? null : gitBlobSha(s.content))))
  const current = vault.files()
  const put: NoteFile[] = []
  const remove: string[] = []
  const remote = { ...meta.remote }
  const t = now()
  sent.forEach((s, i) => {
    const c = current[s.path]
    if (s.content === null) {
      delete remote[s.path]
      if (!c || c.deleted) remove.push(s.path)
      else put.push({ ...c, baseSha: null, baseContent: null, dirty: true })
      return
    }
    const sha = shas[i]!
    remote[s.path] = sha
    if (!c) {
      // Deleted while we were pushing: make sure the deletion follows.
      put.push({ path: s.path, content: '', baseSha: sha, baseContent: s.content, dirty: true, deleted: true, mtime: t, ctime: t })
    } else if (c.deleted) {
      put.push({ ...c, baseSha: sha, baseContent: s.content })
    } else {
      put.push({ ...c, baseSha: sha, baseContent: s.content, dirty: c.content !== s.content })
    }
  })
  vault.apply(put, remove)
  vault.setMeta({ head: commit, tree, remote })
  result.pushed.push(...sent.map((s) => s.path))
  return 'done'
}

