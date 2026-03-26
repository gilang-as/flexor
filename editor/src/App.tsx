import { useState, useCallback } from 'react'
import JSZip from 'jszip'
import ActivityBar from './components/ActivityBar'
import type { View } from './components/ActivityBar'
import ExplorerPanel from './components/ExplorerPanel'
import SearchPanel from './components/SearchPanel'
import SimulatorPanel from './components/SimulatorPanel'
import GitHubPanel from './components/GitHubPanel'
import EditorArea from './components/EditorArea'
import ProblemsPanel, { MOCK_DIAGNOSTICS } from './components/ProblemsPanel'
import type { FileNode, EditorTab, Diagnostic, SimConfig, GitHubConfig } from './types'
import { DEFAULT_SIM_CONFIG, BROWSER_TAB_PATH } from './types'
import { readDirectory, readTextFiles, writeFileContentByPath } from './utils/fs'
import { IGNORE } from './utils/fs'
import {
  getAuthenticatedUser,
  getDefaultBranch,
  getBranchRef,
  getRepoTree,
  getFileContent,
  commitAndPush,
  buildFileTree,
} from './utils/github'
import './App.css'

function TitleBar({ activeTabPath }: { activeTabPath: string | null }) {
  return (
    <div className="title-bar">
      <div className="title-bar-logo">
        <span className="title-logo-flex">flex</span><span className="title-logo-or">or</span>
      </div>
      <div className="title-bar-center">
        {activeTabPath ?? ''}
      </div>
    </div>
  )
}

