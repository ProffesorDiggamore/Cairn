import type { JSONContent } from '@tiptap/core'

// TipTap JSON -> Markdown. Output follows Obsidian conventions: `-` bullets,
// `- [ ]` tasks, `==highlight==`, `[[wikilinks]]`, `> [!note]` callouts.

type Mark = { type: string; attrs?: Record<string, any> }

export function docToMarkdown(doc: JSONContent): string {
  const content = [...(doc.content ?? [])]
  while (content.length && isEmptyParagraph(content[content.length - 1])) content.pop()
  const out = blocks(content, true)
  return out.trim() ? out + '\n' : ''
}

function isEmptyParagraph(n: JSONContent) {
  return n.type === 'paragraph' && (!n.content || n.content.length === 0)
}

function blocks(nodes: JSONContent[] = [], top = false): string {
  const parts: string[] = []
  for (const n of nodes) {
    if (!top && isEmptyParagraph(n)) continue
    parts.push(block(n))
  }
  return parts.join('\n\n')
}

function textOf(n: JSONContent): string {
  return (n.content ?? []).map((c) => (c.type === 'hardBreak' ? '\n' : (c.text ?? ''))).join('')
}

function prefixLines(s: string, prefix: string, emptyPrefix: string) {
  return s
    .split('\n')
    .map((l) => (l ? prefix + l : emptyPrefix))
    .join('\n')
}

function block(n: JSONContent): string {
  switch (n.type) {
    case 'paragraph':
      return renderInline(n.content)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)))
      const text = renderInline(n.content, { heading: true }).replace(/(^|\s)(#+)$/, '$1\\$2')
      return '#'.repeat(level) + (text ? ' ' + text : '')
    }
    case 'blockquote':
      return prefixLines(blocks(n.content) || '', '> ', '>')
    case 'callout': {
      const kind = String(n.attrs?.kind || 'note')
      const fold = n.attrs?.fold === '+' || n.attrs?.fold === '-' ? n.attrs.fold : ''
      const title = String(n.attrs?.title ?? '').replace(/\n/g, ' ').trim()
      const head = `[!${kind}]${fold}${title ? ' ' + title : ''}`
      const body = blocks(n.content)
      return prefixLines(body ? `${head}\n${body}` : head, '> ', '>')
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return listBlock(n)
    case 'codeBlock': {
      const text = textOf(n)
      const lang = n.attrs?.language ? String(n.attrs.language) : ''
      let fence = '```'
      while (text.includes(fence)) fence += '`'
      return text ? `${fence}${lang}\n${text}\n${fence}` : `${fence}${lang}\n${fence}`
    }
    case 'horizontalRule':
      return '---'
    case 'image':
      return imageMd(n)
    case 'table':
      return tableBlock(n)
    case 'rawBlock':
      return textOf(n)
    default:
      return n.content ? blocks(n.content) : ''
  }
}

function imageMd(n: JSONContent): string {
  const alt = String(n.attrs?.alt ?? '').replace(/([[\]\\])/g, '\\$1')
  const src = String(n.attrs?.src ?? '')
  const dest = /[\s()<>]/.test(src) ? `<${src.replace(/[<>]/g, encodeURIComponent)}>` : src
  const title = n.attrs?.title ? ` "${String(n.attrs.title).replace(/"/g, '\\"')}"` : ''
  return `![${alt}](${dest}${title})`
}

function listBlock(n: JSONContent): string {
  let num = Number(n.attrs?.start ?? 1) || 1
  return (n.content ?? [])
    .map((item) => {
      let marker: string
      let indent: number
      if (n.type === 'taskList') {
        marker = `- [${item.attrs?.checked ? 'x' : ' '}] `
        indent = 2
      } else if (n.type === 'orderedList') {
        marker = `${num++}. `
        indent = marker.length
      } else {
        marker = '- '
        indent = 2
      }
      const lines = itemBody(item.content ?? []).split('\n')
      const first = lines[0]
      const rest = lines.slice(1).map((l) => (l ? ' '.repeat(indent) + l : ''))
      const head = first ? marker + first : n.type === 'taskList' ? marker : marker.trimEnd()
      return [head, ...rest].join('\n')
    })
    .join('\n')
}

function itemBody(children: JSONContent[]): string {
  let out = ''
  children.forEach((c, i) => {
    if (i === 0) {
      out = block(c)
      return
    }
    if (isEmptyParagraph(c)) return
    out += (/List$/.test(c.type ?? '') ? '\n' : '\n\n') + block(c)
  })
  return out
}

