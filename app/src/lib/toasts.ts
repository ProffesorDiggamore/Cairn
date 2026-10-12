import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
  tone?: 'info' | 'error'
}

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }))

let next = 1
export function toast(message: string, opts: Omit<Toast, 'id' | 'message'> & { duration?: number } = {}) {
  const id = next++
  useToasts.setState((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== message), { id, message, ...opts }] }))
  setTimeout(() => dismissToast(id), opts.duration ?? (opts.action ? 8000 : 4000))
  return id
}

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
