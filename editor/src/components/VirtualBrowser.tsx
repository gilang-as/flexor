import type { SimConfig } from '../types'

// ── Icons ────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7.5H13a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" />
    </svg>
  )
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8.22 12.53a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06L9.28 2.97a.75.75 0 00-1.06 1.06L11.19 7H3a.75.75 0 000 1.5h8.19l-2.97 2.97a.75.75 0 000 1.06z" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0114.95 7.16a.75.75 0 11-1.49.178A5.501 5.501 0 008 2.5zM1.705 8.005a.75.75 0 01.834.656 5.501 5.501 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.001 7.001 0 011.05 8.84a.75.75 0 01.656-.834z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
      <path d="M4 4a4 4 0 018 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25v-5.5C2 6.784 2.784 6 3.75 6H4V4zm6.5 2V4a2.5 2.5 0 00-5 0v2zM8 9.5a1 1 0 100 2 1 1 0 000-2z" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  )
}

function RouterOsBadge() {
  return (
    <span className="vb-engine-badge">
      <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
        <path d="M5.5 4.143a.5.5 0 01.746-.434l6 3.5a.5.5 0 010 .868l-6 3.5A.5.5 0 015.5 11V4.143z" />
      </svg>
      RouterOS
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  simConfig: SimConfig
}

export default function VirtualBrowser({ simConfig }: Props) {
  const { hostname, loginPage, serverName, captivePortal, allowTrial, advertRequired } = simConfig.server
  const displayUrl = `http://${hostname}/${loginPage}`

  const userCount    = simConfig.users.filter(u => !u.disabled).length
  const profileCount = simConfig.profiles.length

  return (
    <div className="vbrowser">

      {/* Toolbar */}
      <div className="vbrowser-toolbar">
        <div className="vbrowser-navbtns">
          <button className="vbrowser-navbtn" disabled title="Back"><BackIcon /></button>
          <button className="vbrowser-navbtn" disabled title="Forward"><ForwardIcon /></button>
          <button className="vbrowser-navbtn" title="Refresh"><RefreshIcon /></button>
        </div>

        <div className="vbrowser-address-bar">
          <span className="vbrowser-lock"><LockIcon /></span>
          <input
            className="vbrowser-url-input"
            value={displayUrl}
            readOnly
            title={displayUrl}
            onClick={e => (e.target as HTMLInputElement).select()}
          />
        </div>

        <RouterOsBadge />
      </div>

      {/* Viewport */}
      <div className="vbrowser-viewport">
        <div className="vbrowser-placeholder">
          <div className="vbrowser-ph-icon"><GlobeIcon /></div>

          <div className="vbrowser-ph-server">{serverName}</div>
          <div className="vbrowser-ph-url">{displayUrl}</div>

          <div className="vbrowser-ph-chips">
            <span className="vbrowser-chip">🌐 {hostname}</span>
            <span className="vbrowser-chip">👤 {userCount} user{userCount !== 1 ? 's' : ''}</span>
            <span className="vbrowser-chip">📋 {profileCount} profile{profileCount !== 1 ? 's' : ''}</span>
            {captivePortal  && <span className="vbrowser-chip vbrowser-chip-on">captive</span>}
            {allowTrial     && <span className="vbrowser-chip vbrowser-chip-on">trial</span>}
            {advertRequired && <span className="vbrowser-chip vbrowser-chip-warn">advert</span>}
          </div>

          <div className="vbrowser-ph-divider" />

          <div className="vbrowser-ph-wasm-label">Load WASM engine to enable preview</div>
          <div className="vbrowser-ph-cmd">
            <code>cd engine &amp;&amp; GOOS=js GOARCH=wasm go build -o ../editor/public/portal.wasm ./cmd/wasm/</code>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="vbrowser-footer">
        <span className="vbrowser-conn">
          <span className="vbrowser-conn-dot" />
          Not connected
        </span>
        <span className="vbrowser-footer-server">{serverName}</span>
      </div>

    </div>
  )
}
