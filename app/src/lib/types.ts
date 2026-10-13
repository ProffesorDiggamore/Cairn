export interface NoteFile {
  path: string
  content: string
  // Blob sha + text of this file at the last successful sync. null = never synced.
  baseSha: string | null
  baseContent: string | null
  // Local changes not yet pushed.
  dirty: boolean
  // Deleted locally, waiting for the deletion to be pushed.
  deleted: boolean
  mtime: number
  ctime: number
}

export interface TrashItem {
  id: string
  path: string
  content: string
  deletedAt: number
}

export interface SyncMeta {
  head: string | null // commit sha of the branch at last sync
  tree: string | null // root tree sha of that commit
  remote: Record<string, string> // path -> blob sha of vault notes at `head`
}

export interface SyncConfig {
  owner: string
  repo: string
  branch: string
  token: string
  /** Folder inside the repo that holds the notes ('' = the whole repo). */
  folder?: string
}

export const EMPTY_META: SyncMeta = { head: null, tree: null, remote: {} }
