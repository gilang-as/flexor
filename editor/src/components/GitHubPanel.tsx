import { useState, useEffect, useCallback, useRef } from 'react'
import type { GitHubConfig } from '../types'
import {
  getAuthenticatedUser,
  getUserRepos,
  searchRepos,
  getBranches,
  parseRepoInput,
  type GitHubRepo,
  type GitHubBranch,
} from '../utils/github'

interface Props {
  githubConfig: GitHubConfig | null
  pendingCount: number
  onConnect: (token: string) => Promise<void>
  onDisconnect: () => void
  onOpenRepo: (owner: string, repo: string, branch: string) => Promise<void>
  onOpenPublicRepo: (owner: string, repo: string) => Promise<void>
  onCloseRepo: () => void
  onSwitchBranch: (branch: string) => Promise<void>
  onCommitAndPush: (message: string) => Promise<void>
  onAddToken: (token: string) => Promise<void>
}

// ── Connect screen ────────────────────────────────────────────────────────────

const FINE_GRAINED_URL =
  'https://github.com/settings/personal-access-tokens/new' +
  '?description=flexor-editor&resource_owner=&expiration=90'

const STEPS = [
  {
    num: 1,
    title: 'Buka halaman token GitHub',
    body: (
      <>
        Klik link di bawah untuk membuka halaman pembuatan{' '}
        <strong>Fine-grained token</strong> di GitHub.
        <a
          className="gh-wizard-link"
          href={FINE_GRAINED_URL}
          target="_blank"
          rel="noreferrer"
        >
          Buka GitHub → Settings → Fine-grained tokens ↗
        </a>
      </>
    ),
  },
  {
    num: 2,
    title: 'Pilih repository',
    body: (
      <>
        Di bagian <strong>Repository access</strong>, pilih{' '}
        <code>Only select repositories</code> lalu pilih repo yang ingin dibuka.
      </>
    ),
  },
  {
    num: 3,
    title: 'Set permission',
    body: (
      <>
        Di bagian <strong>Permissions → Repository permissions</strong>, set:{' '}
        <code>Contents → Read and write</code>.<br />
        Permission lain tidak perlu diaktifkan.
      </>
    ),
  },
  {
    num: 4,
    title: 'Generate & paste token',
    body: <>Klik <strong>Generate token</strong>, lalu copy dan paste di bawah.</>,
  },
]

