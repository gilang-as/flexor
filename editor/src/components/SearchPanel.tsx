import { useState, useCallback, useEffect, useRef } from 'react'
import type { SearchResult, EditorTab, GitHubConfig } from '../types'
import {
  searchInDirectoryAdvanced,
  searchInFiles,
  buildSearchRegex,
  readFileContentByPath,
  getLanguage,
  isTextFile,
} from '../utils/fs'

interface Props {
  rootHandle: FileSystemDirectoryHandle | null
  githubConfig: GitHubConfig | null
  templateFiles: Record<string, string>
  onOpenFile: (tab: EditorTab, line?: number) => void
  onReplaceInFile: (path: string, newContent: string) => Promise<void>
}

function groupByFile(results: SearchResult[]): Map<string, SearchResult[]> {
  const map = new Map<string, SearchResult[]>()
  for (const r of results) {
    const list = map.get(r.filePath) ?? []
    list.push(r)
    map.set(r.filePath, list)
  }
  return map
}

function Highlighted({ text, start, end }: { text: string; start: number; end: number }) {
  const trimmed = text.trimStart()
  const removed = text.length - trimmed.length
  const s = Math.max(0, start - removed)
  const e = Math.max(0, end - removed)
  return (
    <>
      {trimmed.slice(0, s)}
      <mark className="search-match">{trimmed.slice(s, e)}</mark>
      {trimmed.slice(e)}
    </>
  )
}

