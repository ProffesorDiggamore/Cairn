import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { EMPTY_META, type NoteFile, type SyncMeta, type TrashItem } from './types'

interface CairnDB extends DBSchema {
  files: { key: string; value: NoteFile }
  trash: { key: string; value: TrashItem }
  meta: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<CairnDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<CairnDB>('cairn', 1, {
      upgrade(d) {
        d.createObjectStore('files', { keyPath: 'path' })
        d.createObjectStore('trash', { keyPath: 'id' })
        d.createObjectStore('meta')
      },
    })
  }
  return dbPromise
}

export async function loadAll(): Promise<{ files: NoteFile[]; trash: TrashItem[]; meta: SyncMeta; folders: string[] }> {
  const d = await db()
  const [files, trash, meta, folders] = await Promise.all([
    d.getAll('files'),
    d.getAll('trash'),
    d.get('meta', 'sync') as Promise<SyncMeta | undefined>,
    d.get('meta', 'folders') as Promise<string[] | undefined>,
  ])
  return { files, trash, meta: meta ?? EMPTY_META, folders: folders ?? [] }
}

// Writes are queued so they land in the order they were made.
let queue: Promise<unknown> = Promise.resolve()
function enqueue(fn: (d: IDBPDatabase<CairnDB>) => Promise<unknown>) {
  queue = queue.then(() => db().then(fn)).catch((e) => console.error('[cairn] storage error', e))
  return queue
}

export function persistFiles(put: NoteFile[], remove: string[] = []) {
  if (!put.length && !remove.length) return queue
  return enqueue(async (d) => {
    const tx = d.transaction('files', 'readwrite')
    for (const f of put) tx.store.put(f)
    for (const p of remove) tx.store.delete(p)
    await tx.done
  })
}

export function persistTrash(put: TrashItem[], remove: string[] = []) {
  return enqueue(async (d) => {
    const tx = d.transaction('trash', 'readwrite')
    for (const t of put) tx.store.put(t)
    for (const id of remove) tx.store.delete(id)
    await tx.done
  })
}

export function persistMeta(meta: SyncMeta) {
  return enqueue((d) => d.put('meta', meta, 'sync'))
}

export function persistFolders(folders: string[]) {
  return enqueue((d) => d.put('meta', folders, 'folders'))
}

export function flushWrites() {
  return queue
}

export async function clearAll() {
  const d = await db()
  await Promise.all([d.clear('files'), d.clear('trash'), d.clear('meta')])
}