function ConnectScreen({
  onConnect,
  onOpenPublic,
}: {
  onConnect: (token: string) => Promise<void>
  onOpenPublic: (owner: string, repo: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'token' | 'public'>('public')

  // Token tab state
  const [token, setToken] = useState(() => localStorage.getItem('gh_token') ?? '')
  const [showToken, setShowToken] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [tokenError, setTokenError] = useState('')

  // Public tab state
  const [repoInput, setRepoInput] = useState('')
  const [publicLoading, setPublicLoading] = useState(false)
  const [publicError, setPublicError] = useState('')

  const handleConnect = async () => {
    const t = token.trim()
    if (!t) return
    setTokenLoading(true)
    setTokenError('')
    try {
      await onConnect(t)
      localStorage.setItem('gh_token', t)
    } catch (e: unknown) {
      setTokenError(e instanceof Error ? e.message : String(e))
    } finally {
      setTokenLoading(false)
    }
  }

  const handleOpenPublic = async () => {
    const parsed = parseRepoInput(repoInput)
    if (!parsed) {
      setPublicError('Format tidak valid. Contoh: owner/repo atau https://github.com/owner/repo')
      return
    }
    setPublicLoading(true)
    setPublicError('')
    try {
      await onOpenPublic(parsed.owner, parsed.repo)
    } catch (e: unknown) {
      setPublicError(e instanceof Error ? e.message : String(e))
    } finally {
      setPublicLoading(false)
    }
  }

  const tokenType = token.startsWith('github_pat_')
    ? 'fine-grained'
    : token.startsWith('ghp_')
    ? 'classic'
    : token.length > 0
    ? 'unknown'
    : null

  return (
    <div className="gh-connect-wizard">
      <div className="gh-wizard-header">
        <GitHubLogoSvg size={22} />
        <span>Open from GitHub</span>
      </div>

      {/* Tab switcher */}
      <div className="gh-tabs">
        <button
          className={`gh-tab${tab === 'public' ? ' active' : ''}`}
          onClick={() => setTab('public')}
        >
          Public Repo
        </button>
        <button
          className={`gh-tab${tab === 'token' ? ' active' : ''}`}
          onClick={() => setTab('token')}
        >
          With Token
        </button>
      </div>

      {/* ── Public tab ────────────────────────────────────────────────── */}
      {tab === 'public' && (
        <>
          <p className="gh-wizard-step-body" style={{ padding: '0 2px' }}>
            Masukkan URL atau <code>owner/repo</code> dari public repository.
            Read-only — tidak perlu login.
          </p>
          <input
            className="gh-input"
            placeholder="owner/repo atau https://github.com/…"
            value={repoInput}
            onChange={e => setRepoInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleOpenPublic()}
            autoComplete="off"
            spellCheck={false}
          />
          {publicError && <div className="gh-error">{publicError}</div>}
          <button
            className="gh-btn-primary"
            onClick={handleOpenPublic}
            disabled={publicLoading || !repoInput.trim()}
          >
            {publicLoading ? 'Membuka…' : 'Open'}
          </button>
        </>
      )}

      {/* ── Token tab ─────────────────────────────────────────────────── */}
      {tab === 'token' && (
        <>
          <div className="gh-wizard-badge">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5zm-.75 7a.875.875 0 110-1.75.875.875 0 010 1.75z" />
            </svg>
            Fine-grained token — per-repo, minimal permission
          </div>

          <ol className="gh-wizard-steps">
            {STEPS.map(s => (
              <li key={s.num} className="gh-wizard-step">
                <div className="gh-wizard-step-num">{s.num}</div>
                <div className="gh-wizard-step-content">
                  <div className="gh-wizard-step-title">{s.title}</div>
                  <div className="gh-wizard-step-body">{s.body}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="gh-wizard-input-wrap">
            <input
              className="gh-input gh-token-input"
              type={showToken ? 'text' : 'password'}
              placeholder="github_pat_…"
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="gh-token-toggle"
              type="button"
              onClick={() => setShowToken(v => !v)}
              title={showToken ? 'Sembunyikan' : 'Tampilkan'}
            >
              {showToken ? (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M.143 2.31a.75.75 0 011.047-.167l14.5 10.5a.75.75 0 11-.88 1.214l-2.248-1.628C11.346 12.685 9.792 13 8 13c-3.3 0-6.105-1.83-7.677-3.985a.75.75 0 010-.872C1.41 6.744 2.862 5.406 4.5 4.61L.31 1.357A.75.75 0 01.143 2.31zm5.757 4.167l1.944 1.407A1.5 1.5 0 008 8a1.5 1.5 0 00-2.1-1.523zM8 3c3.3 0 6.105 1.83 7.677 3.985a.75.75 0 010 .872C14.59 9.256 13.138 10.594 11.5 11.39L9.35 9.837A3 3 0 005.163 6.65L3.01 5.097C4.163 4.33 5.991 3 8 3z" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M8 2c3.3 0 6.105 1.83 7.677 3.985a.75.75 0 010 .87C14.105 8.861 11.3 10.69 8 10.69s-6.105-1.828-7.677-3.835a.75.75 0 010-.87C1.895 3.83 4.7 2 8 2zm0 7.19c2.593 0 4.93-1.319 6.335-3.185C12.93 4.139 10.593 2.75 8 2.75S3.07 4.14 1.665 5.996C3.07 7.871 5.407 9.19 8 9.19zM8 4.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                </svg>
              )}
            </button>
          </div>

          {tokenType === 'classic' && (
            <div className="gh-token-warning">
              ⚠ Token classic terdeteksi. Fine-grained token lebih aman (prefix: <code>github_pat_</code>).
            </div>
          )}
          {tokenType === 'fine-grained' && (
            <div className="gh-token-ok">✓ Fine-grained token terdeteksi.</div>
          )}

          {tokenError && <div className="gh-error">{tokenError}</div>}

          <button
            className="gh-btn-primary"
            onClick={handleConnect}
            disabled={tokenLoading || !token.trim()}
          >
            {tokenLoading ? 'Memverifikasi…' : 'Connect'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Repo browser ──────────────────────────────────────────────────────────────

function RepoBrowser({
  token,
  onOpen,
  onDisconnect,
}: {
  token: string
  onOpen: (owner: string, repo: string, branch: string) => Promise<void>
  onDisconnect: () => void
}) {
  const [user, setUser] = useState<{ login: string; name: string | null } | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getAuthenticatedUser(token)
      .then(setUser)
      .catch(() => setUser(null))

    setLoading(true)
    getUserRepos(token)
      .then(data => { setRepos(data); setError('') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setLoading(true)
      getUserRepos(token)
        .then(data => { setRepos(data); setError('') })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchRepos(token, query)
        setRepos(data)
        setError('')
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }, 400)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const handleOpen = useCallback(async (repo: GitHubRepo) => {
    const key = repo.full_name
    setOpening(key)
    try {
      await onOpen(repo.owner.login, repo.name, repo.default_branch)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOpening(null)
    }
  }, [onOpen])

  return (
    <div className="gh-repobrowser">
      <div className="gh-user-row">
        <GitHubLogoSvg size={14} />
        <span className="gh-user-name">{user?.name ?? user?.login ?? '…'}</span>
        <span className="gh-user-login">@{user?.login}</span>
        <button className="gh-btn-text gh-disconnect-btn" onClick={onDisconnect} title="Disconnect">
          Logout
        </button>
      </div>
      <div className="gh-search-wrap">
        <input
          className="gh-input"
          placeholder="Cari repository…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {error && <div className="gh-error">{error}</div>}
      <div className="gh-repo-list">
        {loading && <div className="gh-loading">Memuat…</div>}
        {!loading && repos.length === 0 && <div className="gh-empty">Tidak ada repository.</div>}
        {repos.map(repo => (
          <div key={repo.full_name} className="gh-repo-item">
            <div className="gh-repo-main">
              <span className="gh-repo-private">{repo.private ? '🔒' : '📄'}</span>
              <div className="gh-repo-info">
                <span className="gh-repo-name">{repo.full_name}</span>
                {repo.description && <span className="gh-repo-desc">{repo.description}</span>}
              </div>
            </div>
            <button
              className="gh-btn-open"
              onClick={() => handleOpen(repo)}
              disabled={opening === repo.full_name}
            >
              {opening === repo.full_name ? '…' : 'Open'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Repo panel (repo already open) ───────────────────────────────────────────

function RepoPanel({
  config,
  pendingCount,
  onCloseRepo,
  onSwitchBranch,
  onCommitAndPush,
  onAddToken,
}: {
  config: GitHubConfig
  pendingCount: number
  onCloseRepo: () => void
  onSwitchBranch: (branch: string) => Promise<void>
  onCommitAndPush: (message: string) => Promise<void>
  onAddToken: (token: string) => Promise<void>
}) {
  const isReadOnly = !config.token
  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [branchLoading, setBranchLoading] = useState(false)
  const [branchError, setBranchError] = useState('')
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [commitSuccess, setCommitSuccess] = useState(false)
  // Add-token inline form
  const [showTokenForm, setShowTokenForm] = useState(false)
  const [addToken, setAddToken] = useState('')
  const [addTokenLoading, setAddTokenLoading] = useState(false)
  const [addTokenError, setAddTokenError] = useState('')

  useEffect(() => {
    setBranchLoading(true)
    getBranches(config.token, config.owner, config.repo)
      .then(data => { setBranches(data); setBranchError('') })
      .catch(e => setBranchError(e.message))
      .finally(() => setBranchLoading(false))
  }, [config.token, config.owner, config.repo])

  const handleSwitchBranch = async (branch: string) => {
    if (branch === config.branch) return
    setSwitchingTo(branch)
    try {
      await onSwitchBranch(branch)
    } finally {
      setSwitchingTo(null)
    }
  }

  const handleAddToken = async () => {
    const t = addToken.trim()
    if (!t) return
    setAddTokenLoading(true)
    setAddTokenError('')
    try {
      await onAddToken(t)
      localStorage.setItem('gh_token', t)
      setShowTokenForm(false)
      setAddToken('')
    } catch (e: unknown) {
      setAddTokenError(e instanceof Error ? e.message : String(e))
    } finally {
      setAddTokenLoading(false)
    }
  }

  const handleCommit = async () => {
    const msg = commitMsg.trim()
    if (!msg || pendingCount === 0) return
    setCommitting(true)
    setCommitError('')
    setCommitSuccess(false)
    try {
      await onCommitAndPush(msg)
      setCommitMsg('')
      setCommitSuccess(true)
      setTimeout(() => setCommitSuccess(false), 3000)
    } catch (e: unknown) {
      setCommitError(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="gh-repopanel">
      {/* Repo header */}
      <div className="gh-panel-section">
        <div className="gh-panel-repo-row">
          <GitHubLogoSvg size={14} />
          <span className="gh-panel-repo-name">{config.owner}/{config.repo}</span>
          <button className="gh-btn-text" onClick={onCloseRepo} title="Close repository">✕</button>
        </div>
        {isReadOnly && (
          <div className="gh-readonly-badge">Read-only</div>
        )}
      </div>

      {/* Branch */}
      <div className="gh-panel-section">
        <div className="gh-panel-label">Branch</div>
        {branchError && <div className="gh-error">{branchError}</div>}
        <div className="gh-branch-list">
          {branchLoading && <div className="gh-loading">Memuat branch…</div>}
          {branches.map(b => (
            <button
              key={b.name}
              className={`gh-branch-item${b.name === config.branch ? ' active' : ''}`}
              onClick={() => handleSwitchBranch(b.name)}
              disabled={switchingTo !== null}
            >
              <span className="gh-branch-icon">
                {b.name === config.branch ? '◉' : '○'}
              </span>
              <span className="gh-branch-name">{b.name}</span>
              {switchingTo === b.name && <span className="gh-branch-loading">…</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Commit & Push (or read-only notice) */}
      <div className="gh-panel-section">
        <div className="gh-panel-label">
          Commit &amp; Push
          {pendingCount > 0 && (
            <span className="gh-pending-badge">{pendingCount}</span>
          )}
        </div>
        {isReadOnly ? (
          <>
            <div className="gh-readonly-notice">
              Repository dibuka sebagai read-only.<br />
              Tambahkan token untuk bisa commit &amp; push.
            </div>
            {!showTokenForm ? (
              <button className="gh-btn-primary" onClick={() => setShowTokenForm(true)}>
                Add Token
              </button>
            ) : (
              <>
                <input
                  className="gh-input"
                  type="password"
                  placeholder="github_pat_…"
                  value={addToken}
                  onChange={e => setAddToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddToken()}
                  autoComplete="off"
                  spellCheck={false}
                />
                {addTokenError && <div className="gh-error" style={{ marginTop: 6 }}>{addTokenError}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    className="gh-btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleAddToken}
                    disabled={addTokenLoading || !addToken.trim()}
                  >
                    {addTokenLoading ? 'Menyimpan…' : 'Simpan'}
                  </button>
                  <button
                    className="gh-btn-text"
                    onClick={() => { setShowTokenForm(false); setAddToken(''); setAddTokenError('') }}
                  >
                    Batal
                  </button>
                </div>
              </>
            )}
          </>
        ) : pendingCount === 0 ? (
          <div className="gh-empty">Tidak ada perubahan.</div>
        ) : (
          <>
            <textarea
              className="gh-commit-input"
              placeholder="Pesan commit…"
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              rows={3}
            />
            {commitError && <div className="gh-error">{commitError}</div>}
            {commitSuccess && <div className="gh-success">✓ Berhasil di-push!</div>}
            <button
              className="gh-btn-primary"
              onClick={handleCommit}
              disabled={committing || !commitMsg.trim()}
            >
              {committing ? 'Pushing…' : `Commit & Push (${pendingCount} file)`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function GitHubLogoSvg({ size = 24 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GitHubPanel({
  githubConfig,
  pendingCount,
  onConnect,
  onDisconnect,
  onOpenRepo,
  onOpenPublicRepo,
  onCloseRepo,
  onSwitchBranch,
  onCommitAndPush,
  onAddToken,
}: Props) {
  const savedToken = localStorage.getItem('gh_token') ?? ''
  const [connected, setConnected] = useState(!!savedToken && !githubConfig)

  useEffect(() => {
    if (!githubConfig) {
      const t = localStorage.getItem('gh_token') ?? ''
      setConnected(!!t)
    }
  }, [githubConfig])

  const handleConnect = async (token: string) => {
    await onConnect(token)
    setConnected(true)
  }

  const handleDisconnect = () => {
    localStorage.removeItem('gh_token')
    setConnected(false)
    onDisconnect()
  }

  if (githubConfig) {
    return (
      <RepoPanel
        config={githubConfig}
        pendingCount={pendingCount}
        onCloseRepo={onCloseRepo}
        onSwitchBranch={onSwitchBranch}
        onCommitAndPush={onCommitAndPush}
        onAddToken={onAddToken}
      />
    )
  }

  if (connected && savedToken) {
    return (
      <RepoBrowser
        token={savedToken}
        onOpen={onOpenRepo}
        onDisconnect={handleDisconnect}
      />
    )
  }

  return <ConnectScreen onConnect={handleConnect} onOpenPublic={onOpenPublicRepo} />
}
