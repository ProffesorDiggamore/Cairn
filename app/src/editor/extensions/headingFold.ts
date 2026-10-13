import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Toggle headings: every heading gets a disclosure arrow, and folding one hides
// everything under it up to the next heading of the same or a higher level.
// Folds are a view preference, not content, so they never touch the Markdown —
// they're kept per note on this device (like Obsidian's fold state).

export interface HeadingFoldOptions {
  /** Saved fold keys for this note. */
  load: () => string[]
  /** Persist fold keys for this note. */
  save: (keys: string[]) => void
}

interface FoldState {
  folded: Set<number> // positions of folded headings
  deco: DecorationSet
}

type FoldMeta = { toggle: number } | { set: number[] }

export const foldKey = new PluginKey<FoldState>('headingFold')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingFold: {
      toggleHeadingFold: (pos: number) => ReturnType
      toggleAllFolds: () => ReturnType
    }
  }
}

interface Section {
  pos: number
  level: number
  end: number // position where the folded range ends (exclusive)
  hasBody: boolean
}

// Top-level headings with the range each one would hide.
function sections(doc: PMNode): Section[] {
  const tops: { node: PMNode; pos: number }[] = []
  doc.forEach((node, pos) => tops.push({ node, pos }))
  const out: Section[] = []
  tops.forEach(({ node, pos }, i) => {
    if (node.type.name !== 'heading') return
    const level = node.attrs.level as number
    let j = i + 1
    while (j < tops.length) {
      const n = tops[j].node
      if (n.type.name === 'heading' && (n.attrs.level as number) <= level) break
      j++
    }
    const end = j < tops.length ? tops[j].pos : doc.content.size
    out.push({ pos, level, end, hasBody: j > i + 1 })
  })
  return out
}

// A stable-ish identity for saving: level + text + which occurrence it is.
function keysFor(doc: PMNode, positions: Set<number>): string[] {
  const seen = new Map<string, number>()
  const keys: string[] = []
  doc.forEach((node, pos) => {
    if (node.type.name !== 'heading') return
    const base = `${node.attrs.level}:${node.textContent.trim()}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    if (positions.has(pos)) keys.push(`${base}#${n}`)
  })
  return keys
}

function positionsFor(doc: PMNode, keys: string[]): Set<number> {
  const want = new Set(keys)
  const seen = new Map<string, number>()
  const out = new Set<number>()
  doc.forEach((node, pos) => {
    if (node.type.name !== 'heading') return
    const base = `${node.attrs.level}:${node.textContent.trim()}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    if (want.has(`${base}#${n}`)) out.add(pos)
  })
  return out
}

function arrow(folded: boolean, pos: number, hidden: number) {
  return () => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'fold-toggle' + (folded ? ' is-folded' : '')
    b.contentEditable = 'false'
    b.tabIndex = -1
    b.dataset.foldPos = String(pos)
    b.setAttribute('aria-label', folded ? 'Expand section' : 'Collapse section')
    b.title = folded ? 'Expand' : 'Collapse'
    b.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.4-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z"/></svg>' +
      (folded ? `<span class="fold-count">${hidden} hidden</span>` : '')
    return b
  }
}

function build(doc: PMNode, folded: Set<number>): DecorationSet {
  const decos: Decoration[] = []
  let hideUntil = -1
  for (const s of sections(doc)) {
    const isFolded = folded.has(s.pos) && s.hasBody
    const node = doc.nodeAt(s.pos)!
    if (s.pos < hideUntil) {
      decos.push(Decoration.node(s.pos, s.pos + node.nodeSize, { class: 'fold-hidden' }))
      continue
    }
    if (s.hasBody) {
      let hidden = 0
      if (isFolded) doc.nodesBetween(s.pos + node.nodeSize, s.end, (_n, _p, parent) => (parent === doc ? (hidden++, false) : false))
      // After the heading text, so it never fights the drag handle in the left gutter.
      decos.push(
        Decoration.widget(s.pos + node.nodeSize - 1, arrow(isFolded, s.pos, hidden), {
          side: 1,
          key: `fold-${s.pos}-${isFolded}-${hidden}`,
          ignoreSelection: true,
        }),
      )
    }
    if (isFolded) {
      decos.push(Decoration.node(s.pos, s.pos + node.nodeSize, { class: 'is-folded' }))
      hideUntil = s.end
    }
  }
  // Hide the non-heading blocks inside folded ranges.
  if (folded.size) {
    const ranges = sections(doc).filter((s) => folded.has(s.pos) && s.hasBody)
    doc.forEach((node, pos) => {
      if (node.type.name === 'heading') return
      if (ranges.some((r) => pos > r.pos && pos < r.end)) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'fold-hidden' }))
    })
  }
  return DecorationSet.create(doc, decos)
}

