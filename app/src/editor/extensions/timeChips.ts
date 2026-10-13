import { Extension, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { clockSvg, findTimes, formatSpan, type TimeMatch } from '../../lib/calendar'

// A little clock face after every time written in a note: "Math 1-3" shows a
// wedge from 1 to 3. Clicking it offers to put the line on your calendar.

export interface TimeClick {
  match: TimeMatch
  blockText: string
  anchor: HTMLElement
}

export interface TimeChipsOptions {
  enabled: () => boolean
  bareRanges: () => boolean
  h24: () => boolean
  onClick: (info: TimeClick) => void
}

const key = new PluginKey<DecorationSet>('timeChips')

interface Found {
  pos: number // where the clock goes (end of the time text)
  match: TimeMatch
  blockText: string
}

function scan(doc: PMNode, bareRanges: boolean): Found[] {
  const found: Found[] = []
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false
    if (!node.isTextblock) return true
    // Atoms (links, raw HTML) are one position each, matching the placeholder char.
    const text = node.textBetween(0, node.content.size, undefined, '￼')
    if (!/\d/.test(text)) return false
    let codeRanges: [number, number][] | null = null
    for (const m of findTimes(text, { bareRanges })) {
      if (codeRanges === null) {
        codeRanges = []
        node.forEach((child, offset) => {
          if (child.marks.some((mk) => mk.type.name === 'code')) codeRanges!.push([offset, offset + child.nodeSize])
        })
      }
      if (codeRanges.some(([a, b]) => m.index < b && m.index + m.length > a)) continue
      found.push({ pos: pos + 1 + m.index + m.length, match: m, blockText: text })
    }
    return false
  })
  return found
}

export const TimeChips = Extension.create<TimeChipsOptions>({
  name: 'timeChips',

  addOptions() {
    return { enabled: () => true, bareRanges: () => true, h24: () => false, onClick: () => {} }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    const make = (doc: PMNode) => {
      if (!opts.enabled()) return DecorationSet.empty
      const h24 = opts.h24()
      return DecorationSet.create(
        doc,
        scan(doc, opts.bareRanges()).map((f) =>
          Decoration.widget(
            f.pos,
            () => {
              const b = document.createElement('button')
              b.type = 'button'
              b.className = 'time-chip'
              b.contentEditable = 'false'
              b.tabIndex = -1
              b.title = `${formatSpan(f.match.start, f.match.end, h24)} — add to calendar`
              b.innerHTML = clockSvg(f.match.start, f.match.end)
              b.addEventListener('mousedown', (e) => e.preventDefault())
              b.addEventListener('click', (e) => {
                e.preventDefault()
                e.stopPropagation()
                opts.onClick({ match: f.match, blockText: f.blockText, anchor: b })
              })
              return b
            },
            { side: 1, ignoreSelection: true, key: `t${f.pos}-${f.match.start.h}${f.match.start.m}-${f.match.end?.h ?? ''}${f.match.end?.m ?? ''}` },
          ),
        ),
      )
    }
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => make(state.doc),
          apply: (tr, prev) => (tr.docChanged || tr.getMeta(key) ? make(tr.doc) : prev),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})

/** Re-scan after a setting changes. */
export function refreshTimeChips(editor: Editor) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, true))
}
