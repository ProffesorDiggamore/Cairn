import { Eraser, ImageUp, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  blankPixels,
  decodeIcon,
  defaultSpec,
  encodeIcon,
  PRESET_BACKGROUNDS,
  PRESET_COLORS,
  type Glyph,
  type IconShape,
  type IconSpec,
} from '../lib/customIcon'
import { imageToDataUrl, pickImageFile } from '../lib/images'
import { toast } from '../lib/toasts'
import { CustomIcon, GLYPHS, NoteIcon } from './NoteIcon'

// A small, fast icon maker: pick a shape and colours, then a symbol, an emoji,
// a couple of letters — or draw one pixel by pixel. Uploading a picture works too.

const RECENT_KEY = 'cairn.recentIcons.v1'

export function recentIcons(): string[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]).slice(0, 12)
  } catch {
    return []
  }
}

function remember(value: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([value, ...recentIcons().filter((v) => v !== value)].slice(0, 12)))
  } catch {
    /* blocked storage: no recents */
  }
}

type GlyphTab = 'icon' | 'emoji' | 'text' | 'pixels'

function Swatch({ colors, active, onClick, title }: { colors: string[]; active: boolean; onClick: () => void; title?: string }) {
  const bg = colors.length === 0 ? undefined : colors.length === 1 ? `#${colors[0]}` : `linear-gradient(135deg, #${colors[0]}, #${colors[1]})`
  return (
    <button type="button" title={title} className={'ic-swatch' + (active ? ' is-active' : '') + (colors.length === 0 ? ' is-none' : '')} style={{ background: bg }} onClick={onClick} />
  )
}

