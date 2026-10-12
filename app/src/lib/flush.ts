// Editors register a flush so pending keystrokes are saved before a sync
// starts or the page is hidden.
const flushers = new Set<() => void>()

export function registerFlusher(fn: () => void) {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

export function flushAll() {
  flushers.forEach((fn) => fn())
}
