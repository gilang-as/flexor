import type { FileNode, SearchResult } from '../types'

const IGNORE = new Set(['.git', 'node_modules', '.DS_Store', '__pycache__', 'dist', '.next'])

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

/**
 * Recursively read all text files from a directory handle.
 * Returns a flat map of { relativePath: textContent }.
 * Binary and ignored files are skipped.
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
    }
  }
  return result
}
