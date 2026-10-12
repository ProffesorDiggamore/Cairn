// Vault paths are POSIX-style, relative to the repo root: "Folder/Note.md".

export const NOTE_EXT = '.md'

// Folders that belong to the app or to git tooling, never to the vault.
const IGNORED_TOP = new Set(['app', 'node_modules'])

export function isVaultNotePath(path: string): boolean {
  if (!path.toLowerCase().endsWith(NOTE_EXT)) return false
  const parts = path.split('/')
  if (IGNORED_TOP.has(parts[0])) return false
  return !parts.some((p) => p.startsWith('.') || p === '')
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function titleOf(path: string): string {
  const b = basename(path)
  return b.toLowerCase().endsWith(NOTE_EXT) ? b.slice(0, -NOTE_EXT.length) : b
}

export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name
}

// Characters that break file systems or Obsidian links.
export function sanitizeTitle(raw: string): string {
  const t = raw
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim()
  return t
}

export function sanitizeFolder(raw: string): string {
  return raw
    .split('/')
    .map((p) => sanitizeTitle(p))
    .filter(Boolean)
    .join('/')
}

export function uniqueNotePath(folder: string, title: string, exists: (path: string) => boolean): string {
  const base = sanitizeTitle(title) || 'Untitled'
  let candidate = joinPath(folder, base + NOTE_EXT)
  let n = 2
  while (exists(candidate)) candidate = joinPath(folder, `${base} ${n++}${NOTE_EXT}`)
  return candidate
}

export function isInFolder(path: string, folder: string): boolean {
  return folder === '' ? true : path.startsWith(folder + '/')
}

export function ancestors(path: string): string[] {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}
