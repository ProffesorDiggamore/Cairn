import { Check, ChevronRight, CloudCog, ExternalLink, Info, LoaderCircle, Palette, RefreshCw, Smartphone, TriangleAlert, Database } from 'lucide-react'
import { useState } from 'react'
import { clearAll } from '../lib/db'
import { relativeTime, useIsMobile } from '../lib/hooks'
import { setSettings, useSettings, type Font, type Theme } from '../lib/settings'
import { parseRepo } from '../lib/sync/github'
import { runSync, testConnection } from '../lib/sync/manager'
import { toast } from '../lib/toasts'
import { EMPTY_META } from '../lib/types'
import { applyFiles, setMeta, useVault } from '../lib/vault'
import { InstallSteps } from './InstallHint'
import { Modal } from './ui'
import { useUI } from './uiState'

type Tab = 'sync' | 'appearance' | 'install' | 'data' | 'about'

export function SettingsModal() {
  const open = useUI((s) => s.settings)
  const [tab, setTab] = useState<Tab>('sync')
  const mobile = useIsMobile()
  if (!open) return null
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'sync', label: 'Sync', icon: <CloudCog size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
    { id: 'install', label: 'Install app', icon: <Smartphone size={16} /> },
    { id: 'data', label: 'Data', icon: <Database size={16} /> },
    { id: 'about', label: 'About', icon: <Info size={16} /> },
  ]
  return (
    <Modal title="Settings" onClose={() => useUI.setState({ settings: false })} wide className="settings">
      <div className="settings-body">
        <nav className={'settings-tabs' + (mobile ? ' is-row' : '')}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className={'settings-tab' + (tab === t.id ? ' is-active' : '')} onClick={() => setTab(t.id)}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          {tab === 'sync' && <SyncSettings />}
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'install' && (
            <section>
              <h3>Install Cairn as an app</h3>
              <p className="muted">
                Cairn is a web app you can install for free. Once installed it gets its own icon and window, opens instantly and works offline.
                Changes sync whenever you’re online.
              </p>
              <InstallSteps />
              <div className="settings-note">
                <strong>On your iPhone:</strong> open this same link in Safari and use <em>Share → Add to Home Screen</em>.
                <br />
                <strong>On your Mac:</strong> open it in Safari and use <em>File → Add to Dock…</em>
              </div>
            </section>
          )}
          {tab === 'data' && <DataSettings />}
          {tab === 'about' && (
            <section>
              <h3>About Cairn</h3>
              <p>
                Cairn 2.0 — a Notion-style editor on top of plain Markdown files, Obsidian-compatible: <code>[[links]]</code>, backlinks,
                callouts, tasks and tags all work in both apps.
              </p>
              <p className="muted">
                Your notes live on this device and in your own GitHub repository. Nothing is sent anywhere else. Keyboard: {` `}
                <kbd className="kbd">⌘K</kbd> search, <kbd className="kbd">⌘N</kbd> new page, <kbd className="kbd">/</kbd> blocks,{' '}
                <kbd className="kbd">[[</kbd> link a page, <kbd className="kbd">⌘\</kbd> sidebar.
              </p>
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function SyncForm({ onConnected }: { onConnected?: () => void }) {
  const current = useSettings((s) => s.sync)
  const [repo, setRepo] = useState(current ? `${current.owner}/${current.repo}` : '')
  const [branch, setBranch] = useState(current?.branch ?? '')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState(!current)

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const parsed = parseRepo(repo)
    if (!parsed) return setError('Enter the repo as owner/name, like ProffesorDiggamore/Cairn, or paste its GitHub URL.')
    const tok = token.trim() || current?.token || ''
    if (!tok) return setError('Paste your GitHub token.')
    setBusy(true)
    const probe = await testConnection({ ...parsed, branch: branch.trim() || 'main', token: tok })
    setBusy(false)
    if (!probe.ok) return setError(probe.error)
    const cfg = { ...parsed, branch: branch.trim() || probe.defaultBranch, token: tok }
    const changedRepo = !current || current.owner !== cfg.owner || current.repo !== cfg.repo || current.branch !== cfg.branch
    if (changedRepo) {
      // A different repo: forget what we knew about the old one; local notes merge in.
      setMeta(EMPTY_META)
      const all = Object.values(useVault.getState().files)
      applyFiles(
        all.filter((f) => !f.deleted).map((f) => ({ ...f, baseSha: null, baseContent: null, dirty: true })),
        all.filter((f) => f.deleted).map((f) => f.path),
        { local: false },
      )
    }
    setSettings({ sync: cfg, onboarded: true })
    setToken('')
    toast(`Connected to ${cfg.owner}/${cfg.repo} — syncing…`)
    void runSync()
    onConnected?.()
  }

  return (
    <form className="sync-form" onSubmit={connect}>
      <label className="field">
        <span>GitHub repository</span>
        <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="ProffesorDiggamore/Cairn" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="field">
        <span>
          Branch <span className="muted">(leave empty for the default)</span>
        </span>
        <input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="field">
        <span>Personal access token</span>
        <input
          className="input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={current ? '•••••••• (saved — paste to replace)' : 'github_pat_…'}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="button" className="link-btn" onClick={() => setHelp(!help)}>
        <ChevronRight size={14} className={help ? 'rot90' : ''} /> How do I get a token? (free, 1 minute)
      </button>
      {help && (
        <ol className="help-steps">
          <li>
            Open{' '}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
              GitHub → New fine-grained token <ExternalLink size={12} />
            </a>
            .
          </li>
          <li>
            Name it <strong>Cairn</strong> and pick an expiration (when it runs out, just paste a new one here).
          </li>
          <li>
            Under <strong>Repository access</strong> choose <strong>Only select repositories</strong> and pick your notes repo.
          </li>
          <li>
            Under <strong>Permissions → Repository permissions</strong>, set <strong>Contents</strong> to <strong>Read and write</strong>.
          </li>
          <li>
            Click <strong>Generate token</strong>, copy it, and paste it above. Do this once on each device.
          </li>
        </ol>
      )}
      {error && (
        <div className="form-error">
          <TriangleAlert size={16} /> {error}
        </div>
      )}
      <div className="row-gap">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
          {current ? 'Save' : 'Connect'}
        </button>
      </div>
      <p className="muted small">The token is stored only on this device. It’s sent to GitHub and nowhere else, and it’s never saved into your notes.</p>
    </form>
  )
}

function SyncSettings() {
  const cfg = useSettings((s) => s.sync)
  const sync = useVault((s) => s.sync)
  const dirty = useVault((s) => Object.values(s.files).filter((f) => f.dirty).length)
  const [editing, setEditing] = useState(false)
  return (
    <section>
      <h3>Sync with GitHub</h3>
      <p className="muted">
        Cairn saves every note to this device instantly, then syncs it to your private GitHub repo automatically — so your Mac and phone always match.
        It’s free and the notes stay plain Markdown you own.
      </p>
      {cfg && !editing ? (
        <div className="sync-card">
          <div className="sync-card-row">
            <span className="muted">Repository</span>
            <a href={`https://github.com/${cfg.owner}/${cfg.repo}`} target="_blank" rel="noopener noreferrer">
              {cfg.owner}/{cfg.repo} <ExternalLink size={12} />
            </a>
          </div>
          <div className="sync-card-row">
            <span className="muted">Branch</span>
            <span>{cfg.branch}</span>
          </div>
          <div className="sync-card-row">
            <span className="muted">Status</span>
            <span className={sync.status === 'error' ? 'text-error' : ''}>
              {sync.status === 'syncing'
                ? 'Syncing…'
                : sync.status === 'error'
                  ? sync.error
                  : sync.status === 'offline'
                    ? 'Offline — will sync when you reconnect'
                    : sync.lastSync
                      ? `Up to date · ${relativeTime(sync.lastSync)}`
                      : 'Waiting…'}
              {dirty > 0 && sync.status !== 'syncing' && ` · ${dirty} change${dirty === 1 ? '' : 's'} waiting`}
            </span>
          </div>
          <div className="row-gap">
            <button type="button" className="btn" onClick={() => void runSync()} disabled={sync.status === 'syncing'}>
              <RefreshCw size={15} className={sync.status === 'syncing' ? 'spin' : ''} /> Sync now
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Change repo or token
            </button>
            <button
              type="button"
              className="btn btn-ghost text-error"
              onClick={() => {
                if (!confirm('Stop syncing on this device? Your notes stay here and on GitHub.')) return
                setSettings({ sync: null })
                useVault.setState((s) => ({ sync: { ...s.sync, status: 'off', error: null } }))
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <SyncForm onConnected={() => setEditing(false)} />
      )}
    </section>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={v === value ? 'is-active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        {desc && <span className="toggle-desc">{desc}</span>}
      </span>
      <input type="checkbox" className="switch" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function AppearanceSettings() {
  const s = useSettings()
  return (
    <section>
      <h3>Appearance</h3>
      <div className="setting-row">
        <span>Theme</span>
        <Segmented<Theme> value={s.theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(theme) => setSettings({ theme })} />
      </div>
      <div className="setting-row">
        <span>Font</span>
        <div className="font-picker">
          {(
            [
              ['sans', 'Default'],
              ['serif', 'Serif'],
              ['mono', 'Mono'],
            ] as [Font, string][]
          ).map(([f, label]) => (
            <button key={f} type="button" className={'font-option font-' + f + (s.font === f ? ' is-active' : '')} onClick={() => setSettings({ font: f })}>
              <span className="font-sample">Ag</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <Toggle label="Small text" desc="Fit more on screen." value={s.smallText} onChange={(smallText) => setSettings({ smallText })} />
      <Toggle label="Full width" desc="Use the whole window for pages." value={s.fullWidth} onChange={(fullWidth) => setSettings({ fullWidth })} />
      <Toggle label="Spell check" value={s.spellcheck} onChange={(spellcheck) => setSettings({ spellcheck })} />
      <label className="field">
        <span>Daily notes folder</span>
        <input className="input" value={s.dailyFolder} onChange={(e) => setSettings({ dailyFolder: e.target.value })} placeholder="Daily" />
      </label>
    </section>
  )
}

function DataSettings() {
  const count = useVault((s) => s.paths.length)
  return (
    <section>
      <h3>Your data</h3>
      <p className="muted">
        {count} page{count === 1 ? '' : 's'} on this device. Every page is a Markdown file — in your GitHub repo you can open them with Obsidian, VS Code
        or any text editor.
      </p>
      <div className="danger-zone">
        <div>
          <strong>Reset this device</strong>
          <p className="muted small">Removes all notes, settings and your token from this device only. Anything already synced stays on GitHub.</p>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const dirty = Object.values(useVault.getState().files).some((f) => f.dirty)
            const msg = dirty
              ? 'Some changes haven’t synced yet and will be LOST. Reset this device anyway?'
              : 'Remove all Cairn data from this device? Your GitHub copy is not touched.'
            if (!confirm(msg)) return
            await clearAll()
            try {
              localStorage.clear()
            } catch {
              /* ignore */
            }
            location.hash = ''
            location.reload()
          }}
        >
          Reset
        </button>
      </div>
    </section>
  )
}
