import { useState, useCallback, useEffect, useRef } from 'react'
import type { SearchResult, EditorTab } from '../types'
import { searchInDirectory, readFileContent, getLanguage } from '../utils/fs'

interface Props {
  rootHandle: FileSystemDirectoryHandle | null
  onOpenFile: (tab: EditorTab, line?: number) => void
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
  return (
    <>
      {text.slice(0, start).trimStart()}
      <mark className="search-match">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  )
}

export default function SearchPanel({ rootHandle, onOpenFile }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const cancelledRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!rootHandle || q.trim().length < 2) {
      setResults([])
      setStatus('idle')
      return
    }
    cancelledRef.current = true
    setStatus('searching')
    cancelledRef.current = false
    const found = await searchInDirectory(rootHandle, q.trim())
    if (!cancelledRef.current) {
      setResults(found)
      setStatus('done')
    }
  }, [rootHandle])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, doSearch])

  const handleResultClick = useCallback(async (result: SearchResult) => {
    if (!rootHandle) return
    const parts = result.filePath.split('/')
    let dir: FileSystemDirectoryHandle = rootHandle
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i])
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
    const content = await readFileContent(fileHandle)
    onOpenFile({
      path: result.filePath,
      name: result.fileName,
      content,
      language: getLanguage(result.fileName),
      isDirty: false,
      handle: fileHandle,
      fileType: 'text',
    }, result.line)
  }, [rootHandle, onOpenFile])

  const toggleCollapse = useCallback((filePath: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  const grouped = groupByFile(results)

  return (
    <div className="search-panel">
      <div className="search-input-wrap">
        <input
          type="text"
          className="search-input"
          placeholder="Search (min 2 chars)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {status === 'searching' && <p className="search-status">Searching…</p>}
      {status === 'done' && results.length === 0 && (
        <p className="search-status">No results for "{query}"</p>
      )}
      {status === 'done' && results.length > 0 && (
        <p className="search-status">{results.length} results in {grouped.size} files</p>
      )}

      <div className="search-results">
        {Array.from(grouped.entries()).map(([filePath, items]) => (
          <div key={filePath}>
            <div className="search-file-row" onClick={() => toggleCollapse(filePath)}>
              <span className="search-chevron">{collapsed.has(filePath) ? '▶' : '▼'}</span>
              <span className="search-file-name">{items[0].fileName}</span>
              <span className="search-file-path">{filePath}</span>
              <span className="search-count">{items.length}</span>
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
