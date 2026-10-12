import { Node } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

export const CALLOUT_KINDS: { kind: string; label: string; icon: string }[] = [
  { kind: 'note', label: 'Note', icon: '📝' },
  { kind: 'info', label: 'Info', icon: 'ℹ️' },
  { kind: 'tip', label: 'Tip', icon: '💡' },
  { kind: 'success', label: 'Success', icon: '✅' },
  { kind: 'question', label: 'Question', icon: '❓' },
  { kind: 'warning', label: 'Warning', icon: '⚠️' },
  { kind: 'danger', label: 'Danger', icon: '🔥' },
  { kind: 'bug', label: 'Bug', icon: '🐞' },
  { kind: 'example', label: 'Example', icon: '🧪' },
  { kind: 'quote', label: 'Quote', icon: '💬' },
  { kind: 'todo', label: 'To-do', icon: '☑️' },
  { kind: 'abstract', label: 'Summary', icon: '📄' },
]

const ALIASES: Record<string, string> = {
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  error: 'danger',
  failure: 'danger',
  fail: 'danger',
  missing: 'danger',
  cite: 'quote',
  summary: 'abstract',
  tldr: 'abstract',
}

export function calloutStyle(kind: string) {
  const k = ALIASES[kind] ?? kind
  return CALLOUT_KINDS.find((c) => c.kind === k) ?? CALLOUT_KINDS[0]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (kind?: string) => ReturnType
      unsetCallout: () => ReturnType
    }
  }
}

function CalloutView({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const { kind, title } = node.attrs as { kind: string; title: string }
  const style = calloutStyle(kind)
  const [menu, setMenu] = useState(false)
  const [showTitle, setShowTitle] = useState(!!title)
  const menuRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as globalThis.Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  const unwrap = () => {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (pos == null) return
    editor.chain().focus().setTextSelection(pos + 2).unsetCallout().run()
  }

  return (
    <NodeViewWrapper className="callout" data-kind={style.kind}>
      <div className="callout-icon-wrap" contentEditable={false} ref={menuRef}>
        <button type="button" className="callout-icon" onClick={() => setMenu((m) => !m)} aria-label="Change callout type">
          {style.icon}
        </button>
        {menu && (
          <div className="popover callout-menu">
            <div className="menu-label">Callout type</div>
            {CALLOUT_KINDS.map((c) => (
              <button
                key={c.kind}
                type="button"
                className={'menu-item' + (c.kind === style.kind ? ' is-active' : '')}
                onClick={() => {
                  updateAttributes({ kind: c.kind })
                  setMenu(false)
                }}
              >
                <span className="menu-emoji">{c.icon}</span>
                {c.label}
              </button>
            ))}
            <div className="menu-sep" />
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                if (showTitle) updateAttributes({ title: '' })
                setShowTitle(!showTitle)
                setMenu(false)
                if (!showTitle) setTimeout(() => titleRef.current?.focus(), 0)
              }}
            >
              {showTitle ? 'Remove title' : 'Add title'}
            </button>
            <button type="button" className="menu-item" onClick={unwrap}>
              Turn into text
            </button>
          </div>
        )}
      </div>
      <div className="callout-body">
        {(showTitle || title) && (
          <input
            ref={titleRef}
            className="callout-title"
            contentEditable={false}
            value={title}
            placeholder={style.label}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault()
                const pos = typeof getPos === 'function' ? getPos() : null
                if (pos != null) editor.chain().focus().setTextSelection(pos + 2).run()
              }
            }}
          />
        )}
        <NodeViewContent className="callout-content" />
      </div>
    </NodeViewWrapper>
  )
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      kind: { default: 'note', parseHTML: (el) => el.getAttribute('data-kind') ?? 'note' },
      title: { default: '', parseHTML: (el) => el.getAttribute('data-title') ?? '' },
      fold: { default: '', parseHTML: (el) => el.getAttribute('data-fold') ?? '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ node }) {
    return ['div', { 'data-callout': '', 'data-kind': node.attrs.kind, 'data-title': node.attrs.title, 'data-fold': node.attrs.fold }, 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },

  addCommands() {
    return {
      setCallout:
        (kind = 'note') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of a callout unwraps it, like a quote.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false
        const container = $from.node($from.depth - 1)
        if (container.type.name !== this.name || $from.index($from.depth - 1) !== 0) return false
        return editor.commands.lift(this.name)
      },
    }
  },
})
