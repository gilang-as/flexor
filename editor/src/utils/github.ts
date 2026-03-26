import type { FileNode } from '../types'

// ── GitHub API types ──────────────────────────────────────────────────────────

export interface GitHubRepo {
  full_name: string
  name: string
  owner: { login: string }
  default_branch: string
  private: boolean
  description: string | null
  updated_at: string
}

export interface GitHubBranch {
  name: string
  commit: { sha: string }
}

export interface GitHubTreeItem {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

// ── GitHub API client ─────────────────────────────────────────────────────────

const BASE = 'https://api.github.com'

async function ghFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).message ?? msg } catch { /* ignore */ }
    throw new Error(`GitHub ${res.status}: ${msg}`)
  }
  // 204 No Content
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAuthenticatedUser(token: string): Promise<{ login: string; name: string | null }> {
  return ghFetch(token, '/user')
}

/** Verify a repo exists and return its metadata (works for public repos without token) */
export async function getRepoInfo(token: string, owner: string, repo: string): Promise<GitHubRepo> {
  return ghFetch(token, `/repos/${owner}/${repo}`)
}

/** Parse a GitHub URL or "owner/repo" string into { owner, repo } */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim()
  // Full URL: https://github.com/owner/repo or https://github.com/owner/repo.git
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?(?:[/#?]|$)/)
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] }
  // Short form: owner/repo
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/)
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] }
  return null
}

export async function getUserRepos(token: string): Promise<GitHubRepo[]> {
  return ghFetch(token, '/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator')
}

export async function searchRepos(token: string, q: string): Promise<GitHubRepo[]> {
  const data = await ghFetch<{ items: GitHubRepo[] }>(
    token,
    `/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=20`,
  )
  return data.items
}

export async function getBranches(token: string, owner: string, repo: string): Promise<GitHubBranch[]> {
  return ghFetch(token, `/repos/${owner}/${repo}/branches?per_page=100`)
}

export async function getDefaultBranch(token: string, owner: string, repo: string): Promise<string> {
  const data = await ghFetch<{ default_branch: string }>(token, `/repos/${owner}/${repo}`)
  return data.default_branch
}

/** Returns flat list of all git tree items recursively */
export async function getRepoTree(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubTreeItem[]> {
  const data = await ghFetch<{ tree: GitHubTreeItem[]; truncated: boolean }>(
    token,
    `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
  )
  return data.tree
}

/** Get branch head commit SHA and its tree SHA */
export async function getBranchRef(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ commitSha: string; treeSha: string }> {
  const ref = await ghFetch<{ object: { sha: string } }>(
    token,
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
  )
  const commitSha = ref.object.sha
  const commit = await ghFetch<{ sha: string; tree: { sha: string } }>(
    token,
    `/repos/${owner}/${repo}/git/commits/${commitSha}`,
  )
  return { commitSha, treeSha: commit.tree.sha }
}

/** Fetch file content from GitHub (returns decoded text) */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<string> {
  const data = await ghFetch<{ content: string; encoding: string }>(
    token,
    `/repos/${owner}/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
  )
  if (data.encoding === 'base64') {
    // Decode base64 → binary string → UTF-8
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), c => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  }
  return data.content
}

/** Fetch binary file content as data URL (for images) */
export async function getFileAsDataURL(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<string> {
  const data = await ghFetch<{ content: string; encoding: string; download_url: string }>(
    token,
    `/repos/${owner}/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
  )
  if (data.encoding === 'base64') {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      ico: 'image/x-icon',
    }
    const mime = mimeMap[ext] ?? 'image/png'
    return `data:${mime};base64,${data.content.replace(/\n/g, '')}`
  }
  return data.download_url
}

/** Commit and push multiple file changes to a branch */
export async function commitAndPush(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  changes: Array<{ path: string; content: string }>,
  message: string,
): Promise<void> {
  const { commitSha, treeSha } = await getBranchRef(token, owner, repo, branch)

  // Create blobs for all changed files
  const blobs = await Promise.all(
    changes.map(async ({ path, content }) => {
      // UTF-8 encode → base64
      const encoded = btoa(unescape(encodeURIComponent(content)))
      const blob = await ghFetch<{ sha: string }>(
        token,
        `/repos/${owner}/${repo}/git/blobs`,
        { method: 'POST', body: JSON.stringify({ content: encoded, encoding: 'base64' }) },
      )
      return { path, sha: blob.sha }
    }),
  )

  // Create new tree
  const newTree = await ghFetch<{ sha: string }>(
    token,
    `/repos/${owner}/${repo}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: treeSha,
        tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
      }),
    },
  )

  // Create commit
  const newCommit = await ghFetch<{ sha: string }>(
    token,
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [commitSha] }),
    },
  )

  // Update branch ref
  await ghFetch(
    token,
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha, force: false }) },
  )
}

// ── File tree builder ─────────────────────────────────────────────────────────

/** Build a nested FileNode[] tree from the flat GitHub tree API response */
export function buildFileTree(items: GitHubTreeItem[]): FileNode[] {
  // Only include blobs (files) and trees (directories)
  const dirs = items.filter(i => i.type === 'tree').sort((a, b) => a.path.localeCompare(b.path))
  const files = items.filter(i => i.type === 'blob').sort((a, b) => a.path.localeCompare(b.path))

  const nodeMap = new Map<string, FileNode>()
  const roots: FileNode[] = []

  const ensureDir = (path: string, sha?: string): FileNode => {
    if (nodeMap.has(path)) return nodeMap.get(path)!
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const node: FileNode = { name, path, kind: 'directory', expanded: false, children: [], sha }
    nodeMap.set(path, node)
    if (parts.length === 1) {
      roots.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = ensureDir(parentPath)
      parent.children!.push(node)
    }
    return node
  }

  for (const dir of dirs) ensureDir(dir.path, dir.sha)

  for (const file of files) {
    const parts = file.path.split('/')
    const name = parts[parts.length - 1]
    const fileNode: FileNode = { name, path: file.path, kind: 'file', expanded: false, sha: file.sha }
    nodeMap.set(file.path, fileNode)
    if (parts.length === 1) {
      roots.push(fileNode)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      ensureDir(parentPath).children!.push(fileNode)
    }
  }

  // Sort roots: directories first, then files, alphabetically
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.children) sortNodes(n.children)
  }
  sortNodes(roots)

  return roots
}
