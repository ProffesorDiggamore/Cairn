import type { Editor } from '@tiptap/core'
import { ArrowUpRight, FaceSlightlySmilingPlus, FileQuestion, FileText, Link2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LinkItem } from '../editor/extensions/wikiLinkSuggest'
import { NoteEditor } from '../editor/NoteEditor'
import { useIsTouch, useLinkIndex, useNoteIcons, useResolver } from '../lib/hooks'
import { linkContexts, stripSubpath } from '../lib/links'
import { getField, joinFrontmatter, setField, splitFrontmatter } from '../lib/markdown/frontmatter'
import { dirname, titleOf } from '../lib/paths'
import { navigate, openNote } from '../lib/router'
import { pushRecent, useSettings } from '../lib/settings'
import { toast } from '../lib/toasts'
import { createNote, renameNote, updateContent, useVault } from '../lib/vault'
import { EmojiPicker } from './EmojiPicker'
import { MobileToolbar } from './MobileToolbar'

// Cross-page hand-offs (focus the body after renaming, jump to a #heading).
let focusBodyOnMount = false
let pendingAnchor: string | null = null

const UNTITLED = /^Untitled( \d+)?$/

export function openLinkTarget(target: string, resolve: (t: string) => string | null) {
  const path = resolve(target)
  const anchor = target.includes('#') ? target.slice(target.indexOf('#') + 1) : null
  if (path) {
    pendingAnchor = anchor
    openNote(path)
    return
  }
  const name = stripSubpath(target)
  if (/\.[a-z0-9]{2,5}$/i.test(name)) {
    toast('Attachments like images and PDFs aren’t supported in links yet.')
    return
  }
  const parts = name.split('/')
  const title = parts.pop()!
  const folder = parts.join('/')
  openNote(createNote({ folder, title }))
}

export function NotePage({ path }: { path: string }) {
  const exists = useVault((s) => !!s.files[path] && !s.files[path].deleted)
  const ready = useVault((s) => s.ready)
  if (!ready) return null
  if (!exists) {
    return (
      <div className="empty-state">
        <FileQuestion size={40} strokeWidth={1.25} />
        <h2>This page doesn’t exist</h2>
        <p>It may have been renamed, moved to Trash, or not synced to this device yet.</p>
        <div className="row-gap">
          <button type="button" className="btn btn-primary" onClick={() => openNote(createNote({ folder: dirname(path), title: titleOf(path) }))}>
            Create “{titleOf(path)}”
          </button>
          <button type="button" className="btn" onClick={() => navigate({ name: 'home' })}>
            Go home
          </button>
        </div>
      </div>
    )
  }
  return <NoteView key={path} path={path} />
}

