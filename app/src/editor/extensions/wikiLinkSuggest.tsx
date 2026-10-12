import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { FilePlus, FileText } from 'lucide-react'
import { forwardRef, useCallback } from 'react'
import { floatingUi, MenuList, reactSuggestion, useMenuNav, type MenuHandle } from '../suggestion'

export interface LinkItem {
  kind: 'note' | 'create'
  title: string
  linkText: string // what goes inside [[ ]]
  folder?: string
  icon?: string | null
}

export interface WikiLinkSuggestOptions {
  items: (query: string) => LinkItem[]
}

const WikiLinkMenu = forwardRef<MenuHandle, SuggestionProps<LinkItem>>(function WikiLinkMenu({ items, command, query }, ref) {
  const select = useCallback((item: LinkItem) => command(item), [command])
  const [active, setActive] = useMenuNav(items, select, ref)
  return (
    <MenuList active={active} empty={items.length ? undefined : query ? undefined : 'Type to search notes'}>
      <div className="menu-label">Link to page</div>
      {items.map((item, i) => (
        <button
          type="button"
          key={item.kind + item.linkText}
          data-index={i}
          className={'menu-item link-item' + (i === active ? ' is-active' : '')}
          onMouseEnter={() => setActive(i)}
          onClick={() => select(item)}
        >
          <span className="link-item-icon">
            {item.kind === 'create' ? <FilePlus size={16} /> : item.icon ? item.icon : <FileText size={16} strokeWidth={1.75} />}
          </span>
          <span className="link-item-title">{item.kind === 'create' ? `New page “${item.title}”` : item.title}</span>
          {item.folder && <span className="link-item-folder">{item.folder}</span>}
        </button>
      ))}
    </MenuList>
  )
})

export const WikiLinkSuggest = Extension.create<WikiLinkSuggestOptions>({
  name: 'wikiLinkSuggest',
  addOptions() {
    return { items: () => [] }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<LinkItem, LinkItem>({
        editor: this.editor,
        pluginKey: new PluginKey('wikiLinkSuggest'),
        char: '[[',
        allowSpaces: true,
        allowedPrefixes: null,
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => this.options.items(query.replace(/\]+$/, '')),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: LinkItem }) => {
          // Keep any #heading or |alias the user already typed.
          const typed = editor.state.doc.textBetween(range.from + 2, range.to)
          const sub = /(#[^|]*)?(?:\|(.*))?$/.exec(typed.replace(/^[^#|]*/, ''))
          const target = props.linkText + (sub?.[1] ?? '')
          const alias = sub?.[2]?.trim() || null
          const end = editor.state.doc.textBetween(range.to, Math.min(range.to + 2, editor.state.doc.content.size)) === ']]' ? range.to + 2 : range.to
          editor
            .chain()
            .focus()
            .insertContentAt({ from: range.from, to: end }, [{ type: 'wikiLink', attrs: { target, alias, embed: false } }, { type: 'text', text: ' ' }])
            .run()
        },
        floatingUi,
        render: reactSuggestion(WikiLinkMenu),
      }),
    ]
  },
})
