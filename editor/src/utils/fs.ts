import type { FileNode, SearchResult } from '../types'

export const IGNORE = new Set(['.git', 'node_modules', '.DS_Store', '__pycache__', 'dist', '.next'])

const TEXT_EXTS = new Set([
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
  'html', 'htm', 'css', 'scss', 'less',
  'json', 'jsonc', 'md', 'mdx',
  'go', 'py', 'rb', 'sh', 'bash', 'zsh',
  'yaml', 'yml', 'xml', 'svg', 'toml', 'ini',
  'rs', 'c', 'cpp', 'h', 'java', 'kt', 'swift',
  'txt', 'env', 'conf', 'cfg', 'mod', 'sum',
  'gitignore', 'dockerignore', 'editorconfig',
])

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'bmp', 'tiff', 'tif', 'avif',
])

const LANG_MAP: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonc: 'json',
  md: 'markdown', mdx: 'markdown',
  go: 'go', py: 'python', rb: 'ruby',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml',
  toml: 'ini', ini: 'ini',
  rs: 'rust', c: 'c', cpp: 'cpp', h: 'c',
  java: 'java', kt: 'kotlin', swift: 'swift',
  txt: 'plaintext',
}

export function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'plaintext'
}

export function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTS.has(ext)
}

export function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === '' || !name.includes('.')) return true // extensionless files
  return TEXT_EXTS.has(ext)
}

function sortNodes(a: FileNode, b: FileNode): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export async function readDirectory(
  dirHandle: FileSystemDirectoryHandle,
  basePath = '',
): Promise<FileNode[]> {
  const entries: FileNode[] = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (IGNORE.has(name)) continue
    const path = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'directory') {
      entries.push({ name, path, kind: 'directory', handle, children: undefined, expanded: false })
    } else {
      entries.push({ name, path, kind: 'file', handle, expanded: false })
    }
  }
  return entries.sort(sortNodes)
}

export async function readFileContent(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export async function readFileAsDataURL(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function searchInDirectory(
  dirHandle: FileSystemDirectoryHandle,
  query: string,
  path = '',
  results: SearchResult[] = [],
  maxResults = 300,
): Promise<SearchResult[]> {
  if (results.length >= maxResults) return results
  const lower = query.toLowerCase()
  for await (const [name, handle] of dirHandle.entries()) {
    if (results.length >= maxResults) break
    if (IGNORE.has(name)) continue
    const filePath = path ? `${path}/${name}` : name
    if (handle.kind === 'directory') {
      await searchInDirectory(handle as FileSystemDirectoryHandle, query, filePath, results, maxResults)
    } else if (isTextFile(name)) {
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        const text = await file.text()
        const lines = text.split('\n')
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          const idx = lines[i].toLowerCase().indexOf(lower)
          if (idx !== -1) {
            results.push({
              filePath,
              fileName: name,
              line: i + 1,
              lineContent: lines[i],
              matchStart: idx,
              matchEnd: idx + query.length,
            })
          }
        }
      } catch {
        // skip unreadable/binary files
      }
    }
  }
  return results
}

// ── Enhanced search (with options) ───────────────────────────────────────────

export type SearchOptions = {
  useRegex: boolean
  caseSensitive: boolean
  wholeWord: boolean
  includePattern: string
  excludePattern: string
}

export const DEFAULT_SEARCH_OPTS: SearchOptions = {
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,
  includePattern: '',
  excludePattern: '',
}

