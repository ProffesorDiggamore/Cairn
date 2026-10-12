import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { flushAll } from './lib/flush'
import { toast } from './lib/toasts'
import { initVault } from './lib/vault'
import './styles/base.css'
import './styles/app.css'
import './styles/editor.css'

void initVault()

// Ask the browser not to evict notes under storage pressure.
void navigator.storage?.persist?.().catch(() => {})

// Save pending typing when the app is hidden or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll()
})
window.addEventListener('pagehide', flushAll)

const updateSW = registerSW({
  onNeedRefresh() {
    toast('A new version of Cairn is ready.', { action: { label: 'Update', run: () => void updateSW(true) }, duration: 120_000 })
  },
  onOfflineReady() {
    toast('Cairn is ready to work offline.')
  },
})

createRoot(document.getElementById('root')!).render(<App />)
