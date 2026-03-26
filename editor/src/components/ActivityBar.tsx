import { useState, useEffect, useRef } from 'react'

export type View = 'explorer' | 'search' | 'github' | 'simulator'

interface Props {
  activeView: View
  onViewChange: (view: View) => void
  hasProject: boolean
  onOpenBrowser: () => void
  githubPendingCount: number
}

const ExplorerSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
)

const SearchSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
)

const SimulatorSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
    <path d="M7 8h2M11 8h6M7 12h4M15 12h2" />
  </svg>
)

const GitHubSvg = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
)

const PlaySvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
  </svg>
)

const BrowserMenuIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM2.5 7.5a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z" />
    <path d="M8 2.5c-.87 0-2.03.79-2.84 2.77A9.636 9.636 0 005 7.5c0 .843.068 1.637.16 2.223C5.97 11.71 7.13 12.5 8 12.5s2.03-.79 2.84-2.777A9.636 9.636 0 0011 7.5c0-.843-.068-1.637-.16-2.223C10.03 3.29 8.87 2.5 8 2.5zM2.5 7.5h11" />
  </svg>
)

export default function ActivityBar({ activeView, onViewChange, hasProject, onOpenBrowser, githubPendingCount }: Props) {
  const [playMenuOpen, setPlayMenuOpen] = useState(false)
  const playWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!playMenuOpen) return
    const close = (e: MouseEvent) => {
      if (!playWrapRef.current?.contains(e.target as Node)) setPlayMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [playMenuOpen])

  return (
    <div className="activity-bar">
      <div className="ab-top">
        <button
          className={`ab-icon${activeView === 'explorer' ? ' active' : ''}`}
          onClick={() => onViewChange('explorer')}
          title="Explorer"
        >
          <ExplorerSvg />
        </button>
        <button
          className={`ab-icon${activeView === 'search' ? ' active' : ''}`}
          onClick={() => onViewChange('search')}
          title="Search"
        >
          <SearchSvg />
        </button>
        <button
          className={`ab-icon${activeView === 'github' ? ' active' : ''}`}
          onClick={() => onViewChange('github')}
          title="GitHub"
          style={{ position: 'relative' }}
        >
          <GitHubSvg />
          {githubPendingCount > 0 && (
            <span className="ab-github-badge">{githubPendingCount}</span>
          )}
        </button>

        {hasProject && (
          <div className="ab-play-wrap" ref={playWrapRef}>
            <button
              className={`ab-icon${playMenuOpen ? ' active' : ''}`}
              onClick={() => setPlayMenuOpen(o => !o)}
              title="Run &amp; Preview"
            >
              <PlaySvg />
            </button>
            {playMenuOpen && (
              <div className="ab-play-menu">
                <div className="ab-play-menu-header">Run &amp; Preview</div>
                <button
                  className="ab-play-menu-item"
                  onClick={() => { onOpenBrowser(); setPlayMenuOpen(false) }}
                >
                  <BrowserMenuIcon />
                  Open Virtual Browser
                </button>
                <div className="ab-play-menu-separator" />
                <div className="ab-play-menu-item ab-play-menu-item-disabled">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                    <path d="M7.25 10.5a.75.75 0 001.5 0V7.75h.5a.75.75 0 100-1.5H8A.75.75 0 007.25 7v3.5zM8 6a.875.875 0 100-1.75A.875.875 0 008 6z" />
                  </svg>
                  Start CLI Server
                  <span className="ab-play-menu-soon">soon</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {hasProject && (
        <div className="ab-bottom">
          <button
            className={`ab-icon${activeView === 'simulator' ? ' active' : ''}`}
            onClick={() => onViewChange('simulator')}
            title="Simulator"
          >
            <SimulatorSvg />
          </button>
        </div>
      )}
    </div>
  )
}
