import { useState } from 'react'
import type { SimConfig, SimProfile, SimUser } from '../types'

// ── Icons ────────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8.75 3.75a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75v1.25h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25zM4.997 6.5a.75.75 0 10-1.493.144L4.916 13h6.168l1.412-6.356a.75.75 0 10-1.493-.144l-1.22 5.5H6.217l-1.22-5.5z" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
      <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064L11.19 6.25z" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16" width="12" height="12" fill="currentColor"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
    >
      <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
    </svg>
  )
}

// ── Small reusable form atoms ─────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sim-field">
      <label className="sim-label">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      className={`sim-toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
      title={label}
      type="button"
    >
      <span className="sim-toggle-knob" />
    </button>
  )
}

function Input({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <input
      className="sim-input"
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function Select<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; disabled?: boolean }[]
}) {
  return (
    <select className="sim-select" value={value} onChange={e => onChange(e.target.value as T)}>
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sim-section">
      <button className="sim-section-header" onClick={() => setOpen(o => !o)}>
        <IconChevron open={open} />
        <span>{title}</span>
      </button>
      {open && <div className="sim-section-body">{children}</div>}
    </div>
  )
}

// ── Profile edit modal ────────────────────────────────────────────────────────

function ProfileModal({
  profile,
  onSave,
  onCancel,
}: {
  profile: SimProfile
  onSave: (p: SimProfile) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<SimProfile>(profile)
  const set = <K extends keyof SimProfile>(k: K, v: SimProfile[K]) =>
    setDraft(d => ({ ...d, [k]: v }))
  const setB = <K extends keyof SimProfile['bandwidth']>(k: K, v: number) =>
    setDraft(d => ({ ...d, bandwidth: { ...d.bandwidth, [k]: v } }))

  return (
    <div className="sim-modal-backdrop" onClick={onCancel}>
      <div className="sim-modal" onClick={e => e.stopPropagation()}>
        <div className="sim-modal-header">
          <span>{profile.id ? 'Edit Profile' : 'New Profile'}</span>
          <button className="sim-modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="sim-modal-body">
          <Field label="Profile name">
            <Input value={draft.name} onChange={v => set('name', v)} placeholder="e.g. default" />
          </Field>
          <Field label="Address pool">
            <Input value={draft.addressPool} onChange={v => set('addressPool', v)} placeholder="192.168.88.0/24" />
          </Field>
          <Field label="Session time limit">
            <Input
              value={draft.sessionTimeLeft}
              onChange={v => set('sessionTimeLeft', v)}
              placeholder="e.g. 1h, 30m, 2h30m — empty = no limit"
            />
            <span className="sim-hint">Leave empty for unlimited session</span>
          </Field>
          <Field label="Shared users">
            <Input
              type="number"
              value={draft.sharedUsers}
              onChange={v => set('sharedUsers', Math.max(1, parseInt(v) || 1))}
            />
          </Field>

          <div className="sim-subsection-title">Bandwidth limit</div>
          <div className="sim-row-2">
            <Field label="Upload (kbps)">
              <Input
                type="number"
                value={draft.bandwidth.uploadKbps}
                onChange={v => setB('uploadKbps', Math.max(0, parseInt(v) || 0))}
                placeholder="0 = unlimited"
              />
            </Field>
            <Field label="Download (kbps)">
              <Input
                type="number"
                value={draft.bandwidth.downloadKbps}
                onChange={v => setB('downloadKbps', Math.max(0, parseInt(v) || 0))}
                placeholder="0 = unlimited"
              />
            </Field>
          </div>
          {(draft.bandwidth.uploadKbps > 0 || draft.bandwidth.downloadKbps > 0) && (
            <div className="sim-bw-preview">
              ↑ {draft.bandwidth.uploadKbps >= 1024
                ? `${(draft.bandwidth.uploadKbps / 1024).toFixed(1)} Mbps`
                : `${draft.bandwidth.uploadKbps} kbps`
              } &nbsp;/&nbsp; ↓ {draft.bandwidth.downloadKbps >= 1024
                ? `${(draft.bandwidth.downloadKbps / 1024).toFixed(1)} Mbps`
                : `${draft.bandwidth.downloadKbps} kbps`
              }
            </div>
          )}
        </div>
        <div className="sim-modal-footer">
          <button className="sim-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="sim-btn-primary" onClick={() => onSave(draft)}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── User edit modal ───────────────────────────────────────────────────────────

function UserModal({
  user,
  profiles,
  onSave,
  onCancel,
}: {
  user: SimUser
  profiles: SimProfile[]
  onSave: (u: SimUser) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<SimUser>(user)
  const set = <K extends keyof SimUser>(k: K, v: SimUser[K]) =>
    setDraft(d => ({ ...d, [k]: v }))

  return (
    <div className="sim-modal-backdrop" onClick={onCancel}>
      <div className="sim-modal" onClick={e => e.stopPropagation()}>
        <div className="sim-modal-header">
          <span>{user.id ? 'Edit User' : 'New User'}</span>
          <button className="sim-modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="sim-modal-body">
          <Field label="Username">
            <Input value={draft.username} onChange={v => set('username', v)} placeholder="e.g. admin" />
          </Field>
          <Field label="Password">
            <Input value={draft.password} onChange={v => set('password', v)} placeholder="password" />
          </Field>
          <Field label="Profile">
            <Select
              value={draft.profileId}
              onChange={v => set('profileId', v)}
              options={profiles.map(p => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Disabled">
            <div className="sim-toggle-row">
              <Toggle checked={draft.disabled} onChange={v => set('disabled', v)} />
              <span className="sim-toggle-label">{draft.disabled ? 'Disabled' : 'Active'}</span>
            </div>
          </Field>
        </div>
        <div className="sim-modal-footer">
          <button className="sim-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="sim-btn-primary" onClick={() => onSave(draft)}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type EditingProfile = { profile: SimProfile; isNew: boolean } | null
type EditingUser    = { user: SimUser; isNew: boolean } | null

interface Props {
  config: SimConfig
  onChange: (c: SimConfig) => void
}

export default function SimulatorPanel({ config, onChange }: Props) {
  const [editingProfile, setEditingProfile] = useState<EditingProfile>(null)
  const [editingUser, setEditingUser]       = useState<EditingUser>(null)

  const setServer = <K extends keyof SimConfig['server']>(
    k: K, v: SimConfig['server'][K]
  ) => onChange({ ...config, server: { ...config.server, [k]: v } })

  // ── Profile actions ──────────────────────────────────────────────────────
  const handleNewProfile = () =>
    setEditingProfile({
      isNew: true,
      profile: {
        id: `profile-${Date.now()}`,
        name: '',
        sessionTimeLeft: '',
        addressPool: '192.168.88.0/24',
        bandwidth: { uploadKbps: 0, downloadKbps: 0 },
        sharedUsers: 1,
      },
    })

  const handleSaveProfile = (p: SimProfile, isNew: boolean) => {
    onChange({
      ...config,
      profiles: isNew
        ? [...config.profiles, p]
        : config.profiles.map(x => x.id === p.id ? p : x),
    })
    setEditingProfile(null)
  }

  const handleDeleteProfile = (id: string) => {
    onChange({ ...config, profiles: config.profiles.filter(p => p.id !== id) })
  }

  // ── User actions ─────────────────────────────────────────────────────────
  const handleNewUser = () =>
    setEditingUser({
      isNew: true,
      user: {
        id: `user-${Date.now()}`,
        username: '',
        password: '',
        profileId: config.profiles[0]?.id ?? '',
        disabled: false,
      },
    })

  const handleSaveUser = (u: SimUser, isNew: boolean) => {
    onChange({
      ...config,
      users: isNew
        ? [...config.users, u]
        : config.users.map(x => x.id === u.id ? u : x),
    })
    setEditingUser(null)
  }

  const handleDeleteUser = (id: string) => {
    onChange({ ...config, users: config.users.filter(u => u.id !== id) })
  }

  const profileName = (id: string) =>
    config.profiles.find(p => p.id === id)?.name ?? id

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="sim-panel">
      <div className="sim-panel-header">
        <span className="sim-panel-title">SIMULATOR</span>
      </div>

      <div className="sim-panel-body">

        {/* Engine Mode */}
        <Section title="Engine Mode">
          <div className="sim-engine-badge routeros">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              <path d="M8 3.5a.75.75 0 01.75.75v3.793l1.98 1.98a.75.75 0 01-1.06 1.06l-2.25-2.25A.75.75 0 017.25 8V4.25A.75.75 0 018 3.5z" />
            </svg>
            RouterOS
          </div>
          <div className="sim-engine-other-label">Other engines — coming soon</div>
          <div className="sim-engine-others">
            {['OpenWrt (LuCI)', 'pfSense', 'Cisco ISE', 'Custom'].map(name => (
              <div key={name} className="sim-engine-badge disabled">{name}</div>
            ))}
          </div>
        </Section>

        {/* Server */}
        <Section title="Server">
          <Field label="Hostname">
            <Input
              value={config.server.hostname}
              onChange={v => setServer('hostname', v)}
              placeholder="hotspot.local"
            />
          </Field>
          <Field label="Server name (identity)">
            <Input
              value={config.server.serverName}
              onChange={v => setServer('serverName', v)}
              placeholder="MikroTik Hotspot"
            />
          </Field>
          <Field label="Login page">
            <Input
              value={config.server.loginPage}
              onChange={v => setServer('loginPage', v)}
              placeholder="login.html"
            />
          </Field>
        </Section>

        {/* Captive Portal */}
        <Section title="Captive Portal">
          <div className="sim-toggle-field">
            <div className="sim-toggle-info">
              <span className="sim-toggle-name">Captive redirect</span>
              <span className="sim-toggle-desc">Intercept unauthenticated HTTP requests and redirect to login page</span>
            </div>
            <Toggle
              checked={config.server.captivePortal}
              onChange={v => setServer('captivePortal', v)}
            />
          </div>

          <div className="sim-toggle-field">
            <div className="sim-toggle-info">
              <span className="sim-toggle-name">Trial access</span>
              <span className="sim-toggle-desc">Show <em>Free trial</em> button on login page (<code>login-by=trial</code>)</span>
            </div>
            <Toggle
              checked={config.server.allowTrial}
              onChange={v => setServer('allowTrial', v)}
            />
          </div>

          <div className="sim-toggle-field">
            <div className="sim-toggle-info">
              <span className="sim-toggle-name">Login by MAC</span>
              <span className="sim-toggle-desc">Auto-login clients whose MAC is in the user list</span>
            </div>
            <Toggle
              checked={config.server.loginByMac}
              onChange={v => setServer('loginByMac', v)}
            />
          </div>
        </Section>

        {/* Advertisement */}
        <Section title="Advertisement">
          <div className="sim-toggle-field">
            <div className="sim-toggle-info">
              <span className="sim-toggle-name">Advertisement required</span>
              <span className="sim-toggle-desc">
                Mark session as <code>blocked=yes</code> — user must watch ad before browsing
                (<em>Advertisement required</em> link shown on status page)
              </span>
            </div>
            <Toggle
              checked={config.server.advertRequired}
              onChange={v => setServer('advertRequired', v)}
            />
          </div>

          {config.server.advertRequired && (
            <Field label="Advertisement URL">
              <Input
                value={config.server.advertUrl}
                onChange={v => setServer('advertUrl', v)}
                placeholder="http://example.com/advert"
              />
              <span className="sim-hint">Opened in popup as <code>$(link-advert)</code></span>
            </Field>
          )}
        </Section>

        {/* Profiles */}
        <Section title="Profiles">
          <div className="sim-list-toolbar">
            <button className="sim-btn-ghost sim-btn-sm" onClick={handleNewProfile}>
              <IconPlus /> Add profile
            </button>
          </div>
          <div className="sim-list">
            {config.profiles.length === 0 && (
              <div className="sim-empty">No profiles — add one above</div>
            )}
            {config.profiles.map(p => (
              <div key={p.id} className="sim-list-item">
                <div className="sim-list-item-main">
                  <span className="sim-list-name">{p.name}</span>
                  <div className="sim-list-tags">
                    {p.sessionTimeLeft
                      ? <span className="sim-tag sim-tag-time">⏱ {p.sessionTimeLeft}</span>
                      : <span className="sim-tag sim-tag-muted">no time limit</span>
                    }
                    {(p.bandwidth.uploadKbps > 0 || p.bandwidth.downloadKbps > 0) && (
                      <span className="sim-tag sim-tag-bw">
                        ↑{p.bandwidth.uploadKbps}k / ↓{p.bandwidth.downloadKbps}k
                      </span>
                    )}
                  </div>
                </div>
                <div className="sim-list-actions">
                  <button
                    className="sim-icon-btn"
                    title="Edit"
                    onClick={() => setEditingProfile({ profile: p, isNew: false })}
                  >
                    <IconEdit />
                  </button>
                  <button
                    className="sim-icon-btn sim-icon-btn-danger"
                    title="Delete"
                    onClick={() => handleDeleteProfile(p.id)}
                    disabled={config.profiles.length <= 1}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Users */}
        <Section title="Users">
          <div className="sim-list-toolbar">
            <button className="sim-btn-ghost sim-btn-sm" onClick={handleNewUser}>
              <IconPlus /> Add user
            </button>
          </div>
          <div className="sim-list">
            {config.users.length === 0 && (
              <div className="sim-empty">No users — add one above</div>
            )}
            {config.users.map(u => (
              <div key={u.id} className={`sim-list-item${u.disabled ? ' disabled' : ''}`}>
                <div className="sim-list-item-main">
                  <span className="sim-list-name">{u.username}</span>
                  <div className="sim-list-tags">
                    <span className="sim-tag sim-tag-profile">{profileName(u.profileId)}</span>
                    {u.disabled && <span className="sim-tag sim-tag-disabled">disabled</span>}
                  </div>
                </div>
                <div className="sim-list-actions">
                  <button
                    className="sim-icon-btn"
                    title="Edit"
                    onClick={() => setEditingUser({ user: u, isNew: false })}
                  >
                    <IconEdit />
                  </button>
                  <button
                    className="sim-icon-btn sim-icon-btn-danger"
                    title="Delete"
                    onClick={() => handleDeleteUser(u.id)}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

      </div>

      {/* Modals */}
      {editingProfile && (
        <ProfileModal
          profile={editingProfile.profile}
          onSave={p => handleSaveProfile(p, editingProfile.isNew)}
          onCancel={() => setEditingProfile(null)}
        />
      )}
      {editingUser && (
        <UserModal
          user={editingUser.user}
          profiles={config.profiles}
          onSave={u => handleSaveUser(u, editingUser.isNew)}
          onCancel={() => setEditingUser(null)}
        />
      )}
    </div>
  )
}
