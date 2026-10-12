import { lazy, Suspense, useEffect, useRef } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { FolderPickerHost } from './components/FolderPicker'
import { HomePage } from './components/HomePage'
import { newNoteIn } from './components/FileTree'
import { InstallBanner } from './components/InstallHint'
import { NotePage } from './components/NotePage'
import { Onboarding } from './components/Onboarding'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { TrashPage } from './components/TrashPage'
import { Logo, MenuHost, Toasts } from './components/ui'
import { useUI } from './components/uiState'
import { useIsMobile, useResolvedTheme } from './lib/hooks'
import { openNote, parseHash, useRoute } from './lib/router'
import { setSettings, useSettings } from './lib/settings'
import { startAutoSync } from './lib/sync/manager'
import { onNoteMoved, useVault } from './lib/vault'

const GraphView = lazy(() => import('./components/GraphView'))

export function App() {
  const ready = useVault((s) => s.ready)
  const empty = useVault((s) => s.paths.length === 0)
  const hasSync = useSettings((s) => !!s.sync)
  const onboarded = useSettings((s) => s.onboarded)
  const sidebarOpen = useSettings((s) => s.sidebarOpen)
  const drawer = useUI((s) => s.drawer)
  const route = useRoute()
  const mobile = useIsMobile()
  const theme = useResolvedTheme()
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#191919' : '#ffffff')
  }, [theme])

  useEffect(() => {
    if (ready) return startAutoSync()
  }, [ready])

  // Keep the open page in view when it gets renamed or moved.
  useEffect(
    () =>
      onNoteMoved((from, to) => {
        const r = parseHash(location.hash)
        if (r.name === 'note' && r.path === from) openNote(to, { replace: true })
      }),
    [],
  )

  useEffect(() => {
    useUI.setState({ drawer: false })
    scroller.current?.scrollTo({ top: 0 })
  }, [route])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const ui = useUI.getState()
      if (k === 'k' || k === 'o') {
        e.preventDefault()
        useUI.setState({ palette: ui.palette ? null : 'search' })
      } else if (k === 'p') {
        e.preventDefault()
        useUI.setState({ palette: ui.palette ? null : 'commands' })
      } else if (k === 'n' && !e.shiftKey) {
        e.preventDefault()
        newNoteIn('')
      } else if (k === '\\') {
        e.preventDefault()
        if (window.matchMedia('(max-width: 760px)').matches) useUI.setState({ drawer: !ui.drawer })
        else setSettings((s) => ({ sidebarOpen: !s.sidebarOpen }))
      } else if (k === ',') {
        e.preventDefault()
        useUI.setState({ settings: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div className="splash">
        <Logo size={48} />
      </div>
    )
  }

  if (empty && !hasSync && !onboarded) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    )
  }

  let page: React.ReactNode
  switch (route.name) {
    case 'note':
      page = <NotePage path={route.path} />
      break
    case 'graph':
      page = (
        <Suspense fallback={null}>
          <GraphView />
        </Suspense>
      )
      break
    case 'trash':
      page = <TrashPage />
      break
    default:
      page = <HomePage />
  }

  return (
    <div className={'app' + (mobile ? ' is-mobile' : '')}>
      {!mobile && sidebarOpen && <Sidebar />}
      {mobile && (
        <div className={'drawer' + (drawer ? ' is-open' : '')} aria-hidden={!drawer}>
          <div className="drawer-backdrop" onClick={() => useUI.setState({ drawer: false })} />
          <Sidebar />
        </div>
      )}
      <main className="main">
        <TopBar />
        <div className={'main-scroll' + (route.name === 'graph' ? ' is-fixed' : '')} ref={scroller}>
          {page}
        </div>
      </main>
      <CommandPalette />
      <SettingsModal />
      <FolderPickerHost />
      <MenuHost />
      <InstallBanner />
      <Toasts />
    </div>
  )
}
