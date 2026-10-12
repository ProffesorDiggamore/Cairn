import { create } from 'zustand'

interface UIState {
  palette: null | 'search' | 'commands'
  settings: boolean
  drawer: boolean // mobile sidebar
}

export const useUI = create<UIState>(() => ({ palette: null, settings: false, drawer: false }))