function PixelGrid({ glyph, onChange }: { glyph: Extract<Glyph, { kind: 'pixels' }>; onChange: (g: Glyph) => void }) {
  // Start with whichever ink shows up on this theme's canvas.
  const [color, setColor] = useState(() => (document.documentElement.dataset.theme === 'dark' ? 0 : 1))
  const painting = useRef<number | null>(null)
  const paint = (i: number) => {
    const v = painting.current
    if (v === null || glyph.cells[i] === v) return
    const cells = glyph.cells.slice()
    cells[i] = v
    onChange({ ...glyph, cells })
  }
  const setPalette = (idx: number, hex: string) => {
    const palette = glyph.palette.slice()
    palette[idx] = hex
    onChange({ ...glyph, palette })
  }
  return (
    <div className="ic-draw">
      <div
        className="ic-grid"
        style={{ gridTemplateColumns: `repeat(${glyph.size}, 1fr)` }}
        onPointerUp={() => (painting.current = null)}
        onPointerLeave={() => (painting.current = null)}
      >
        {glyph.cells.map((v, i) => (
          <div
            key={i}
            className="ic-cell"
            style={{ background: v >= 0 ? `#${glyph.palette[v]}` : undefined }}
            onPointerDown={(e) => {
              e.preventDefault()
              ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
              painting.current = glyph.cells[i] === color ? -1 : color
              paint(i)
            }}
            onPointerEnter={() => paint(i)}
          />
        ))}
      </div>
      <div className="ic-palette">
        {glyph.palette.map((c, idx) => (
          <label key={idx} className={'ic-paint' + (color === idx ? ' is-active' : '')} style={{ background: `#${c}` }} onClick={() => setColor(idx)} title="Click to paint with this colour · click again to change it">
            <input type="color" value={`#${c}`} onChange={(e) => setPalette(idx, e.target.value.slice(1))} onClick={(e) => color !== idx && e.preventDefault()} />
          </label>
        ))}
        <button type="button" className={'ic-tool' + (color === -1 ? ' is-active' : '')} title="Eraser" onClick={() => setColor(-1)}>
          <Eraser size={14} />
        </button>
        <button type="button" className="ic-tool" title="Clear" onClick={() => onChange({ ...glyph, cells: glyph.cells.map(() => -1) })}>
          <Trash2 size={14} />
        </button>
        <select className="ic-size" value={glyph.size} onChange={(e) => onChange(blankPixels(Number(e.target.value)))} title="Grid size (clears the drawing)">
          {[8, 12, 16].map((n) => (
            <option key={n} value={n}>
              {n}×{n}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function IconCreator({ current, onPick }: { current: string | null; onPick: (value: string) => void }) {
  const [spec, setSpec] = useState<IconSpec>(() => decodeIcon(current) ?? defaultSpec())
  const [tab, setTab] = useState<GlyphTab>(spec.glyph.kind)
  const [busy, setBusy] = useState(false)
  const recents = recentIcons()
  const set = (patch: Partial<IconSpec>) => setSpec((s) => ({ ...s, ...patch }))

  const switchTab = (t: GlyphTab) => {
    setTab(t)
    if (t === spec.glyph.kind) return
    if (t === 'icon') set({ glyph: { kind: 'icon', name: 'sparkles' } })
    if (t === 'emoji') set({ glyph: { kind: 'emoji', value: '📚' } })
    if (t === 'text') set({ glyph: { kind: 'text', value: 'A' } })
    if (t === 'pixels') set({ glyph: blankPixels(12) })
  }

  const use = (value: string) => {
    remember(value)
    onPick(value)
  }

  const upload = async () => {
    const file = await pickImageFile()
    if (!file) return
    setBusy(true)
    try {
      use(await imageToDataUrl(file, 96))
    } catch {
      toast('That picture couldn’t be opened. Try a PNG or JPEG.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="icon-creator">
      <div className="ic-head">
        <div className="ic-preview">
          <CustomIcon spec={spec} size={64} />
        </div>
        <div className="ic-head-actions">
          <div className="segmented ic-shapes">
            {(['squircle', 'circle', 'square', 'none'] as IconShape[]).map((s) => (
              <button key={s} type="button" className={spec.shape === s ? 'is-active' : ''} onClick={() => set({ shape: s })}>
                {s === 'squircle' ? 'Rounded' : s === 'none' ? 'No shape' : s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="row-gap">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => use(encodeIcon(spec))}>
              Use this icon
            </button>
            <button type="button" className="btn btn-sm" onClick={upload} disabled={busy}>
              <ImageUp size={14} /> {busy ? 'Shrinking…' : 'Upload picture'}
            </button>
          </div>
        </div>
      </div>

      {spec.shape !== 'none' && (
        <div className="ic-row">
          <span className="ic-label">Background</span>
          <div className="ic-swatches">
            {PRESET_BACKGROUNDS.map((b) => (
              <Swatch key={b.join()} colors={b} active={spec.bg.join() === b.join()} onClick={() => set({ bg: b })} />
            ))}
            <label className="ic-swatch ic-custom" title="Custom colour" style={{ background: spec.bg[0] ? `#${spec.bg[0]}` : undefined }}>
              <input type="color" value={`#${spec.bg[0] ?? '4f7cff'}`} onChange={(e) => set({ bg: [e.target.value.slice(1)] })} />
            </label>
          </div>
        </div>
      )}

      <div className="ic-row">
        <div className="segmented ic-tabs">
          {(
            [
              ['icon', 'Symbol'],
              ['emoji', 'Emoji'],
              ['text', 'Letters'],
              ['pixels', 'Draw'],
            ] as [GlyphTab, string][]
          ).map(([t, label]) => (
            <button key={t} type="button" className={tab === t ? 'is-active' : ''} onClick={() => switchTab(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab !== 'pixels' && tab !== 'emoji' && (
        <div className="ic-row">
          <span className="ic-label">Colour</span>
          <div className="ic-swatches">
            {PRESET_COLORS.map((c) => (
              <Swatch key={c} colors={[c]} active={spec.fg === c} onClick={() => set({ fg: c })} />
            ))}
            <label className="ic-swatch ic-custom" title="Custom colour" style={{ background: `#${spec.fg}` }}>
              <input type="color" value={`#${spec.fg}`} onChange={(e) => set({ fg: e.target.value.slice(1) })} />
            </label>
          </div>
        </div>
      )}

      {tab === 'icon' && spec.glyph.kind === 'icon' && (
        <div className="ic-glyphs">
          {Object.entries(GLYPHS).map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              title={name}
              className={'ic-glyph' + (spec.glyph.kind === 'icon' && spec.glyph.name === name ? ' is-active' : '')}
              onClick={() => set({ glyph: { kind: 'icon', name } })}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      )}
      {tab === 'emoji' && spec.glyph.kind === 'emoji' && (
        <label className="field">
          <span>Paste or type an emoji</span>
          <input
            className="input"
            value={spec.glyph.value}
            onChange={(e) => {
              const first = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(e.target.value)].pop()?.segment ?? ''
              set({ glyph: { kind: 'emoji', value: first } })
            }}
          />
        </label>
      )}
      {tab === 'text' && spec.glyph.kind === 'text' && (
        <label className="field">
          <span>Up to 3 letters or numbers</span>
          <input className="input" maxLength={3} value={spec.glyph.value} onChange={(e) => set({ glyph: { kind: 'text', value: e.target.value.slice(0, 3) } })} />
        </label>
      )}
      {tab === 'pixels' && spec.glyph.kind === 'pixels' && <PixelGrid glyph={spec.glyph} onChange={(glyph) => set({ glyph })} />}

      {recents.length > 0 && (
        <div className="ic-row">
          <span className="ic-label">Recent</span>
          <div className="ic-swatches">
            {recents.map((v) => (
              <button key={v} type="button" className="ic-recent" onClick={() => onPick(v)}>
                <NoteIcon value={v} size={26} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
