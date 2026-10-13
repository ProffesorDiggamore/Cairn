import { Extension } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Tiptap's Placeholder maps old decorations through each transaction, so
// pressing Enter on an empty "Write, or press '/'…" line left the hint on the
// line above as well as the new one. This version rebuilds from scratch on
// every state: exactly one hint, on the empty block that holds the cursor.

export interface CurrentPlaceholderOptions {
  placeholder: (node: PMNode, $pos: ResolvedPos) => string
}

export const CurrentPlaceholder = Extension.create<CurrentPlaceholderOptions>({
  name: 'currentPlaceholder',

  addOptions() {
    return { placeholder: () => '' }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const text = this.options.placeholder
    return [
      new Plugin({
        key: new PluginKey('currentPlaceholder'),
        props: {
          decorations: (state) => {
            if (!editor.isEditable) return null
            const { $from, empty } = state.selection
            if (!empty || $from.depth === 0) return null
            const node = $from.parent
            if (!node.isTextblock || node.content.size > 0) return null
            const label = text(node, $from)
            if (!label) return null
            const pos = $from.before()
            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, { class: 'is-empty', 'data-placeholder': label }),
            ])
          },
        },
      }),
    ]
  },
})
