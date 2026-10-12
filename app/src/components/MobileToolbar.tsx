import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  ChevronDown,
  FileText,
  Heading,
  Italic,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListTodo,
  Plus,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { currentBlock, startPageLink, turnInto } from '../editor/blocks'

// Formatting bar that rides on top of the on-screen keyboard.
export function MobileToolbar({ editor }: { editor: Editor }) {
  const [focused, setFocused] = useState(editor.isFocused)
  const [offset, setOffset] = useState(0)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      block: currentBlock(e),
      inList: e.isActive('listItem') || e.isActive('taskItem'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const onFocus = () => {
      clearTimeout(t)
      setFocused(true)
    }
    const onBlur = () => {
      t = setTimeout(() => setFocused(false), 120)
    }
    editor.on('focus', onFocus)
    editor.on('blur', onBlur)
    return () => {
      editor.off('focus', onFocus)
      editor.off('blur', onBlur)
      clearTimeout(t)
    }
  }, [editor])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('has-mobile-toolbar', focused)
    return () => document.documentElement.classList.remove('has-mobile-toolbar')
  }, [focused])

  if (!focused) return null

  const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault()
  const nextHeading = () => {
    const order = ['paragraph', 'h1', 'h2', 'h3'] as const
    const i = order.indexOf(s.block as (typeof order)[number])
    turnInto(editor, order[(i + 1) % order.length])
  }
  const b = (label: string, icon: React.ReactNode, run: () => void, active = false, disabled = false) => (
    <button type="button" className={'mt-btn' + (active ? ' is-active' : '')} aria-label={label} disabled={disabled} onMouseDown={keep} onClick={run}>
      {icon}
    </button>
  )

  return (
    <div className="mobile-toolbar" style={{ transform: `translateY(${-offset}px)` }} onMouseDown={keep}>
      <div className="mt-scroll">
        {b('Insert block', <Plus size={20} />, () => editor.chain().focus().insertContent('/').run())}
        {b('To-do', <ListTodo size={20} />, () => turnInto(editor, s.block === 'task' ? 'paragraph' : 'task'), s.block === 'task')}
        {b('Bulleted list', <List size={20} />, () => turnInto(editor, s.block === 'bullet' ? 'paragraph' : 'bullet'), s.block === 'bullet')}
        {b('Heading', <Heading size={20} />, nextHeading, s.block.startsWith('h'))}
        {b('Bold', <Bold size={19} strokeWidth={2.4} />, () => editor.chain().focus().toggleBold().run(), s.bold)}
        {b('Italic', <Italic size={19} />, () => editor.chain().focus().toggleItalic().run(), s.italic)}
        {b('Strikethrough', <Strikethrough size={19} />, () => editor.chain().focus().toggleStrike().run(), s.strike)}
        {b('Link to page', <FileText size={19} />, () => startPageLink(editor))}
        {b('Indent', <ListIndentIncrease size={19} />, () => editor.chain().focus().sinkListItem(s.block === 'task' ? 'taskItem' : 'listItem').run(), false, !s.inList)}
        {b('Outdent', <ListIndentDecrease size={19} />, () => editor.chain().focus().liftListItem(s.block === 'task' ? 'taskItem' : 'listItem').run(), false, !s.inList)}
        {b('Undo', <Undo2 size={19} />, () => editor.chain().focus().undo().run(), false, !s.canUndo)}
        {b('Redo', <Redo2 size={19} />, () => editor.chain().focus().redo().run(), false, !s.canRedo)}
      </div>
      <button type="button" className="mt-btn mt-done" aria-label="Hide keyboard" onMouseDown={keep} onClick={() => editor.commands.blur()}>
        <ChevronDown size={20} />
      </button>
    </div>
  )
}
