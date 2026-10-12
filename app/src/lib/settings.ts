import { create } from 'zustand'
import type { SyncConfig } from './types'

export type Theme = 'system' | 'light' | 'dark'
export type Font = 'sans' | 'serif' | 'mono'

export interface Settings {
  theme: Theme
  font: Font
  fullWidth: boolean
  smallText: boolean
  spellcheck: boolean
  sync: SyncConfig | null
  favorites: string[]
  recent: string[]
  expanded: string[] // open folders in the sidebar
  sidebarOpen: boolean
  sidebarWidth: number
  dailyFolder: string
  onboarded: boolean
}

const DEFAULTS: Settings = {
  theme: 'system',
  font: 'sans',
  fullWidth: false,
  smallText: false,
  spellcheck: true,
  sync: null,
  favorites: [],
  recent: [],
  expanded: [],
  sidebarOpen: true,
  sidebarWidth: 260,
  dailyFolder: 'Daily',
  onboarded: false,
}

const KEY = 'cairn.settings.v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    /* private mode or corrupt */
  }
  return DEFAULTS
}

export const useSettings = create<Settings>(() => load())

useSettings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked */
  }
})

export function setSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  useSettings.setState(typeof patch === 'function' ? patch(useSettings.getState()) : patch)
}

export function pushRecent(path: string) {
  setSettings((s) => ({ recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, 30) }))
}

export function renamePathInSettings(oldPath: string, newPath: string | null) {
  const swap = (list: string[]) => (newPath ? list.map((p) => (p === oldPath ? newPath : p)) : list.filter((p) => p !== oldPath))
  setSettings((s) => ({ favorites: swap(s.favorites), recent: swap(s.recent) }))
}

export function toggleFavorite(path: string) {
  setSettings((s) => ({ favorites: s.favorites.includes(path) ? s.favorites.filter((p) => p !== path) : [...s.favorites, path] }))
}
