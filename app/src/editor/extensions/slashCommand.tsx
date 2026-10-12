import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import {
  Calendar,
  CodeXml,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  Quote,
  Table,
  type LucideIcon,
} from 'lucide-react'
import { forwardRef, useCallback } from 'react'
import { insertImage, insertTable, insertToday, startPageLink, turnInto } from '../blocks'
import { floatingUi, MenuList, reactSuggestion, useMenuNav, type MenuHandle } from '../suggestion'

export interface SlashItem {
  title: string
  description: string
  group: string
  icon: LucideIcon
  keywords: string[]
  hint?: string
  run: (editor: Editor) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  { group: 'Basic blocks', title: 'Text', description: 'Just start writing with plain text.', icon: Pilcrow, keywords: ['p', 'paragraph', 'plain'], run: (e) => turnInto(e, 'paragraph') },
  { group: 'Basic blocks', title: 'Heading 1', description: 'Big section heading.', icon: Heading1, keywords: ['h1', 'title', 'big'], hint: '#', run: (e) => turnInto(e, 'h1') },
  { group: 'Basic blocks', title: 'Heading 2', description: 'Medium section heading.', icon: Heading2, keywords: ['h2', 'subtitle'], hint: '##', run: (e) => turnInto(e, 'h2') },
  { group: 'Basic blocks', title: 'Heading 3', description: 'Small section heading.', icon: Heading3, keywords: ['h3'], hint: '###', run: (e) => turnInto(e, 'h3') },
  { group: 'Basic blocks', title: 'To-do list', description: 'Track tasks with a to-do list.', icon: ListTodo, keywords: ['todo', 'task', 'checkbox', 'check'], hint: '[]', run: (e) => turnInto(e, 'task') },
  { group: 'Basic blocks', title: 'Bulleted list', description: 'Create a simple bulleted list.', icon: List, keywords: ['ul', 'bullet', 'unordered'], hint: '-', run: (e) => turnInto(e, 'bullet') },
  { group: 'Basic blocks', title: 'Numbered list', description: 'Create a list with numbering.', icon: ListOrdered, keywords: ['ol', 'ordered', 'number'], hint: '1.', run: (e) => turnInto(e, 'ordered') },
  { group: 'Basic blocks', title: 'Quote', description: 'Capture a quote.', icon: Quote, keywords: ['blockquote', 'cite'], hint: '>', run: (e) => turnInto(e, 'quote') },
  { group: 'Basic blocks', title: 'Callout', description: 'Make writing stand out.', icon: Lightbulb, keywords: ['note', 'tip', 'warning', 'info', 'box', 'admonition'], run: (e) => turnInto(e, 'callout') },
  { group: 'Basic blocks', title: 'Divider', description: 'Visually divide blocks.', icon: Minus, keywords: ['hr', 'line', 'separator', 'rule'], hint: '---', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { group: 'Basic blocks', title: 'Code', description: 'Capture a code snippet.', icon: CodeXml, keywords: ['codeblock', 'snippet', 'pre'], hint: '```', run: (e) => turnInto(e, 'code') },
  { group: 'Basic blocks', title: 'Table', description: 'Add a simple table.', icon: Table, keywords: ['grid', 'spreadsheet'], run: insertTable },
  { group: 'Links & media', title: 'Link to page', description: 'Link to another note.', icon: FileText, keywords: ['link', 'page', 'wiki', 'note', 'mention'], hint: '[[', run: startPageLink },
  { group: 'Links & media', title: 'Image', description: 'Embed an image from a link.', icon: Image, keywords: ['picture', 'photo', 'img', 'url'], run: insertImage },
  { group: 'Other', title: 'Today’s date', description: 'Insert the date, like 2026-10-12.', icon: Calendar, keywords: ['date', 'today', 'now', 'time'], run: insertToday },
]

export function filterSlash(query: string): SlashItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return SLASH_ITEMS
  const score = (i: SlashItem) => {
    const t = i.title.toLowerCase()
    if (t.startsWith(q)) return 3
    if (i.keywords.some((k) => k.startsWith(q))) return 2
    if (t.includes(q) || i.keywords.some((k) => k.includes(q))) return 1
    return 0
  }
  return SLASH_ITEMS.map((i) => [i, score(i)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i)
}

const SlashMenu = forwardRef<MenuHandle, SuggestionProps<SlashItem>>(function SlashMenu({ items, command }, ref) {
  const select = useCallback((item: SlashItem) => command(item), [command])
  const [active, setActive] = useMenuNav(items, select, ref)
  let lastGroup = ''
  return (
    <MenuList active={active} empty={items.length ? undefined : 'No results'}>
      {items.map((item, i) => {
        const header = item.group !== lastGroup ? item.group : null
        lastGroup = item.group
        const Icon = item.icon
        return (
          <div key={item.title}>
            {header && <div className="menu-label">{header}</div>}
            <button
              type="button"
              data-index={i}
              className={'menu-item slash-item' + (i === active ? ' is-active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(item)}
            >
              <span className="slash-icon">
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <span className="slash-text">
                <span className="slash-title">{item.title}</span>
                <span className="slash-desc">{item.description}</span>
              </span>
              {item.hint && <kbd className="slash-hint">{item.hint}</kbd>}
            </button>
          </div>
        )
      })}
    </MenuList>
  )
})

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowedPrefixes: null,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          if ($from.parent.type.spec.code) return false
          // Only at the start of a block or after a space, like Notion.
          const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, '￼')
          return before === '' || /\s/.test(before)
        },
        items: ({ query }) => filterSlash(query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor)
        },
        floatingUi,
        render: reactSuggestion(SlashMenu),
      }),
    ]
  },
})
