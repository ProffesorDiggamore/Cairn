import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyFiles, createNote, deleteNote, getNote, moveFolder, renameNote, restoreFromTrash, updateContent, useVault } from './vault'
import { buildLinkIndex, LinkResolver } from './links'
import { EMPTY_META, type NoteFile } from './types'

const synced = (path: string, content: string): NoteFile => ({
  path,
  content,
  baseSha: 'sha-' + path,
  baseContent: content,
  dirty: false,
  deleted: false,
  mtime: 0,
  ctime: 0,
})

beforeEach(() => {
  useVault.setState({ ready: true, files: {}, paths: [], folders: [], trash: [], meta: EMPTY_META })
})

describe('vault actions', () => {
  it('creates Untitled, Untitled 2, …', () => {
    expect(createNote()).toBe('Untitled.md')
    expect(createNote()).toBe('Untitled 2.md')
    expect(createNote({ folder: 'Work', title: 'Plan' })).toBe('Work/Plan.md')
    expect(useVault.getState().paths).toEqual(['Untitled.md', 'Untitled 2.md', 'Work/Plan.md'])
  })

  it('editing back to the synced text clears the dirty flag', () => {
    applyFiles([synced('A.md', 'hello')])
    updateContent('A.md', 'hello!')
    expect(getNote('A.md')!.dirty).toBe(true)
    updateContent('A.md', 'hello')
    expect(getNote('A.md')!.dirty).toBe(false)
  })

  it('rename rewrites links in other notes and keeps aliases/headings', () => {
    applyFiles([
      synced('Old Name.md', 'self [[Old Name#top]]'),
      synced('Other.md', 'see [[Old Name]], [[old name|alias]] and [[Old Name#Part]] but not `[[Old Name]]`'),
    ])
    const p = renameNote('Old Name.md', 'New Name')
    expect(p).toBe('New Name.md')
    expect(getNote('Other.md')!.content).toBe('see [[New Name]], [[New Name|alias]] and [[New Name#Part]] but not `[[Old Name]]`')
    expect(getNote('New Name.md')!.content).toBe('self [[New Name#top]]')
    // Old path becomes a tombstone so the deletion syncs.
    expect(useVault.getState().files['Old Name.md'].deleted).toBe(true)
  })

  it('delete moves to trash and restore brings it back', () => {
    applyFiles([synced('A.md', 'body')])
    deleteNote('A.md')
    expect(getNote('A.md')).toBeUndefined()
    const t = useVault.getState().trash[0]
    expect(t.content).toBe('body')
    expect(restoreFromTrash(t.id)).toBe('A.md')
    expect(getNote('A.md')!.content).toBe('body')
    // Reuses the tombstone's base so it syncs as an edit, not a clash.
    expect(getNote('A.md')!.baseSha).toBe('sha-A.md')
  })

  it('moving a folder moves its notes', () => {
    applyFiles([synced('School/Math.md', 'm'), synced('School/Bio/Cells.md', 'c'), synced('Root.md', 'r')])
    moveFolder('School', 'Classes')
    expect(useVault.getState().paths).toEqual(['Classes/Bio/Cells.md', 'Classes/Math.md', 'Root.md'])
  })
})

describe('links', () => {
  it('resolves by name, path, and prefers the same folder', () => {
    const r = new LinkResolver(['A.md', 'Work/Plan.md', 'Home/Plan.md', 'Deep/Nested/Thing.md'])
    expect(r.resolve('a')).toBe('A.md')
    expect(r.resolve('Plan', 'Home/Other.md')).toBe('Home/Plan.md')
    expect(r.resolve('Work/Plan')).toBe('Work/Plan.md')
    expect(r.resolve('Nested/Thing')).toBe('Deep/Nested/Thing.md')
    expect(r.resolve('Thing#Heading')).toBe('Deep/Nested/Thing.md')
    expect(r.resolve('missing')).toBeNull()
    expect(r.resolve('image.png')).toBeNull()
  })

  it('builds backlinks and unresolved links', () => {
    const idx = buildLinkIndex([
      { path: 'A.md', content: 'to [[B]] and [[Ghost]]' },
      { path: 'B.md', content: 'back to [[A]]' },
    ])
    expect([...idx.incoming.get('B.md')!]).toEqual(['A.md'])
    expect([...idx.incoming.get('A.md')!]).toEqual(['B.md'])
    expect([...idx.unresolved.get('A.md')!]).toEqual(['Ghost'])
  })
})
