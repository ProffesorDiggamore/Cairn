import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'

// Column alignment round-trips through markdown's `:---:` row.
const align = {
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.textAlign || null,
    renderHTML: (attrs: { align?: string | null }) => (attrs.align ? { style: `text-align: ${attrs.align}` } : {}),
  },
}

export const tableExtensions = [
  Table.configure({ resizable: false, HTMLAttributes: { class: 'md-table' } }),
  TableRow,
  TableHeader.extend({
    addAttributes() {
      return { ...this.parent?.(), ...align }
    },
  }),
  TableCell.extend({
    addAttributes() {
      return { ...this.parent?.(), ...align }
    },
  }),
]
