import { Folder, House } from 'lucide-react'
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { isInFolder } from '../lib/paths'
import { allFolders, useVault } from '../lib/vault'
import { Modal } from './ui'

interface PickerState {
  open: null | { title: string; current: string; exclude?: string; resolve: (v: string | null) => void }
}

const usePicker = create<PickerState>(() => ({ open: null }))

// Resolves to the chosen folder path ('' = top level) or null if cancelled.
export function chooseFolder(title: string, current: string, exclude?: string): Promise<string | null> {
  return new Promise((resolve) => usePicker.setState({ open: { title, current, exclude, resolve } }))
}

export function FolderPickerHost() {
  const open = usePicker((s) => s.open)
  const paths = useVault((s) => s.paths)
  const explicit = useVault((s) => s.folders)
  const [q, setQ] = useState('')
  const folders = useMemo(() => allFolders(paths, explicit), [paths, explicit])
  if (!open) return null
  const finish = (v: string | null) => {
    open.resolve(v)
    usePicker.setState({ open: null })
    setQ('')
  }
  const list = folders.filter(
    (f) => (!open.exclude || (f !== open.exclude && !isInFolder(f, open.exclude))) && f.toLowerCase().includes(q.toLowerCase()),
  )
  const typed = q.trim()
  return (
    <Modal title={open.title} onClose={() => finish(null)}>
      <div className="picker">
        <input className="input" autoFocus placeholder="Find or create a folder…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="picker-list">
          {!q && (
            <button type="button" className={'menu-item' + (open.current === '' ? ' is-active' : '')} onClick={() => finish('')}>
              <House size={15} /> Top level
            </button>
          )}
          {list.map((f) => (
            <button key={f} type="button" className={'menu-item' + (f === open.current ? ' is-active' : '')} onClick={() => finish(f)}>
              <Folder size={15} /> {f}
            </button>
          ))}
          {typed && !folders.includes(typed) && (
            <button type="button" className="menu-item" onClick={() => finish(typed.replace(/^\/+|\/+$/g, ''))}>
              <Folder size={15} /> New folder “{typed}”
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