function tableBlock(n: JSONContent): string {
  const rowsJson = n.content ?? []
  if (!rowsJson.length) return ''
  const rows = rowsJson.map((r) => (r.content ?? []).map(cellText))
  const width = Math.max(1, ...rows.map((r) => r.length))
  rows.forEach((r) => {
    while (r.length < width) r.push('')
  })
  const aligns = Array.from({ length: width }, (_, i) => rowsJson[0].content?.[i]?.attrs?.align ?? null)
  const fmt = (r: string[]) => `| ${r.join(' | ')} |`
  const delim = `| ${aligns
    .map((a) => (a === 'center' ? ':---:' : a === 'left' ? ':---' : a === 'right' ? '---:' : '---'))
    .join(' | ')} |`
  return [fmt(rows[0]), delim, ...rows.slice(1).map(fmt)].join('\n')
}

function cellText(cell: JSONContent): string {
  return (cell.content ?? [])
    .filter((p) => !isEmptyParagraph(p))
    .map((p) =>
      p.type === 'paragraph' ? renderInline(p.content, { table: true }) : block(p).replace(/\|/g, '\\|').replace(/\n/g, '<br>'),
    )
    .join('<br>')
}

// ---------------------------------------------------------------- inline

interface InlineCtx {
  table?: boolean
  heading?: boolean
  inLink?: boolean
}

const PRIORITY: Record<string, number> = { link: 0, bold: 1, italic: 2, strike: 3, highlight: 4, underline: 5 }

function openDelim(m: Mark): string {
  switch (m.type) {
    case 'bold':
      return '**'
    case 'italic':
      return '*'
    case 'strike':
      return '~~'
    case 'highlight':
      return '=='
    case 'underline':
      return '<u>'
    case 'link':
      return '['
  }
  return ''
}

function closeDelim(m: Mark): string {
  switch (m.type) {
    case 'underline':
      return '</u>'
    case 'link': {
      const href = String(m.attrs?.href ?? '')
      const dest = /[\s()<>]/.test(href) || href === '' ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href
      const title = m.attrs?.title ? ` "${String(m.attrs.title).replace(/"/g, '\\"')}"` : ''
      return `](${dest}${title})`
    }
  }
  return openDelim(m)
}

function sameMark(a: Mark, b: Mark) {
  return a.type === b.type && (a.type !== 'link' || a.attrs?.href === b.attrs?.href)
}

function renderInline(nodes: JSONContent[] = [], ctx: InlineCtx = {}): string {
  let out = ''
  let lineStart = true
  const stack: { mark: Mark; start: number; delim: string }[] = []
  const items = nodes.map((node) => {
    const all = (node.marks ?? []) as Mark[]
    return {
      node,
      code: all.some((m) => m.type === 'code'),
      marks: all.filter((m) => m.type in PRIORITY),
    }
  })
  const extent = (from: number, m: Mark) => {
    let i = from
    while (i < items.length && items[i].marks.some((x) => sameMark(x, m))) i++
    return i - from
  }

  const closeTo = (keep: number, nextText: string) => {
    while (stack.length > keep) {
      const { mark, start, delim } = stack.pop()!
      const inner = out.slice(start)
      if (!inner.trim()) {
        out = out.slice(0, start - delim.length) + inner
        continue
      }
      const trail = /\s*$/.exec(inner)![0]
      const body = inner.slice(0, inner.length - trail.length)
      if (mark.type === 'link') {
        const href = String(mark.attrs?.href ?? '')
        const bare = body === href && /^https?:\/\/[^\s<>()]+$/.test(href) && !mark.attrs?.title
        if (bare && (trail || /^($|[\s.,;:!?])/.test(nextText))) {
          out = out.slice(0, start - delim.length) + body + trail
          continue
        }
      }
      out = out.slice(0, start) + body + closeDelim(mark) + trail
    }
  }

  for (let i = 0; i < items.length; i++) {
    const { node, marks, code } = items[i]
    const nextText = node.type === 'text' ? (node.text ?? '') : ' '
    let keep = 0
    while (keep < stack.length && marks.some((m) => sameMark(m, stack[keep].mark))) keep++
    closeTo(keep, nextText)
    const toOpen = marks.filter((m) => !stack.some((s) => sameMark(s.mark, m)))
    toOpen.sort((a, b) => extent(i, b) - extent(i, a) || PRIORITY[a.type] - PRIORITY[b.type])

    let rendered = ''
    switch (node.type) {
      case 'text': {
        const text = node.text ?? ''
        if (code) {
          rendered = codeSpan(text, ctx)
          lineStart = false
        } else {
          const lines = text.split('\n')
          rendered = lines
            .map((line, li) => {
              if (li > 0) lineStart = true
              const inLink = marks.some((m) => m.type === 'link')
              const s = escapeText(lineStart ? line.replace(/^[ \t]+/, '') : line, { ...ctx, inLink }, lineStart, i, items)
              if (s) lineStart = false
              return s
            })
            .join(ctx.table ? '<br>' : ctx.heading ? ' ' : '\n')
        }
        break
      }
      case 'hardBreak':
        rendered = ctx.table ? '<br>' : ctx.heading ? ' ' : '\n'
        if (!ctx.table && !ctx.heading) lineStart = true
        break
      case 'wikiLink': {
        const target = String(node.attrs?.target ?? '')
        const alias = node.attrs?.alias ? (ctx.table ? '\\|' : '|') + node.attrs.alias : ''
        rendered = `${node.attrs?.embed ? '!' : ''}[[${target}${alias}]]`
        lineStart = false
        break
      }
      case 'rawInline':
        rendered = String(node.attrs?.text ?? '')
        lineStart = false
        break
      case 'image':
        rendered = imageMd(node)
        lineStart = false
        break
      default:
        rendered = node.text ?? ''
    }

    if (toOpen.length) {
      const lead = code ? '' : /^[ \t]*/.exec(rendered)![0]
      out += lead
      rendered = rendered.slice(lead.length)
      for (const m of toOpen) {
        const d = openDelim(m)
        out += d
        stack.push({ mark: m, start: out.length, delim: d })
      }
    }
    out += rendered
  }
  closeTo(0, '')
  return out.replace(/[ \t]+(?=\n|$)/g, '')
}

