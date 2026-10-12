import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface Emoji {
  emoji: string
  name: string
  emoji_version: string
}
interface Group {
  name: string
  slug: string
  emojis: Emoji[]
}

let cache: Group[] | null = null

const QUICK = ['📝', '📚', '💡', '✅', '📌', '🎯', '📖', '🙏', '✝️', '🎓', '🧠', '💼', '🏀', '🎮', '🎵', '🌱', '🔥', '⭐', '❤️', '🗓️']

export function EmojiPicker({ onPick, onRemove, onClose }: { onPick: (e: string) => void; onRemove?: () => void; onClose: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(cache)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!cache) {
      void import('unicode-emoji-json/data-by-group.json').then((m) => {
        const data = (m.default as unknown as Group[]).map((g) => ({
          ...g,
          // Skip brand-new emoji older phones can't draw yet.
          emojis: g.emojis.filter((e) => parseFloat(e.emoji_version) <= 15),
        }))
        cache = data.filter((g) => g.slug !== 'component')
        setGroups(cache)
      })
    }
    if (window.matchMedia('(hover: hover)').matches) input.current?.focus()
  }, [])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const filtered = useMemo(() => {
    if (!groups) return null
    const s = q.trim().toLowerCase()
    if (!s) return groups
    const all = groups.flatMap((g) => g.emojis).filter((e) => e.name.includes(s))
    return [{ name: 'Results', slug: 'results', emojis: all }]
  }, [groups, q])

  return (
    <div className="popover emoji-picker" ref={ref}>
      <div className="emoji-top">
        <div className="emoji-search">
          <Search size={14} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji…" />
        </div>
        {onRemove && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className="emoji-scroll">
        {!q && (
          <>
            <div className="emoji-group">Suggested</div>
            <div className="emoji-grid">
              {QUICK.map((e) => (
                <button key={e} type="button" className="emoji-cell" onClick={() => onPick(e)}>
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
        {!filtered && <div className="menu-empty">Loading…</div>}
        {filtered?.map((g) => (
          <div key={g.slug}>
            <div className="emoji-group">{g.name}</div>
            <div className="emoji-grid">
              {g.emojis.map((e) => (
                <button key={e.emoji} type="button" className="emoji-cell" title={e.name} onClick={() => onPick(e.emoji)}>
                  {e.emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered && filtered[0]?.emojis.length === 0 && <div className="menu-empty">No emoji found</div>}
      </div>
    </div>
  )
}