function StatusBar({
  activeTab,
  rootName,
  errorCount,
  warningCount,
  onToggleProblems,
  browserTabOpen,
  onOpenBrowser,
  hasProject,
  githubConfig,
  pendingCount,
  onOpenGitHub,
}: {
  activeTab: EditorTab | undefined
  rootName: string
  errorCount: number
  warningCount: number
  onToggleProblems: () => void
  browserTabOpen: boolean
  onOpenBrowser: () => void
  hasProject: boolean
  githubConfig: GitHubConfig | null
  pendingCount: number
  onOpenGitHub: () => void
}) {
  return (
    <div className="status-bar">
      <div className="status-left">
        {rootName && (
          <span className="status-item status-folder">
            <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
              <path d="M1.5 3A1.5 1.5 0 000 4.5v1.293l4.354 4.353a1.5 1.5 0 002.121 0L14.5 2.121V1.5A1.5 1.5 0 0013 0H3A1.5 1.5 0 001.5 1.5V3zm0 0" />
            </svg>
            {rootName}
          </span>
        )}
        {githubConfig && (
          <button className="status-item status-branch-btn" onClick={onOpenGitHub} title="GitHub branch">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7.5A1 1 0 006.5 9.5v1.128a2.251 2.251 0 11-1.5 0V9.5A2.5 2.5 0 017.5 7H9A1 1 0 0010 6V5.372a2.25 2.25 0 01-0.5-2.122zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
            </svg>
            {githubConfig.branch}
            {pendingCount > 0 && <span className="status-pending-dot" title={`${pendingCount} pending changes`}>{pendingCount}↑</span>}
          </button>
        )}
        <button className="status-item status-diagnostics" onClick={onToggleProblems} title="Toggle Problems panel">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a.875.875 0 110-1.75.875.875 0 010 1.75z" />
          </svg>
          <span className={errorCount > 0 ? 'status-diag-error' : ''}>{errorCount}</span>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style={{ marginLeft: 4 }}>
            <path d="M7.097 2.51L1.168 12.51A1.044 1.044 0 002.07 14h11.86a1.044 1.044 0 00.902-1.49L8.903 2.51a1.044 1.044 0 00-1.806 0zM8 5.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 5.5zm0 6.5a.875.875 0 110-1.75.875.875 0 010 1.75z" />
          </svg>
          <span className={warningCount > 0 ? 'status-diag-warning' : ''}>{warningCount}</span>
        </button>
      </div>
      <div className="status-right">
        {hasProject && !browserTabOpen && (
          <button className="status-item status-preview-btn" onClick={onOpenBrowser} title="Open Virtual Browser">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM2.5 7.5a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z" />
              <path d="M8 2.5c-.87 0-2.03.79-2.84 2.77A9.636 9.636 0 005 7.5c0 .843.068 1.637.16 2.223C5.97 11.71 7.13 12.5 8 12.5s2.03-.79 2.84-2.777A9.636 9.636 0 0011 7.5c0-.843-.068-1.637-.16-2.223C10.03 3.29 8.87 2.5 8 2.5zM2.5 7.5h11" />
            </svg>
            Preview
          </button>
        )}
        {activeTab?.fileType === 'text' && (
          <>
            <span className="status-item">{activeTab.language}</span>
            <span className="status-item">UTF-8</span>
          </>
        )}
        {activeTab?.fileType === 'image' && (
          <span className="status-item">Image</span>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>('explorer')
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [rootName, setRootName] = useState('')
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [navigateTo, setNavigateTo] = useState<{ line: number; token: number } | null>(null)
  const [problemsOpen, setProblemsOpen] = useState(false)

  // ── GitHub state ──────────────────────────────────────────────────────────
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null)
  // pending changes: path → new content (to be committed)
  const [githubPending, setGithubPending] = useState<Record<string, string>>({})
  const [diagnostics] = useState<Diagnostic[]>(MOCK_DIAGNOSTICS)
  const [simConfig, setSimConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG)
  const [templateFiles, setTemplateFiles] = useState<Record<string, string>>({})

  const handleOpenFolder = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      const tree = await readDirectory(handle)
      setRootHandle(handle)
      setRootName(handle.name)
      setFileTree(tree)
      // Read all text files so WASM can render templates without disk access
      readTextFiles(handle).then(setTemplateFiles)
    } catch {
      // user cancelled
    }
  }, [])

  // When project is closed, go back to explorer view
  const hasProject = rootHandle !== null || githubConfig !== null

  const handleOpenFile = useCallback((tab: EditorTab, line?: number) => {
    setTabs(prev => {
      if (prev.some(t => t.path === tab.path)) return prev
      return [...prev, tab]
    })
    setActiveTabPath(tab.path)
    if (line !== undefined) setNavigateTo({ line, token: Date.now() })
  }, [])

  const handleTabSelect = useCallback((path: string) => {
    setActiveTabPath(path)
  }, [])

  const handleTabClose = useCallback((path: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.path === path)
      const next = prev.filter(t => t.path !== path)
      if (path === activeTabPath) {
        setActiveTabPath(next.length > 0 ? next[Math.min(idx, next.length - 1)].path : null)
      }
      return next
    })
  }, [activeTabPath])

  const handleMarkDirty = useCallback((path: string) => {
    setTabs(prev => prev.map(t => t.path === path ? { ...t, isDirty: true } : t))
  }, [])

  const handleSave = useCallback(async (path: string, content: string) => {
    const tab = tabs.find(t => t.path === path)
    if (!tab) return

    // ── GitHub mode: stage the change ────────────────────────────────────────
    if (githubConfig && !tab.handle) {
      setGithubPending(prev => ({ ...prev, [path]: content }))
      setTabs(prev => prev.map(t => t.path === path ? { ...t, isDirty: false } : t))
      setTemplateFiles(prev => ({ ...prev, [path]: content }))
      return
    }

    // ── Local mode: write to disk ─────────────────────────────────────────────
    if (!tab.handle) return
    try {
      const writable = await tab.handle.createWritable()
      await writable.write(content)
      await writable.close()
      setTabs(prev => prev.map(t => t.path === path ? { ...t, isDirty: false } : t))
      setTemplateFiles(prev => ({ ...prev, [path]: content }))
    } catch (e) {
      console.error('Save failed:', e)
    }
  }, [tabs, githubConfig])

  // ── GitHub handlers ───────────────────────────────────────────────────────

  /** Validate token by calling /user */
  const handleGitHubConnect = useCallback(async (token: string) => {
    await getAuthenticatedUser(token) // throws if invalid
  }, [])

  /** Load a repo's file tree and all text files for WASM */
  const handleOpenFromGitHub = useCallback(async (owner: string, repo: string, branch: string) => {
    const token = localStorage.getItem('gh_token') ?? ''
    const defaultBranch = branch || await getDefaultBranch(token, owner, repo)
    const { treeSha } = await getBranchRef(token, owner, repo, defaultBranch)
    const items = await getRepoTree(token, owner, repo, treeSha)
    const tree = buildFileTree(items)

    // Eagerly load all text files for WASM
    const textFiles: Record<string, string> = {}
    const blobs = items.filter(i => i.type === 'blob')
    await Promise.all(
      blobs.map(async item => {
        const ext = item.path.split('.').pop()?.toLowerCase() ?? ''
        const textExts = ['html', 'htm', 'txt', 'js', 'css', 'json', 'xml', 'xsd', 'md', 'ts', 'tsx']
        if (textExts.includes(ext)) {
          try {
            textFiles[item.path] = await getFileContent(token, owner, repo, item.path, defaultBranch)
          } catch { /* skip */ }
        }
      }),
    )

    setGithubConfig({ token, owner, repo, branch: defaultBranch })
    setGithubPending({})
    setRootHandle(null)
    setRootName(`${owner}/${repo}`)
    setFileTree(tree)
    setTemplateFiles(textFiles)
    setTabs([])
    setActiveTabPath(null)
    setView('explorer')
  }, [])

  /** Switch to a different branch */
  const handleSwitchBranch = useCallback(async (branch: string) => {
    if (!githubConfig) return
    const { token, owner, repo } = githubConfig
    const { treeSha } = await getBranchRef(token, owner, repo, branch)
    const items = await getRepoTree(token, owner, repo, treeSha)
    const tree = buildFileTree(items)

    const textFiles: Record<string, string> = {}
    const blobs = items.filter(i => i.type === 'blob')
    await Promise.all(
      blobs.map(async item => {
        const ext = item.path.split('.').pop()?.toLowerCase() ?? ''
        const textExts = ['html', 'htm', 'txt', 'js', 'css', 'json', 'xml', 'xsd', 'md', 'ts', 'tsx']
        if (textExts.includes(ext)) {
          try {
            textFiles[item.path] = await getFileContent(token, owner, repo, item.path, branch)
          } catch { /* skip */ }
        }
      }),
    )

    setGithubConfig(prev => prev ? { ...prev, branch } : prev)
    setGithubPending({})
    setFileTree(tree)
    setTemplateFiles(textFiles)
    setTabs([])
    setActiveTabPath(null)
  }, [githubConfig])

  /** Commit and push all pending changes */
  const handleCommitAndPush = useCallback(async (message: string) => {
    if (!githubConfig) return
    const changes = Object.entries(githubPending).map(([path, content]) => ({ path, content }))
    if (changes.length === 0) return
    await commitAndPush(
      githubConfig.token,
      githubConfig.owner,
      githubConfig.repo,
      githubConfig.branch,
      changes,
      message,
    )
    setGithubPending({})
  }, [githubConfig, githubPending])

  /** Disconnect from GitHub and clear all state */
  const handleGitHubDisconnect = useCallback(() => {
    setGithubConfig(null)
    setGithubPending({})
    setRootName('')
    setFileTree([])
    setTemplateFiles({})
    setTabs([])
    setActiveTabPath(null)
  }, [])

  /** Open a public repo without a token (read-only) */
  const handleOpenPublicRepo = useCallback(async (owner: string, repo: string) => {
    await handleOpenFromGitHub(owner, repo, '')
  }, [handleOpenFromGitHub])

  /** Add token to an already-open public repo (upgrade to read-write) */
  const handleAddToken = useCallback(async (token: string) => {
    if (!githubConfig) return
    // Verify token works
    await getAuthenticatedUser(token)
    setGithubConfig(prev => prev ? { ...prev, token } : prev)
  }, [githubConfig])

  /** Replace file content — used by SearchPanel for replace-all */
  const handleReplaceInFile = useCallback(async (filePath: string, newContent: string) => {
    // Update tab if open
    setTabs(prev => prev.map(t => t.path === filePath ? { ...t, content: newContent, isDirty: false } : t))
    setTemplateFiles(prev => ({ ...prev, [filePath]: newContent }))
    if (githubConfig && !rootHandle) {
      setGithubPending(prev => ({ ...prev, [filePath]: newContent }))
    } else if (rootHandle) {
      await writeFileContentByPath(rootHandle, filePath, newContent)
    }
  }, [githubConfig, rootHandle])

  const activeTab = tabs.find(t => t.path === activeTabPath)
  const browserTabOpen = tabs.some(t => t.path === BROWSER_TAB_PATH)
  const githubPendingCount = Object.keys(githubPending).length

  /** Download all project files as a ZIP archive */
  const handleDownloadZip = useCallback(async () => {
    const zip = new JSZip()
    const name = (rootName || 'project').replace(/\//g, '-')

    if (rootHandle) {
      // Local mode: recursively read all files including binary
      const addDir = async (dirHandle: FileSystemDirectoryHandle, basePath: string) => {
        for await (const [entryName, handle] of (dirHandle as any).entries()) {
          if (IGNORE.has(entryName)) continue
          const path = basePath ? `${basePath}/${entryName}` : entryName
          if (handle.kind === 'directory') {
            await addDir(handle as FileSystemDirectoryHandle, path)
          } else {
            const file = await (handle as FileSystemFileHandle).getFile()
            zip.file(path, file)
          }
        }
      }
      await addDir(rootHandle, '')
    } else if (githubConfig) {
      // GitHub mode: zip from templateFiles (text + data-URL images)
      for (const [path, content] of Object.entries(templateFiles)) {
        if (content.startsWith('data:')) {
          const base64 = content.split(',')[1]
          zip.file(path, base64, { base64: true })
        } else {
          zip.file(path, content)
        }
      }
    } else {
      return
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }, [rootHandle, githubConfig, templateFiles, rootName])

  const handleOpenBrowser = useCallback(() => {
    setTabs(prev => {
      if (prev.some(t => t.path === BROWSER_TAB_PATH)) return prev
      return [...prev, {
        path: BROWSER_TAB_PATH,
        name: 'Virtual Browser',
        content: '',
        language: '',
        isDirty: false,
        fileType: 'browser' as const,
      }]
    })
    setActiveTabPath(BROWSER_TAB_PATH)
  }, [])
  const errorCount   = diagnostics.filter(d => d.severity === 'error').length
  const warningCount = diagnostics.filter(d => d.severity === 'warning').length

  const handleGoToDiagnostic = useCallback((d: Diagnostic) => {
    // Open the file if it's already in tabs, otherwise just navigate
    const existing = tabs.find(t => t.path === d.filePath)
    if (existing) {
      setActiveTabPath(d.filePath)
      setNavigateTo({ line: d.line, token: Date.now() })
    }
    // When real LSP is wired: open file from root handle & navigate
  }, [tabs])

  return (
    <div className="app">
      <TitleBar activeTabPath={activeTabPath} />
      <div className="app-body">
        <ActivityBar
          activeView={view}
          onViewChange={setView}
          hasProject={hasProject}
          onOpenBrowser={handleOpenBrowser}
          githubPendingCount={githubPendingCount}
        />
        <div className="sidebar" style={{ display: view === 'simulator' ? 'none' : undefined }}>
          <div className="sidebar-header">
            <span>
              {view === 'explorer' ? (rootName.toUpperCase() || 'EXPLORER')
                : view === 'github' ? 'GITHUB'
                : 'SEARCH'}
            </span>
            {view === 'explorer' && hasProject && (
              <button
                className="sidebar-action-btn"
                onClick={handleDownloadZip}
                title="Download as ZIP"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M7.47 10.78a.75.75 0 001.06 0l3.75-3.75a.75.75 0 00-1.06-1.06L8.75 8.44V1.75a.75.75 0 00-1.5 0v6.69L4.78 5.97a.75.75 0 00-1.06 1.06l3.75 3.75zM1.75 13.5a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H1.75z"/>
                </svg>
              </button>
            )}
          </div>
          {view === 'explorer' && (
            <ExplorerPanel
              rootHandle={rootHandle}
              fileTree={fileTree}
              activeFilePath={activeTabPath}
              onOpenFolder={handleOpenFolder}
              onOpenFromGitHub={() => setView('github')}
              onUpdateTree={setFileTree}
              onOpenFile={handleOpenFile}
              githubConfig={githubConfig}
            />
          )}
          {view === 'search' && (
            <SearchPanel
              rootHandle={rootHandle}
              githubConfig={githubConfig}
              templateFiles={templateFiles}
              onOpenFile={handleOpenFile}
              onReplaceInFile={handleReplaceInFile}
            />
          )}
          {view === 'github' && (
            <GitHubPanel
              githubConfig={githubConfig}
              pendingCount={githubPendingCount}
              onConnect={handleGitHubConnect}
              onDisconnect={handleGitHubDisconnect}
              onOpenRepo={handleOpenFromGitHub}
              onOpenPublicRepo={handleOpenPublicRepo}
              onCloseRepo={handleGitHubDisconnect}
              onSwitchBranch={handleSwitchBranch}
              onCommitAndPush={handleCommitAndPush}
              onAddToken={handleAddToken}
            />
          )}
        </div>
        {view === 'simulator' && (
          <SimulatorPanel config={simConfig} onChange={setSimConfig} />
        )}
        <div className="editor-problems-wrap">
          <EditorArea
            tabs={tabs}
            activeTabPath={activeTabPath}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
            onMarkDirty={handleMarkDirty}
            onSave={handleSave}
            navigateTo={navigateTo}
            simConfig={simConfig}
            templateFiles={templateFiles}
          />
          {problemsOpen && (
            <ProblemsPanel
              diagnostics={diagnostics}
              onClose={() => setProblemsOpen(false)}
              onGoTo={handleGoToDiagnostic}
            />
          )}
        </div>
      </div>
      <StatusBar
        activeTab={activeTab}
        rootName={rootName}
        errorCount={errorCount}
        warningCount={warningCount}
        onToggleProblems={() => setProblemsOpen(o => !o)}
        browserTabOpen={browserTabOpen}
        onOpenBrowser={handleOpenBrowser}
        hasProject={hasProject}
        githubConfig={githubConfig}
        pendingCount={githubPendingCount}
        onOpenGitHub={() => setView('github')}
      />
    </div>
  )
}
