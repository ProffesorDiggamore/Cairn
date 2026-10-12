import { Cloud, CloudAlert, CloudOff, RefreshCw } from 'lucide-react'
import { relativeTime } from '../lib/hooks'
import { runSync } from '../lib/sync/manager'
import { useVault } from '../lib/vault'
import { useUI } from './uiState'
import { useEffect, useState } from 'react'

export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const sync = useVault((s) => s.sync)
  const pending = useVault((s) => Object.values(s.files).some((f) => f.dirty))
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  let icon = <Cloud size={16} />
  let label = 'Synced'
  let tone = 'ok'
  switch (sync.status) {
    case 'off':
      icon = <CloudOff size={16} />
      label = 'Sync off'
      tone = 'muted'
      break
    case 'syncing':
      icon = <RefreshCw size={16} className="spin" />
      label = 'Syncing…'
      tone = 'busy'
      break
    case 'offline':
      icon = <CloudOff size={16} />
      label = pending ? 'Offline · saved on device' : 'Offline'
      tone = 'muted'
      break
    case 'error':
      icon = <CloudAlert size={16} />
      label = 'Sync problem'
      tone = 'error'
      break
    default:
      if (pending) {
        label = 'Saving…'
        tone = 'busy'
      } else label = sync.lastSync ? `Synced ${relativeTime(sync.lastSync)}` : 'Synced'
  }
  const title = sync.error ?? label
  return (
    <button
      type="button"
      className={`sync-indicator tone-${tone}${compact ? ' is-compact' : ''}`}
      title={title}
      aria-label={title}
      onClick={() => (sync.status === 'off' || sync.status === 'error' ? useUI.setState({ settings: true }) : void runSync())}
    >
      {icon}
      {!compact && <span>{label}</span>}
    </button>
  )
}
