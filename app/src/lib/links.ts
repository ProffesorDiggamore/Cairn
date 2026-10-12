import { basename, dirname, titleOf } from './paths'

// Obsidian-style [[wikilink]] parsing and resolution.

const WIKI_RE = /(!?)\[\[([^[\]\n]+?)\]\]/g

export interface RawLink {
  target: string // as written, without alias
  alias: string | null
  embed: boolean
  index: number // offset in the markdown
  length: number
}

// Blank out code so links inside it aren't counted.
function maskCode(md: string): string {
  return md
    .replace(/(^|\n)(```|~~~)[\s\S]*?(\n\2[^\n]*|$)/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))
}

export function extractLinks(md: string): RawLink[] {
  const masked = maskCode(md)
  const out: RawLink[] = []
  for (const m of masked.matchAll(WIKI_RE)) {
    const inner = md.slice(m.index! + m[1].length + 2, m.index! + m[0].length - 2)
    const [target, ...rest] = inner.split(/\\?\|/)
    if (!target.trim()) continue
    out.push({ target: target.trim(), alias: rest.length ? rest.join('|').trim() : null, embed: m[1] === '!', index: m.index!, length: m[0].length })
  }
  return out
}

export function stripSubpath(target: string): string {
  return target.split('#')[0].split('^')[0].trim()
}

export class LinkResolver {
  private byPath = new Map<string, string>()
  private byName = new Map<string, string[]>()

  constructor(paths: string[]) {
    for (const p of paths) {
      const noExt = p.replace(/\.md$/i, '').toLowerCase()
      this.byPath.set(noExt, p)
      const name = basename(noExt)
      const list = this.byName.get(name)
      if (list) list.push(p)
      else this.byName.set(name, [p])
    }
  }

  resolve(target: string, from?: string): string | null {
    let t = stripSubpath(target)
    if (!t) return from ?? null
    if (/\.md$/i.test(t)) t = t.slice(0, -3)
    else if (/\.[a-z0-9]{2,5}$/i.test(t) && !this.byName.has(basename(t.toLowerCase()))) return null
    const lower = t.toLowerCase().replace(/^\/+/, '')
    if (lower.includes('/')) {
      const exact = this.byPath.get(lower)
      if (exact) return exact
      const suffix = [...this.byPath.entries()].find(([k]) => k.endsWith('/' + lower))
      if (suffix) return suffix[1]
    }
    const candidates = this.byName.get(basename(lower))
    if (!candidates?.length) return null
    if (candidates.length === 1) return candidates[0]
    const here = from ? dirname(from) : ''
    return candidates.find((c) => dirname(c) === here) ?? [...candidates].sort((a, b) => a.length - b.length)[0]
  }

  // The shortest text that still points at `path` (Obsidian's default style).
  linkTextFor(path: string): string {
    const name = titleOf(path)
    const same = this.byName.get(name.toLowerCase()) ?? []
    return same.length > 1 ? path.replace(/\.md$/i, '') : name
  }
}

export interface LinkIndex {
  outgoing: Map<string, Set<string>> // path -> resolved targets
  unresolved: Map<string, Set<string>> // path -> names that point nowhere
  incoming: Map<string, Set<string>> // path -> notes linking here
}

export function buildLinkIndex(notes: { path: string; content: string }[]): LinkIndex {
  const resolver = new LinkResolver(notes.map((n) => n.path))
  const outgoing = new Map<string, Set<string>>()
  const unresolved = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()
  for (const n of notes) {
    const out = new Set<string>()
    const missing = new Set<string>()
    for (const l of extractLinks(n.content)) {
      const r = resolver.resolve(l.target, n.path)
      if (r && r !== n.path) out.add(r)
      else if (!r && !/\.[a-z0-9]{2,5}$/i.test(stripSubpath(l.target))) missing.add(stripSubpath(l.target))
    }
    outgoing.set(n.path, out)
    if (missing.size) unresolved.set(n.path, missing)
    for (const t of out) {
      const s = incoming.get(t)
      if (s) s.add(n.path)
      else incoming.set(t, new Set([n.path]))
    }
  }
  return { outgoing, unresolved, incoming }
}

// Lines in `content` that link to `target`, for the backlinks panel.
export function linkContexts(content: string, from: string, target: string, resolver: LinkResolver): string[] {
  const lines = content.split('\n')
  const out: string[] = []
  let offset = 0
  const links = extractLinks(content)
  for (const line of lines) {
    const end = offset + line.length
    if (links.some((l) => l.index >= offset && l.index < end && resolver.resolve(l.target, from) === target)) out.push(line.trim())
    offset = end + 1
  }
  return out
}

// Rewrite [[links]] that pointed at `oldPath` after a rename.
export function rewriteLinks(content: string, from: string, oldPath: string, newPath: string, before: LinkResolver, after: LinkResolver): string {
  const links = extractLinks(content)
  if (!links.length) return content
  let out = ''
  let last = 0
  for (const l of links) {
    if (before.resolve(l.target, from) !== oldPath) continue
    const sub = l.target.slice(stripSubpath(l.target).length)
    const newTarget = after.linkTextFor(newPath) + sub
    const alias = l.alias ? `|${l.alias}` : ''
    out += content.slice(last, l.index) + `${l.embed ? '!' : ''}[[${newTarget}${alias}]]`
    last = l.index + l.length
  }
  return last === 0 ? content : out + content.slice(last)
}
