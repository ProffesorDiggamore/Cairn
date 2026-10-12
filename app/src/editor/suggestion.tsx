import { shift, size } from '@floating-ui/dom'
import type { Editor } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

export const floatingUi = {
  strategy: 'fixed' as const,
  middleware: [
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ availableHeight, elements }) {
        elements.floating.style.maxHeight = `${Math.max(140, Math.min(360, availableHeight - 8))}px`
      },
    }),
  ],
}

type MenuComponent<I> = React.ForwardRefExoticComponent<SuggestionProps<I> & React.RefAttributes<MenuHandle>>

// Bridges TipTap's suggestion lifecycle to a React popup.
export function reactSuggestion<I>(Component: MenuComponent<I>): SuggestionOptions<I>['render'] {
  return () => {
    let renderer: ReactRenderer<MenuHandle, SuggestionProps<I>> | null = null
    let unmount: (() => void) | null = null
    return {
      onStart: (props) => {
        renderer = new ReactRenderer(Component, { props, editor: props.editor as Editor })
        const el = renderer.element as HTMLElement
        el.classList.add('suggestion-popup')
        unmount = props.mount(el)
      },
      onUpdate: (props) => renderer?.updateProps(props),
      onKeyDown: ({ event }) => renderer?.ref?.onKeyDown(event) ?? false,
      onExit: () => {
        unmount?.()
        unmount = null
        renderer?.destroy()
        renderer = null
      },
    }
  }
}

// Keyboard-navigable list used by both popups.
export function useMenuNav<I>(items: I[], onSelect: (item: I) => void, ref: React.ForwardedRef<MenuHandle>) {
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [items])
  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (e) => {
        if (!items.length) return false
        if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
          setIndex((i) => (i + 1) % items.length)
          return true
        }
        if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
          setIndex((i) => (i - 1 + items.length) % items.length)
          return true
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          const item = items[index]
          if (item) onSelect(item)
          return true
        }
        return false
      },
    }),
    [items, index, onSelect],
  )
  return [index, setIndex] as const
}

export const MenuList = forwardRef<HTMLDivElement, { children: ReactNode; active: number; empty?: string }>(function MenuList(
  { children, active, empty },
  ref,
) {
  const inner = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    inner.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div
      className="popover suggestion-menu"
      ref={(el) => {
        inner.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
      {empty && <div className="menu-empty">{empty}</div>}
    </div>
  )
})
