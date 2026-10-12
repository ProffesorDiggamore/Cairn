import { InputRule, Node, PasteRule } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

export interface WikiLinkOptions {
  resolve: (target: string) => string | null
  subscribe: (fn: () => void) => () => void
  onOpen: (target: string, event: MouseEvent) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (attrs: { target: string; alias?: string | null }) => ReturnType
    }
  }
}

function split(inner: string) {
  const [target, ...rest] = inner.split(/\\?\|/)
  return { target: target.trim(), alias: rest.length ? rest.join('|').trim() || null : null }
}

export function wikiLabel(target: string, alias: string | null): string {
  if (alias) return alias
  const [page, ...sub] = target.split('#')
  const name = page.split('/').pop() || page
  return sub.length ? `${name || ''} › ${sub.join('#')}`.replace(/^ › /, '') : name
}

const isFileTarget = (t: string) => /\.(?!md$)[a-z0-9]{2,5}$/i.test(t.split('#')[0])

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { resolve: () => null, subscribe: () => () => {}, onOpen: () => {} }
  },

  addAttributes() {
    return {
      target: { default: '', parseHTML: (el) => el.getAttribute('data-target') ?? '' },
      alias: { default: null, parseHTML: (el) => el.getAttribute('data-alias') },
      embed: { default: false, parseHTML: (el) => el.hasAttribute('data-embed') },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = { 'data-wikilink': '', 'data-target': node.attrs.target, class: 'wikilink' }
    if (node.attrs.alias) attrs['data-alias'] = node.attrs.alias
    if (node.attrs.embed) attrs['data-embed'] = ''
    return ['span', attrs, wikiLabel(node.attrs.target, node.attrs.alias)]
  },

  renderText({ node }) {
    return `${node.attrs.embed ? '!' : ''}[[${node.attrs.target}${node.attrs.alias ? '|' + node.attrs.alias : ''}]]`
  },

  addNodeView() {
    const opts = this.options
    return ({ node }) => {
      let current = node
      const dom = document.createElement('span')
      dom.className = 'wikilink'
      dom.contentEditable = 'false'
      dom.setAttribute('role', 'link')
      const render = () => {
        const { target, alias, embed } = current.attrs
        dom.textContent = wikiLabel(target, alias)
        const file = isFileTarget(target)
        dom.classList.toggle('is-file', file)
        dom.classList.toggle('is-embed', !!embed)
        dom.classList.toggle('is-unresolved', !file && !opts.resolve(target))
        dom.title = target
      }
      render()
      const unsubscribe = opts.subscribe(render)
      dom.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        opts.onOpen(current.attrs.target, e)
      })
      return {
        dom,
        update(n) {
          if (n.type.name !== 'wikiLink') return false
          current = n
          render()
          return true
        },
        destroy: unsubscribe,
        ignoreMutation: () => true,
      }
    }
  },

  addCommands() {
    return {
      insertWikiLink:
        ({ target, alias = null }) =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: this.name, attrs: { target, alias, embed: false } }, { type: 'text', text: ' ' }])
            .run(),
    }
  },

  addKeyboardShortcuts() {
    return {
      // Backspacing into a link turns it back into editable text, like Obsidian.
      Backspace: ({ editor }) => {
        const { selection } = editor.state
        if (!selection.empty) return false
        const before = selection.$from.nodeBefore
        if (!before || before.type.name !== this.name) return false
        const { target, alias, embed } = before.attrs
        const text = `${embed ? '!' : ''}[[${target}${alias ? '|' + alias : ''}`
        const from = selection.from - before.nodeSize
        const tr = editor.state.tr.replaceWith(from, selection.from, editor.schema.text(text))
        tr.setSelection(TextSelection.create(tr.doc, from + text.length))
        editor.view.dispatch(tr)
        return true
      },
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(!?)\[\[([^[\]\n]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const { target, alias } = split(match[2])
          if (!target) return null
          state.tr.replaceWith(range.from, range.to, this.type.create({ target, alias, embed: match[1] === '!' }))
        },
      }),
    ]
  },

  addPasteRules() {
    return [
      new PasteRule({
        find: /(!?)\[\[([^[\]\n]+)\]\]/g,
        handler: ({ state, range, match }) => {
          const { target, alias } = split(match[2])
          if (!target) return null
          state.tr.replaceWith(range.from, range.to, this.type.create({ target, alias, embed: match[1] === '!' }))
        },
      }),
    ]
  },
})