function codeSpan(text: string, ctx: InlineCtx): string {
  const lens = new Set((text.match(/`+/g) ?? []).map((r) => r.length))
  let len = 1
  while (lens.has(len)) len++
  const fence = '`'.repeat(len)
  const pad = text.startsWith('`') || text.endsWith('`') || (/^ .* $/.test(text) && text.trim()) ? ' ' : ''
  const body = ctx.table ? text.replace(/\|/g, '\\|') : text
  return fence + pad + body + pad + fence
}

const PUNCT = /[!-/:-@[-`{-~]/
const isAlnum = (c: string) => !!c && /[\p{L}\p{N}]/u.test(c)
const HIGHLIGHT_RE = /^==(?=[^\s=])[\s\S]*?[^\s\\]==(?!=)/
const MATH_RE = /^\$(?![\s$])[^$\n]*?[^\s\\]\$(?!\d)/

function neighbourChar(items: { node: JSONContent }[], i: number, dir: -1 | 1): string {
  const n = items[i + dir]?.node
  if (!n) return ''
  if (n.type !== 'text') return 'x' // atoms behave like word characters
  const t = n.text ?? ''
  return dir < 0 ? t.slice(-1) : t.slice(0, 1)
}

function escapeText(text: string, ctx: InlineCtx, lineStart: boolean, idx: number, items: { node: JSONContent }[]): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const prev = i > 0 ? text[i - 1] : neighbourChar(items, idx, -1)
    const next = i + 1 < text.length ? text[i + 1] : neighbourChar(items, idx, 1)
    switch (c) {
      case '\\':
        out += next === '' || PUNCT.test(next) ? '\\\\' : '\\'
        break
      case '*':
      case '`':
      case '~':
        out += '\\' + c
        break
      case '_':
        out += isAlnum(prev) && isAlnum(next) ? '_' : '\\_'
        break
      case '[':
        out += next === '[' || /^\[[^\]]*\][([]/.test(text.slice(i)) || ctx.inLink ? '\\[' : '['
        break
      case ']':
        out += ctx.inLink ? '\\]' : ']'
        break
      case '<':
        out += /[A-Za-z/!?]/.test(next) ? '\\<' : '<'
        break
      case '&':
        out += /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(text.slice(i)) ? '\\&' : '&'
        break
      case '=':
        if (next === '=' && HIGHLIGHT_RE.test(text.slice(i))) {
          out += '\\=\\='
          i++
        } else out += '='
        break
      case '$':
        out += MATH_RE.test(text.slice(i)) ? '\\$' : '$'
        break
      case '|':
        out += ctx.table ? '\\|' : '|'
        break
      default:
        out += c
    }
  }
  if (lineStart && !ctx.heading && !ctx.table) out = escapeLineStart(out)
  return out
}

function escapeLineStart(s: string): string {
  if (/^#{1,6}(\s|$)/.test(s)) return '\\' + s
  if (/^>/.test(s)) return '\\' + s
  if (/^[-+](\s|$)/.test(s)) return '\\' + s
  if (/^(=+|-+)[ \t]*$/.test(s)) return '\\' + s
  if (/^\$\$/.test(s)) return '\\' + s
  if (/^\[[^\]]+\]:[ \t]*(<[^>]*>|\S+)([ \t]+("[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/.test(s)) return '\\' + s
  if (/^\[[ xX]\](\s|$)/.test(s)) return '\\' + s
  const m = /^(\d{1,9})([.)])(\s|$)/.exec(s)
  if (m) return m[1] + '\\' + s.slice(m[1].length)
  return s
}
