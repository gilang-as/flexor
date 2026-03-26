import { useState, useCallback } from 'react'
import ActivityBar from './components/ActivityBar'
import type { View } from './components/ActivityBar'
import ExplorerPanel from './components/ExplorerPanel'
import SearchPanel from './components/SearchPanel'
import SimulatorPanel from './components/SimulatorPanel'
import EditorArea from './components/EditorArea'
import ProblemsPanel, { MOCK_DIAGNOSTICS } from './components/ProblemsPanel'
import type { FileNode, EditorTab, Diagnostic, SimConfig } from './types'
import { DEFAULT_SIM_CONFIG, BROWSER_TAB_PATH } from './types'
import { readDirectory, readTextFiles } from './utils/fs'
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
}: {
  activeTab: EditorTab | undefined
  rootName: string
  errorCount: number
  warningCount: number
  onToggleProblems: () => void
  browserTabOpen: boolean
  onOpenBrowser: () => void
  hasProject: boolean
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
  const hasProject = rootHandle !== null

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
    if (!tab || !tab.handle) return
    try {
      const writable = await tab.handle.createWritable()
      await writable.write(content)
      await writable.close()
      setTabs(prev => prev.map(t => t.path === path ? { ...t, isDirty: false } : t))
      // Sync saved content into templateFiles so WASM hot-reloads the template
      setTemplateFiles(prev => ({ ...prev, [path]: content }))
    } catch (e) {
      console.error('Save failed:', e)
    }
  }, [tabs])

  const activeTab = tabs.find(t => t.path === activeTabPath)
  const browserTabOpen = tabs.some(t => t.path === BROWSER_TAB_PATH)

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
        <ActivityBar activeView={view} onViewChange={setView} hasProject={hasProject} onOpenBrowser={handleOpenBrowser} />
        <div className="sidebar" style={{ display: view === 'simulator' ? 'none' : undefined }}>
          <div className="sidebar-header">
            {view === 'explorer' ? (rootName.toUpperCase() || 'EXPLORER') : 'SEARCH'}
          </div>
          {view === 'explorer' ? (
            <ExplorerPanel
              rootHandle={rootHandle}
              fileTree={fileTree}
              activeFilePath={activeTabPath}
              onOpenFolder={handleOpenFolder}
              onUpdateTree={setFileTree}
              onOpenFile={handleOpenFile}
            />
          ) : (
            <SearchPanel
              rootHandle={rootHandle}
              onOpenFile={handleOpenFile}
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
      />
    </div>
  )
}