// Moving the cursor into a hidden section opens it, so you can never type blind.
function revealSelection(state: EditorState, folded: Set<number>): Set<number> {
  if (!folded.size) return folded
  const { from } = state.selection
  let changed = false
  const next = new Set(folded)
  for (const s of sections(state.doc)) {
    if (next.has(s.pos) && from > s.pos + state.doc.nodeAt(s.pos)!.nodeSize && from < s.end) {
      next.delete(s.pos)
      changed = true
    }
  }
  return changed ? next : folded
}

export const HeadingFold = Extension.create<HeadingFoldOptions>({
  name: 'headingFold',

  addOptions() {
    return { load: () => [], save: () => {} }
  },

  addCommands() {
    return {
      toggleHeadingFold:
        (pos: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(foldKey, { toggle: pos } satisfies FoldMeta)
          return true
        },
      toggleAllFolds:
        () =>
        ({ state, tr, dispatch }) => {
          const cur = foldKey.getState(state)?.folded ?? new Set<number>()
          const all = sections(state.doc).filter((s) => s.hasBody)
          const anyOpen = all.some((s) => !cur.has(s.pos))
          if (dispatch) tr.setMeta(foldKey, { set: anyOpen ? all.map((s) => s.pos) : [] } satisfies FoldMeta)
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-t': () => this.editor.commands.toggleAllFolds(),
      'Mod-.': () => {
        const { $from } = this.editor.state.selection
        if ($from.depth < 1 || $from.node(1).type.name !== 'heading') return false
        return this.editor.commands.toggleHeadingFold($from.before(1))
      },
    }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    return [
      new Plugin<FoldState>({
        key: foldKey,
        state: {
          init: (_, state) => {
            const folded = positionsFor(state.doc, opts.load())
            return { folded, deco: build(state.doc, folded) }
          },
          apply: (tr: Transaction, prev: FoldState, _old, state) => {
            const meta = tr.getMeta(foldKey) as FoldMeta | undefined
            let folded = prev.folded
            if (tr.docChanged) {
              const mapped = new Set<number>()
              for (const p of folded) {
                const r = tr.mapping.mapResult(p, 1)
                if (!r.deleted && state.doc.nodeAt(r.pos)?.type.name === 'heading') mapped.add(r.pos)
              }
              folded = mapped
            }
            if (meta && 'toggle' in meta) {
              folded = new Set(folded)
              if (folded.has(meta.toggle)) folded.delete(meta.toggle)
              else folded.add(meta.toggle)
            } else if (meta && 'set' in meta) {
              folded = new Set(meta.set)
            }
            if (tr.selectionSet && !meta) folded = revealSelection(state, folded)
            if (folded === prev.folded && !tr.docChanged) return prev
            if (meta || folded !== prev.folded) opts.save(keysFor(state.doc, folded))
            return { folded, deco: build(state.doc, folded) }
          },
        },
        props: {
          decorations: (state) => foldKey.getState(state)?.deco,
          handleDOMEvents: {
            mousedown: (view, event) => {
              const btn = (event.target as HTMLElement).closest?.('.fold-toggle') as HTMLElement | null
              if (!btn) return false
              event.preventDefault()
              const pos = Number(btn.dataset.foldPos)
              const tr = view.state.tr.setMeta(foldKey, { toggle: pos } satisfies FoldMeta)
              // Folding with the cursor inside the section: park it on the heading.
              const sec = sections(view.state.doc).find((s) => s.pos === pos)
              const heading = view.state.doc.nodeAt(pos)
              const { from } = view.state.selection
              if (sec && heading && from > pos + heading.nodeSize && from < sec.end) {
                tr.setSelection(TextSelection.create(tr.doc, pos + heading.nodeSize - 1))
              }
              view.dispatch(tr)
              return true
            },
          },
        },
      }),
    ]
  },
})

// ---------------------------------------------------------------- storage

const STORE = 'cairn.folds.v1'

function readAll(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

export function loadFolds(note: string): string[] {
  return readAll()[note] ?? []
}

export function saveFolds(note: string, keys: string[]) {
  const all = readAll()
  if (keys.length) all[note] = keys
  else delete all[note]
  try {
    localStorage.setItem(STORE, JSON.stringify(all))
  } catch {
    /* storage full or blocked — folds just won't persist */
  }
}
