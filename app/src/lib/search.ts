import { splitFrontmatter } from './markdown/frontmatter'
import { titleOf } from './paths'

export interface SearchHit {
  path: string
  title: string
  score: number
  snippet: { before: string; match: string; after: string } | null
}

function fuzzy(hay: string, needle: string): boolean {
  let i = 0
  for (const c of hay) if (c === needle[i]) i++
  return i === needle.length
}

// Strip markdown punctuation so snippets read like prose.
function plain(md: string): string {
  return splitFrontmatter(md)
    .body.replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t, a) => a || t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^[ \t]*(#{1,6}|>|[-*+]( \[[ xX]\])?|\d+\.)[ \t]+/gm, '')
    .replace(/[*_`~=]{1,3}/g, '')
}

export function searchNotes(notes: { path: string; content: string }[], query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  const hits: SearchHit[] = []
  for (const n of notes) {
    const title = titleOf(n.path)
    const t = title.toLowerCase()
    const body = plain(n.content)
    const b = body.toLowerCase()
    let score = 0
    if (t === q) score += 120
    else if (t.startsWith(q)) score += 90
    else if (t.includes(q)) score += 70
    else if (words.every((w) => t.includes(w))) score += 55
    else if (fuzzy(t, q.replace(/\s/g, ''))) score += 25

    let snippet: SearchHit['snippet'] = null
    const idx = b.indexOf(q)
    if (idx >= 0) {
      score += 20 + Math.min(10, b.split(q).length - 1)
      snippet = cut(body, idx, q.length)
    } else if (words.length > 1 && words.every((w) => b.includes(w) || t.includes(w))) {
      score += 12
      const first = words.map((w) => b.indexOf(w)).filter((i) => i >= 0)
      if (first.length) {
        const i = Math.min(...first)
        const w = words.find((x) => b.indexOf(x) === i)!
        snippet = cut(body, i, w.length)
      }
    }
    if (score > 0) hits.push({ path: n.path, title, score, snippet })
  }
  return hits.sort((x, y) => y.score - x.score || x.title.localeCompare(y.title)).slice(0, limit)
}

function cut(body: string, i: number, len: number) {
  const start = Math.max(0, i - 40)
  const end = Math.min(body.length, i + len + 80)
  return {
    before: (start > 0 ? '…' : '') + body.slice(start, i).replace(/\s+/g, ' ').trimStart(),
    match: body.slice(i, i + len),
    after: body.slice(i + len, end).replace(/\s+/g, ' ') + (end < body.length ? '…' : ''),
  }
}
