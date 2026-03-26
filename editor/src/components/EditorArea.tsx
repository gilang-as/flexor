import { useEffect, useRef, useCallback } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { EditorTab, SimConfig } from '../types'
import ImagePreview from './ImagePreview'
import VirtualBrowser from './VirtualBrowser'

interface Props {
  tabs: EditorTab[]
  activeTabPath: string | null
  onTabSelect: (path: string) => void
  onTabClose: (path: string) => void
  onMarkDirty: (path: string) => void
  onSave: (path: string, content: string) => void
  navigateTo: { line: number; token: number } | null
  simConfig: SimConfig
}

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const BrowserTabIcon = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}>
    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM2.5 7.5a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z" />
    <path d="M8 2.5c-.87 0-2.03.79-2.84 2.77A9.792 9.792 0 005 7.5c0 .843.068 1.637.16 2.223C5.97 11.71 7.13 12.5 8 12.5s2.03-.79 2.84-2.777c.092-.586.16-1.38.16-2.223s-.068-1.637-.16-2.223C10.03 3.29 8.87 2.5 8 2.5zM2.5 7.5h11" />
  </svg>
)

export default function EditorArea({
  tabs, activeTabPath, onTabSelect, onTabClose, onMarkDirty, onSave, navigateTo, simConfig,
}: Props) {
  // Use refs so Monaco command callbacks always see latest values without re-registering
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const activeTabPathRef = useRef(activeTabPath)
  activeTabPathRef.current = activeTabPath
  // Pending navigation for when editor remounts on tab change
  const pendingNavRef = useRef<number | null>(null)

  const activeTab = tabs.find(t => t.path === activeTabPath)

  // When navigateTo changes, either navigate immediately (editor mounted) or queue it
  useEffect(() => {
    if (!navigateTo) return
    pendingNavRef.current = navigateTo.line
    if (editorRef.current) {
      const line = navigateTo.line
      // Small delay so Monaco finishes setting the new value after tab switch
      setTimeout(() => {
        editorRef.current?.revealLineInCenter(line)
        editorRef.current?.setPosition({ lineNumber: line, column: 1 })
        editorRef.current?.focus()
      }, 60)
    }
  }, [navigateTo])

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    // Ctrl+S / Cmd+S
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const path = activeTabPathRef.current
      if (path) onSaveRef.current(path, editor.getValue())
    })
    // Handle pending navigation (e.g. opened via search result)
    const line = pendingNavRef.current
    if (line) {
      pendingNavRef.current = null
      requestAnimationFrame(() => {
        editor.revealLineInCenter(line)
        editor.setPosition({ lineNumber: line, column: 1 })
        editor.focus()
      })
    }
  }, [])

  if (tabs.length === 0) {
    return (
      <div className="editor-area">
        <div className="editor-welcome">
          <h1>Web Editor</h1>
          <p>Open a folder from the Explorer to start editing</p>
          <p className="editor-welcome-hint">Ctrl+S / ⌘S to save · File System Access API (Chrome/Edge)</p>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-area">
      <div className="editor-tabs" role="tablist">
        {tabs.map(tab => (
          <div
            key={tab.path}
            className={`editor-tab${tab.path === activeTabPath ? ' active' : ''}${tab.fileType === 'browser' ? ' browser-tab' : ''}`}
            role="tab"
            aria-selected={tab.path === activeTabPath}
            onClick={() => onTabSelect(tab.path)}
            title={tab.path === '__virtual_browser__' ? 'Virtual Browser' : tab.path}
          >
            {tab.fileType === 'browser' && <BrowserTabIcon />}
            {tab.isDirty && <span className="tab-dirty" aria-label="unsaved" />}
            <span className="tab-name">{tab.name}</span>
            <button
              className="tab-close"
              onClick={e => { e.stopPropagation(); onTabClose(tab.path) }}
              title="Close tab"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>

      <div className="editor-body">
        {activeTab && activeTab.fileType === 'browser' && (
          <VirtualBrowser simConfig={simConfig} />
        )}
        {activeTab && activeTab.fileType === 'image' && (
          <ImagePreview key={activeTab.path} src={activeTab.content} name={activeTab.name} />
        )}
        {activeTab && activeTab.fileType === 'binary' && (
          <div className="binary-notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p>The file is not displayed in the editor because it is either binary or uses an unsupported text encoding.</p>
            <p className="binary-notice-name">{activeTab.path}</p>
          </div>
        )}
        {activeTab && activeTab.fileType === 'text' && (
          <Editor
            key={activeTab.path}
            height="100%"
            theme="vs-dark"
            language={activeTab.language}
            defaultValue={activeTab.content}
            onMount={handleMount}
            onChange={() => {
              if (activeTabPathRef.current) onMarkDirty(activeTabPathRef.current)
            }}
            options={{
              fontSize: 14,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, Monaco, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              lineNumbers: 'on',
              renderWhitespace: 'boundary',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              bracketPairColorization: { enabled: true },
            }}
          />
        )}
      </div>
    </div>
  )
}
