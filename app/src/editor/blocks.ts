import type { Editor } from '@tiptap/core'

export type BlockKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'task' | 'quote' | 'callout' | 'code'

export const BLOCK_LABELS: Record<BlockKind, string> = {
  paragraph: 'Text',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  bullet: 'Bulleted list',
  ordered: 'Numbered list',
  task: 'To-do list',
  quote: 'Quote',
  callout: 'Callout',
  code: 'Code',
}

export function currentBlock(editor: Editor): BlockKind {
  if (editor.isActive('codeBlock')) return 'code'
  if (editor.isActive('heading', { level: 1 })) return 'h1'
  if (editor.isActive('heading', { level: 2 })) return 'h2'
  if (editor.isActive('heading', { level: 3 })) return 'h3'
  if (editor.isActive('taskList')) return 'task'
  if (editor.isActive('orderedList')) return 'ordered'
  if (editor.isActive('bulletList')) return 'bullet'
  if (editor.isActive('callout')) return 'callout'
  if (editor.isActive('blockquote')) return 'quote'
  return 'paragraph'
}

function unwrapLists(editor: Editor) {
  const c = editor.chain().focus()
  if (editor.isActive('taskList')) c.toggleTaskList()
  else if (editor.isActive('orderedList')) c.toggleOrderedList()
  else if (editor.isActive('bulletList')) c.toggleBulletList()
  c.run()
}

// Change the block under the cursor in place (works inside callouts too).
export function turnInto(editor: Editor, kind: BlockKind) {
  const chain = () => editor.chain().focus()
  switch (kind) {
    case 'paragraph':
      unwrapLists(editor)
      if (editor.isActive('blockquote')) chain().lift('blockquote').run()
      chain().setParagraph().run()
      break
    case 'h1':
    case 'h2':
    case 'h3':
      unwrapLists(editor)
      chain()
        .setHeading({ level: Number(kind[1]) as 1 | 2 | 3 })
        .run()
      break
    case 'bullet':
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('bulletList')) chain().toggleBulletList().run()
      break
    case 'ordered':
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('orderedList')) chain().toggleOrderedList().run()
      break
    case 'task':
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('taskList')) chain().toggleTaskList().run()
      break
    case 'quote':
      unwrapLists(editor)
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('blockquote')) chain().toggleBlockquote().run()
      break
    case 'callout':
      unwrapLists(editor)
      if (editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('callout')) chain().setCallout('note').run()
      break
    case 'code':
      unwrapLists(editor)
      if (!editor.isActive('codeBlock')) chain().toggleCodeBlock().run()
      break
  }
}

export function insertTable(editor: Editor) {
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

export function insertImage(editor: Editor) {
  const src = window.prompt('Image link (https://…)')?.trim()
  if (src) editor.chain().focus().setImage({ src }).run()
}

export function insertToday(editor: Editor) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  editor.chain().focus().insertContent(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `).run()
}

export function startPageLink(editor: Editor) {
  editor.chain().focus().insertContent('[[').run()
}
