import { describe, expect, it } from 'vitest'
import { blankPixels, decodeIcon, encodeIcon, type IconSpec } from './customIcon'

describe('made page icons', () => {
  it('round-trips every glyph kind', () => {
    const pixels = blankPixels(8) as Extract<IconSpec['glyph'], { kind: 'pixels' }>
    pixels.cells[0] = 1
    pixels.cells[9] = 2
    const specs: IconSpec[] = [
      { shape: 'squircle', bg: ['4f7cff', '9b5cff'], fg: 'ffffff', glyph: { kind: 'icon', name: 'rocket' } },
      { shape: 'circle', bg: ['2383e2'], fg: 'ffffff', glyph: { kind: 'emoji', value: '📚' } },
      { shape: 'none', bg: [], fg: '37352f', glyph: { kind: 'text', value: 'AB' } },
      { shape: 'square', bg: ['000000'], fg: 'ffffff', glyph: pixels },
    ]
    for (const s of specs) expect(decodeIcon(encodeIcon(s))).toEqual(s)
  })
  it('keeps pixel drawings short', () => {
    const g = blankPixels(16)
    expect(encodeIcon({ shape: 'squircle', bg: [], fg: 'ffffff', glyph: g }).length).toBeLessThan(90)
  })
  it('leaves emoji and junk alone', () => {
    expect(decodeIcon('📚')).toBeNull()
    expect(decodeIcon('ci:1|x')).toBeNull()
  })
})
