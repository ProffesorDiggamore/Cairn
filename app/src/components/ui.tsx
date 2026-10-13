import { X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { dismissToast, useToasts } from '../lib/toasts'

// ------------------------------------------------------------- context menu

export type MenuEntry =
  | { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; hint?: string; disabled?: boolean }
  | 'sep'

interface MenuState {
  open: null | { x: number; y: number; items: MenuEntry[]; title?: string }
}

const useMenu = create<MenuState>(() => ({ open: null }))

export function openMenu(at: { x: number; y: number } | HTMLElement, items: MenuEntry[], title?: string) {
  let x: number
  let y: number
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect()
    x = r.left
    y = r.bottom + 4
  } else ({ x, y } = at)
  useMenu.setState({ open: { x, y, items, title } })
}

export function closeMenu() {
  useMenu.setState({ open: null })
}

export function MenuHost() {
  const open = useMenu((s) => s.open)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      left: Math.max(8, Math.min(open.x, vw - r.width - 8)),
      top: open.y + r.height > vh - 8 ? Math.max(8, open.y - r.height - 8) : open.y,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', closeMenu)
    }
  }, [open])

  if (!open) return null
  return (
    <div
      ref={ref}
      className="popover context-menu"
      role="menu"
      style={{ left: pos?.left ?? open.x, top: pos?.top ?? open.y, visibility: pos ? 'visible' : 'hidden' }}
    >
      {open.title && <div className="menu-label">{open.title}</div>}
      {open.items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={'menu-item' + (it.danger ? ' is-danger' : '')}
            onClick={() => {
              closeMenu()
              it.onSelect()
            }}
          >
            {it.icon && <span className="menu-icon">{it.icon}</span>}
            <span className="menu-text">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}

// -------------------------------------------------------------------- modal

export function Modal({
  title,
  onClose,
  children,
  className = '',
  wide = false,
}: {
  title?: string
  onClose: () => void
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------- logo

// Just the pebble — no tile behind it, so it sits naturally on any background.
export function Logo({ size = 22 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="logo">
      <defs>
        <radialGradient id={`pebble-${id}`} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#9ba69d" />
          <stop offset="1" stopColor="#323b35" />
        </radialGradient>
      </defs>
      <ellipse cx="51" cy="79" rx="32" ry="4.5" fill="currentColor" opacity="0.14" />
      <ellipse cx="50" cy="53" rx="41" ry="28.5" transform="rotate(-8 50 53)" fill={`url(#pebble-${id})`} />
      <ellipse cx="36" cy="40" rx="13" ry="6" transform="rotate(-18 36 40)" fill="#ffffff" opacity="0.22" />
    </svg>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const mod = isMac ? '⌘' : 'Ctrl+'

// ------------------------------------------------------------------- toasts

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast' + (t.tone === 'error' ? ' is-error' : '')}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