function OptBtn({
  active, title, onClick, children,
}: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`search-opt-btn${active ? ' active' : ''}`}
      title={title}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export default function SearchPanel({
  rootHandle, githubConfig, templateFiles, onOpenFile, onReplaceInFile,
}: Props) {
  const [query, setQuery] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [includePattern, setIncludePattern] = useState('')
  const [excludePattern, setExcludePattern] = useState('')

  const [results, setResults] = useState<SearchResult[]>([])
  const [regexError, setRegexError] = useState('')
  const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [replacing, setReplacing] = useState(false)

  const cancelledRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isGitHub = !rootHandle && githubConfig != null

  const doSearch = useCallback(async (
    q: string,
    opts: { caseSensitive: boolean; wholeWord: boolean; useRegex: boolean; includePattern: string; excludePattern: string },
  ) => {
    const hasSource = rootHandle || isGitHub
    if (!hasSource || q.trim().length < 1) {
      setResults([])
      setStatus('idle')
      setRegexError('')
      return
    }
    if (opts.useRegex) {
      try { new RegExp(q) } catch (err: any) {
        setRegexError(String(err.message))
        setResults([])
        setStatus('idle')
        return
      }
    }
    setRegexError('')
    cancelledRef.current = true
    setStatus('searching')
    cancelledRef.current = false

    const searchOpts = { ...opts }
    let found: SearchResult[]
    if (isGitHub) {
      found = searchInFiles(templateFiles, q.trim(), searchOpts)
    } else {
      found = await searchInDirectoryAdvanced(rootHandle!, q.trim(), searchOpts)
    }
    if (!cancelledRef.current) {
      setResults(found)
      setStatus('done')
    }
  }, [rootHandle, isGitHub, templateFiles])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query, { caseSensitive, wholeWord, useRegex, includePattern, excludePattern })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern, doSearch])

  // ── Open file on result click ─────────────────────────────────────────────

  const handleResultClick = useCallback(async (result: SearchResult) => {
    if (isGitHub) {
      const content = templateFiles[result.filePath] ?? ''
      onOpenFile({
        path: result.filePath,
        name: result.fileName,
        content,
        language: getLanguage(result.fileName),
        isDirty: false,
        fileType: isTextFile(result.fileName) ? 'text' : 'binary',
      }, result.line)
      return
    }
    if (!rootHandle) return
    try {
      const content = await readFileContentByPath(rootHandle, result.filePath)
      onOpenFile({
        path: result.filePath,
        name: result.fileName,
        content,
        language: getLanguage(result.fileName),
        isDirty: false,
        fileType: 'text',
      }, result.line)
    } catch { /* skip */ }
  }, [rootHandle, isGitHub, templateFiles, onOpenFile])

  // ── Replace ───────────────────────────────────────────────────────────────

  const replaceInFilePaths = useCallback(async (filePaths: string[]) => {
    const regex = buildSearchRegex(query, { useRegex, caseSensitive, wholeWord })
    if (!regex) return
    setReplacing(true)
    try {
      for (const filePath of filePaths) {
        let content: string | undefined
        if (isGitHub) {
          content = templateFiles[filePath]
        } else if (rootHandle) {
          content = await readFileContentByPath(rootHandle, filePath)
        }
        if (content === undefined) continue
        const newContent = content.replace(new RegExp(regex.source, regex.flags), replaceValue)
        if (newContent !== content) {
          await onReplaceInFile(filePath, newContent)
        }
      }
      await doSearch(query, { caseSensitive, wholeWord, useRegex, includePattern, excludePattern })
    } finally {
      setReplacing(false)
    }
  }, [query, useRegex, caseSensitive, wholeWord, replaceValue, isGitHub, rootHandle, templateFiles, onReplaceInFile, doSearch, includePattern, excludePattern])

  const handleReplaceAll = useCallback(async () => {
    await replaceInFilePaths(Array.from(new Set(results.map(r => r.filePath))))
  }, [results, replaceInFilePaths])

  const handleReplaceFile = useCallback(async (filePath: string) => {
    await replaceInFilePaths([filePath])
  }, [replaceInFilePaths])

  const toggleCollapse = useCallback((filePath: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  const grouped = groupByFile(results)
  const canReplace = showReplace && query.length > 0 && results.length > 0 && !replacing && !regexError

  return (
    <div className="search-panel">
      {/* ── Controls ────────────────────────── */}
      <div className="search-controls">
        {/* Row 1: twistie + search input + options */}
        <div className="search-row">
          <button
            className="search-twistie"
            onClick={() => setShowReplace(v => !v)}
            title="Toggle Replace"
            type="button"
          >
            {showReplace ? '▾' : '▸'}
          </button>
          <div className="search-field-wrap">
            <input
              type="text"
              className={`search-field-input${regexError ? ' error' : ''}`}
              placeholder="Search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            <div className="search-opts">
              <OptBtn active={caseSensitive} title="Match Case (Alt+C)" onClick={() => setCaseSensitive(v => !v)}>
                <span className="opt-case">Aa</span>
              </OptBtn>
              <OptBtn active={wholeWord} title="Match Whole Word (Alt+W)" onClick={() => setWholeWord(v => !v)}>
                <span className="opt-word"><span style={{ textDecoration: 'underline' }}>ab</span></span>
              </OptBtn>
              <OptBtn active={useRegex} title="Use Regular Expression (Alt+R)" onClick={() => setUseRegex(v => !v)}>
                <span className="opt-regex">.*</span>
              </OptBtn>
            </div>
          </div>
        </div>

        {/* Row 2: replace input + replace-all */}
        {showReplace && (
          <div className="search-row">
            <span className="search-twistie-spacer" />
            <div className="search-field-wrap">
              <input
                type="text"
                className="search-field-input"
                placeholder="Replace"
                value={replaceValue}
                onChange={e => setReplaceValue(e.target.value)}
                spellCheck={false}
              />
              <div className="search-opts">
                <button
                  className="search-replace-all-btn"
                  onClick={handleReplaceAll}
                  disabled={!canReplace}
                  title="Replace All"
                  type="button"
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                    <path d="M1 7.5a.5.5 0 00.5.5h11.793l-3.147 3.146a.5.5 0 00.708.708l4-4a.5.5 0 000-.708l-4-4a.5.5 0 00-.708.708L13.293 7H1.5a.5.5 0 00-.5.5z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Advanced toggle */}
        <div className="search-advanced-toggle" onClick={() => setShowAdvanced(v => !v)}>
          <span className="search-twistie-sm">{showAdvanced ? '▾' : '▸'}</span>
          <span>details</span>
        </div>

        {showAdvanced && (
          <div className="search-filters">
            <input
              className="search-filter-input"
              placeholder="files to include  (e.g. *.html, src/)"
              value={includePattern}
              onChange={e => setIncludePattern(e.target.value)}
              spellCheck={false}
            />
            <input
              className="search-filter-input"
              placeholder="files to exclude  (e.g. *.min.js)"
              value={excludePattern}
              onChange={e => setExcludePattern(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* ── Status ──────────────────────────── */}
      {regexError && (
        <p className="search-status search-status-error" title={regexError}>Invalid regex</p>
      )}
      {!regexError && status === 'searching' && (
        <p className="search-status">Searching…</p>
      )}
      {!regexError && status === 'done' && results.length === 0 && query && (
        <p className="search-status">No results for "{query}"</p>
      )}
      {!regexError && status === 'done' && results.length > 0 && (
        <p className="search-status">{results.length} results in {grouped.size} files</p>
      )}

      {/* ── Results ─────────────────────────── */}
      <div className="search-results">
        {Array.from(grouped.entries()).map(([filePath, items]) => (
          <div key={filePath}>
            <div className="search-file-row" onClick={() => toggleCollapse(filePath)}>
              <span className="search-chevron">{collapsed.has(filePath) ? '▶' : '▼'}</span>
              <span className="search-file-name">{items[0].fileName}</span>
              <span className="search-file-path">{filePath}</span>
              <span className="search-count">{items.length}</span>
              {showReplace && (
                <button
                  className="search-replace-file-btn"
                  title="Replace All in this file"
                  onClick={e => { e.stopPropagation(); handleReplaceFile(filePath) }}
                  disabled={replacing || !query}
                  type="button"
                >
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
                    <path d="M1 7.5a.5.5 0 00.5.5h11.793l-3.147 3.146a.5.5 0 00.708.708l4-4a.5.5 0 000-.708l-4-4a.5.5 0 00-.708.708L13.293 7H1.5a.5.5 0 00-.5.5z"/>
                  </svg>
                </button>
              )}
            </div>
            {!collapsed.has(filePath) && items.map((r, i) => (
              <div key={i} className="search-result-row" onClick={() => handleResultClick(r)}>
                <span className="search-line-num">{r.line}</span>
                <span className="search-line-content">
                  <Highlighted text={r.lineContent} start={r.matchStart} end={r.matchEnd} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