export function buildSearchRegex(
  query: string,
  opts: Pick<SearchOptions, 'useRegex' | 'caseSensitive' | 'wholeWord'>,
): RegExp | null {
  if (!query) return null
  try {
    let pattern = opts.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (opts.wholeWord) pattern = `\\b${pattern}\\b`
    const flags = 'g' + (opts.caseSensitive ? '' : 'i')
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

function fileMatchesPattern(filePath: string, fileName: string, pattern: string): boolean {
  const p = pattern.trim()
  if (!p) return true
  // *.ext  →  extension match
  if (p.startsWith('*.')) return fileName.endsWith(p.slice(1))
  // dir/**  or  dir/  →  path prefix
  const dirPart = p.endsWith('/**') ? p.slice(0, -3) : p.endsWith('/') ? p.slice(0, -1) : null
  if (dirPart !== null) return filePath.startsWith(dirPart + '/') || filePath === dirPart
  // plain substring match on path or filename
  return filePath.includes(p) || fileName.includes(p)
}

function matchesPatterns(filePath: string, fileName: string, include: string, exclude: string): boolean {
  if (exclude.trim()) {
    const pats = exclude.split(',').map(s => s.trim()).filter(Boolean)
    if (pats.some(p => fileMatchesPattern(filePath, fileName, p))) return false
  }
  if (include.trim()) {
    const pats = include.split(',').map(s => s.trim()).filter(Boolean)
    if (!pats.some(p => fileMatchesPattern(filePath, fileName, p))) return false
  }
  return true
}

export async function searchInDirectoryAdvanced(
  dirHandle: FileSystemDirectoryHandle,
  query: string,
  opts: SearchOptions = DEFAULT_SEARCH_OPTS,
  path = '',
  results: SearchResult[] = [],
  maxResults = 500,
): Promise<SearchResult[]> {
  if (results.length >= maxResults) return results
  const regex = buildSearchRegex(query, opts)
  if (!regex) return results

  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (results.length >= maxResults) break
    if (IGNORE.has(name)) continue
    const filePath = path ? `${path}/${name}` : name
    if (handle.kind === 'directory') {
      await searchInDirectoryAdvanced(handle as FileSystemDirectoryHandle, query, opts, filePath, results, maxResults)
    } else if (isTextFile(name) && matchesPatterns(filePath, name, opts.includePattern, opts.excludePattern)) {
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        const text = await file.text()
        const lines = text.split('\n')
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          regex.lastIndex = 0
          const match = regex.exec(lines[i])
          if (match) {
            results.push({
              filePath,
              fileName: name,
              line: i + 1,
              lineContent: lines[i],
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            })
          }
        }
      } catch {
        // skip unreadable/binary files
      }
    }
  }
  return results
}

export function searchInFiles(
  files: Record<string, string>,
  query: string,
  opts: SearchOptions = DEFAULT_SEARCH_OPTS,
  maxResults = 500,
): SearchResult[] {
  const regex = buildSearchRegex(query, opts)
  if (!regex) return []
  const results: SearchResult[] = []
  for (const [filePath, content] of Object.entries(files)) {
    if (results.length >= maxResults) break
    if (content.startsWith('data:')) continue   // skip binary data URLs
    const fileName = filePath.split('/').pop() ?? filePath
    if (!isTextFile(fileName)) continue
    if (!matchesPatterns(filePath, fileName, opts.includePattern, opts.excludePattern)) continue
    const lines = content.split('\n')
    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
      regex.lastIndex = 0
      const match = regex.exec(lines[i])
      if (match) {
        results.push({
          filePath,
          fileName,
          line: i + 1,
          lineContent: lines[i],
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        })
      }
    }
  }
  return results
}

export async function readFileContentByPath(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<string> {
  const parts = filePath.split('/')
  let dir: FileSystemDirectoryHandle = rootHandle
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i])
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
  const file = await fileHandle.getFile()
  return file.text()
}

export async function writeFileContentByPath(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
  content: string,
): Promise<void> {
  const parts = filePath.split('/')
  let dir: FileSystemDirectoryHandle = rootHandle
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i])
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

/**
 * Recursively read all text + image files from a directory handle.
 * Returns a flat map of { relativePath: content }.
 *   - Text files  → raw text content
 *   - Image files → data URL  (e.g. "data:image/png;base64,...")
 */
export async function readTextFiles(
  dirHandle: FileSystemDirectoryHandle,
  basePath = '',
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for await (const [name, handle] of dirHandle.entries()) {
    if (IGNORE.has(name)) continue
    const filePath = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'directory') {
      const sub = await readTextFiles(handle as FileSystemDirectoryHandle, filePath)
      Object.assign(result, sub)
    } else if (isTextFile(name)) {
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        result[filePath] = await file.text()
      } catch {
        // skip unreadable files
      }
    } else if (isImageFile(name)) {
      try {
        result[filePath] = await readFileAsDataURL(handle as FileSystemFileHandle)
      } catch {
        // skip unreadable files
      }
    }
  }
  return result
}