function NoteView({ path }: { path: string }) {
  const file = useVault((s) => s.files[path])
  const content = file?.content ?? ''
  const { frontmatter, body } = useMemo(() => splitFrontmatter(content), [content])
  const fm = useRef(frontmatter)
  fm.current = frontmatter
  const icon = getField(frontmatter, 'icon')
  const fullWidth = useSettings((s) => s.fullWidth)
  const font = useSettings((s) => s.font)
  const smallText = useSettings((s) => s.smallText)
  const spellcheck = useSettings((s) => s.spellcheck)
  const touch = useIsTouch()
  const resolver = useResolver()
  const resolverRef = useRef(resolver)
  resolverRef.current = resolver
  const [editor, setEditor] = useState<Editor | null>(null)
  const [picker, setPicker] = useState(false)

  useEffect(() => pushRecent(path), [path])

  const onChange = useCallback((md: string) => updateContent(path, joinFrontmatter(fm.current, md)), [path])
  const setIcon = (e: string | null) => {
    const cur = useVault.getState().files[path]?.content ?? ''
    const split = splitFrontmatter(cur)
    updateContent(path, joinFrontmatter(setField(split.frontmatter, 'icon', e), split.body))
    setPicker(false)
  }

  const resolve = useCallback((t: string) => resolverRef.current.resolve(t, path), [path])
  const subscribeLinks = useCallback((fn: () => void) => useVault.subscribe((s, prev) => s.paths !== prev.paths && fn()), [])

  const linkItems = useCallback(
    (query: string): LinkItem[] => {
      const q = query.split(/[#|]/)[0].trim().toLowerCase()
      const { paths, files } = useVault.getState()
      const recent = useSettings.getState().recent
      const scored = paths
        .filter((p) => p !== path)
        .map((p) => {
          const t = titleOf(p).toLowerCase()
          let score = 0
          if (!q) score = 10 - Math.min(9, recent.indexOf(p) < 0 ? 9 : recent.indexOf(p))
          else if (t === q) score = 100
          else if (t.startsWith(q)) score = 80
          else if (t.includes(q)) score = 60
          else if (p.toLowerCase().includes(q)) score = 40
          return { p, score }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || titleOf(a.p).localeCompare(titleOf(b.p)))
        .slice(0, 8)
      const items: LinkItem[] = scored.map(({ p }) => ({
        kind: 'note',
        title: titleOf(p),
        linkText: resolverRef.current.linkTextFor(p),
        folder: dirname(p) || undefined,
        icon: getField(splitFrontmatter(files[p].content).frontmatter, 'icon'),
      }))
      const raw = query.split(/[#|]/)[0].trim()
      if (raw && !paths.some((p) => titleOf(p).toLowerCase() === raw.toLowerCase())) {
        items.push({ kind: 'create', title: raw, linkText: raw })
      }
      return items
    },
    [path],
  )

  const onReady = useCallback((ed: Editor | null) => {
    setEditor(ed)
    if (!ed) return
    if (focusBodyOnMount) {
      focusBodyOnMount = false
      ed.commands.focus('start')
    }
    if (pendingAnchor) {
      const want = pendingAnchor.toLowerCase()
      pendingAnchor = null
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.textContent.trim().toLowerCase() === want) {
          const dom = ed.view.nodeDOM(pos) as HTMLElement | null
          dom?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          return false
        }
        return true
      })
    }
  }, [])

  const isNew = !!file && !file.content && Date.now() - file.ctime < 4000

  return (
    <div className={`page font-${font}${fullWidth ? ' is-full' : ''}${smallText ? ' is-small' : ''}`}>
      <div className="page-inner">
        <div className={'page-icon-row' + (icon ? ' has-icon' : '')}>
          {icon ? (
            <button type="button" className="page-icon" onClick={() => setPicker(true)} aria-label="Change icon">
              {icon}
            </button>
          ) : (
            <div className="page-controls">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker(true)}>
                <FaceSlightlySmilingPlus size={15} /> Add icon
              </button>
            </div>
          )}
          {picker && <EmojiPicker onPick={setIcon} onRemove={icon ? () => setIcon(null) : undefined} onClose={() => setPicker(false)} />}
        </div>

        <TitleField path={path} autoFocus={isNew} onEnter={() => editor?.commands.focus('start')} />

        <NoteEditor
          markdown={body}
          onChange={onChange}
          resolveLink={resolve}
          subscribeLinks={subscribeLinks}
          onOpenLink={(t) => openLinkTarget(t, resolve)}
          linkItems={linkItems}
          onLinkPage={(text, ed) => {
            const t = text.trim().replace(/[[\]|#^]/g, '')
            if (!t) return
            const existing = resolverRef.current.resolve(t, path)
            const target = existing ? resolverRef.current.linkTextFor(existing) : t
            ed.chain().focus().insertContent({ type: 'wikiLink', attrs: { target, alias: null, embed: false } }).run()
          }}
          onReady={onReady}
          spellcheck={spellcheck}
          touch={touch}
        />

        <div className="page-tail" onClick={() => editor?.commands.focus('end')} />
        <Backlinks path={path} />
      </div>
      {touch && editor && <MobileToolbar editor={editor} />}
    </div>
  )
}

function TitleField({ path, autoFocus, onEnter }: { path: string; autoFocus: boolean; onEnter: () => void }) {
  const real = titleOf(path)
  const [value, setValue] = useState(UNTITLED.test(real) ? '' : real)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setValue(UNTITLED.test(real) ? '' : real)
  }, [real])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const commit = (focusBody: boolean) => {
    const v = value.trim()
    if (!v || v === real) {
      if (focusBody) onEnter()
      return
    }
    focusBodyOnMount = focusBody
    const next = renameNote(path, v)
    if (next === path) {
      focusBodyOnMount = false
      setValue(UNTITLED.test(real) ? '' : real)
      if (focusBody) onEnter()
    }
  }

  return (
    <textarea
      ref={ref}
      className="page-title"
      rows={1}
      value={value}
      placeholder="Untitled"
      spellCheck={false}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ''))}
      onBlur={() => commit(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && ref.current?.selectionStart === value.length)) {
          e.preventDefault()
          commit(true)
        }
      }}
    />
  )
}

function Backlinks({ path }: { path: string }) {
  const index = useLinkIndex()
  const resolver = useResolver()
  const files = useVault((s) => s.files)
  const icons = useNoteIcons()
  const sources = [...(index.incoming.get(path) ?? [])].sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
  if (!sources.length) return null
  return (
    <section className="backlinks">
      <div className="backlinks-head">
        <Link2 size={15} /> {sources.length} linked mention{sources.length === 1 ? '' : 's'}
      </div>
      {sources.map((src) => {
        const lines = linkContexts(files[src]?.content ?? '', src, path, resolver).slice(0, 3)
        return (
          <button type="button" key={src} className="backlink" onClick={() => openNote(src)}>
            <span className="backlink-title">
              {icons[src] ? <span className="tree-emoji">{icons[src]}</span> : <FileText size={15} strokeWidth={1.75} />}
              {titleOf(src)}
              <ArrowUpRight size={13} className="backlink-arrow" />
            </span>
            {lines.map((l, i) => (
              <span key={i} className="backlink-line">
                {l.replace(/^[-*+>]\s+(\[[ xX]\]\s+)?/, '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t, a) => a || t)}
              </span>
            ))}
          </button>
        )
      })}
    </section>
  )
}

