// Page icons you make yourself. A page icon is stored in the note's
// frontmatter as one of:
//   icon: 📚                          an emoji (Obsidian-compatible)
//   icon: "ci:1|q|4f7cff,9b5cff|ffffff|i:rocket"   a made icon (this file)
//   icon: "data:image/webp;base64,…"   a tiny uploaded picture (64 px)
//
// A made icon is a short text recipe, not a picture: shape | background |
// glyph colour | glyph. That keeps notes small and the icon crisp at any size.

export type IconShape = 'circle' | 'squircle' | 'square' | 'none'

export type Glyph =
  | { kind: 'icon'; name: string }
  | { kind: 'emoji'; value: string }
  | { kind: 'text'; value: string }
  | { kind: 'pixels'; size: number; palette: string[]; cells: number[] } // cells: palette index, -1 = clear

export interface IconSpec {
  shape: IconShape
  bg: string[] // 0 (none), 1 (solid) or 2 (gradient) hex colours without '#'
  fg: string
  glyph: Glyph
}

const SHAPES: Record<string, IconShape> = { c: 'circle', q: 'squircle', s: 'square', n: 'none' }
const SHAPE_CODE: Record<IconShape, string> = { circle: 'c', squircle: 'q', square: 's', none: 'n' }

const hex = (s: string) => /^[0-9a-f]{6}$/i.test(s)

// Pixel cells as a run-length string: "<count><letter>" where a = palette[0], b = palette[1]…, "." = clear.
function packCells(cells: number[]): string {
  let out = ''
  for (let i = 0; i < cells.length; ) {
    let j = i
    while (j < cells.length && cells[j] === cells[i]) j++
    const n = j - i
    const ch = cells[i] < 0 ? '.' : String.fromCharCode(97 + cells[i])
    out += (n > 1 ? n : '') + ch
    i = j
  }
  return out
}

function unpackCells(s: string, total: number): number[] {
  const out: number[] = []
  for (const m of s.matchAll(/(\d*)([a-z.])/g)) {
    const n = m[1] ? Number(m[1]) : 1
    const v = m[2] === '.' ? -1 : m[2].charCodeAt(0) - 97
    for (let k = 0; k < n && out.length < total; k++) out.push(v)
  }
  while (out.length < total) out.push(-1)
  return out
}

export function encodeIcon(spec: IconSpec): string {
  const g = spec.glyph
  const glyph =
    g.kind === 'icon'
      ? `i:${g.name}`
      : g.kind === 'emoji'
        ? `e:${g.value}`
        : g.kind === 'text'
          ? `t:${g.value.replace(/\|/g, '')}`
          : `p:${g.size}:${g.palette.join(',')}:${packCells(g.cells)}`
  return ['ci:1', SHAPE_CODE[spec.shape], spec.bg.join(','), spec.fg, glyph].join('|')
}

export function decodeIcon(value: string | null | undefined): IconSpec | null {
  if (!value || !value.startsWith('ci:1|')) return null
  const parts = value.split('|')
  if (parts.length < 5) return null
  const [, s, bg, fg] = parts
  const raw = parts.slice(4).join('|')
  let glyph: Glyph
  if (raw.startsWith('i:')) glyph = { kind: 'icon', name: raw.slice(2) }
  else if (raw.startsWith('e:')) glyph = { kind: 'emoji', value: raw.slice(2) }
  else if (raw.startsWith('t:')) glyph = { kind: 'text', value: raw.slice(2, 5) }
  else if (raw.startsWith('p:')) {
    const [, sizeS, pal, data] = raw.split(':')
    const size = Math.min(32, Math.max(4, Number(sizeS) || 16))
    const palette = (pal ?? '').split(',').filter(hex).slice(0, 26)
    glyph = { kind: 'pixels', size, palette, cells: unpackCells(data ?? '', size * size) }
  } else return null
  return {
    shape: SHAPES[s] ?? 'squircle',
    bg: (bg ?? '').split(',').filter(hex).slice(0, 2),
    fg: hex(fg ?? '') ? fg : 'ffffff',
    glyph,
  }
}

export const isImageIcon = (v: string | null | undefined) => !!v && /^data:image\/(png|webp|jpeg|gif|svg\+xml);base64,/.test(v)
export const isCustomIcon = (v: string | null | undefined) => !!v && v.startsWith('ci:1|')

export const PRESET_BACKGROUNDS: string[][] = [
  ['4f7cff', '9b5cff'],
  ['ff6a88', 'ff99ac'],
  ['f7971e', 'ffd200'],
  ['11998e', '38ef7d'],
  ['00c6ff', '0072ff'],
  ['434343', '000000'],
  ['ee0979', 'ff6a00'],
  ['8e2de2', '4a00e0'],
  ['e0e0e0', 'ffffff'],
  ['2c3e50', '4ca1af'],
  ['2383e2'],
  ['448361'],
  ['d44c47'],
  ['37352f'],
]

export const PRESET_COLORS = ['ffffff', '37352f', '000000', '2383e2', '9b5cff', 'ff6a88', 'f7971e', 'ffd200', '38ef7d', '11998e', 'd44c47', '8b5a2b']

export function defaultSpec(): IconSpec {
  return { shape: 'squircle', bg: ['4f7cff', '9b5cff'], fg: 'ffffff', glyph: { kind: 'icon', name: 'sparkles' } }
}

export function blankPixels(size = 12): Glyph {
  return { kind: 'pixels', size, palette: ['ffffff', '37352f', 'ff6a88', 'ffd200', '38ef7d', '2383e2'], cells: Array(size * size).fill(-1) }
}

export function background(spec: IconSpec): string | undefined {
  if (spec.shape === 'none' || spec.bg.length === 0) return undefined
  if (spec.bg.length === 1) return `#${spec.bg[0]}`
  return `linear-gradient(135deg, #${spec.bg[0]}, #${spec.bg[1]})`
}

export function radius(shape: IconShape): string {
  return shape === 'circle' ? '50%' : shape === 'squircle' ? '23%' : shape === 'square' ? '6%' : '0'
}
