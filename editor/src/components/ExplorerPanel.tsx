import { useCallback } from 'react'
import type { FileNode, EditorTab, GitHubConfig } from '../types'
import { readDirectory, readFileContent, readFileAsDataURL, getLanguage, isImageFile, isTextFile } from '../utils/fs'
import { getFileContent, getFileAsDataURL } from '../utils/github'
import FileTypeIcon from './FileTypeIcon'

interface Props {
  rootHandle: FileSystemDirectoryHandle | null
  fileTree: FileNode[]
  activeFilePath: string | null
  onOpenFolder: () => void
  onOpenFromGitHub: () => void
  onUpdateTree: (tree: FileNode[]) => void
  onOpenFile: (tab: EditorTab) => void
  githubConfig?: GitHubConfig | null
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  activeFilePath: string | null
  onToggle: (path: string) => Promise<void>
  onOpenFile: (node: FileNode) => Promise<void>
}

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)
const ChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
const FolderIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none">
    {open
      ? <path fill="#dcb67a" d="M2 9a2 2 0 012-2h3.586a1 1 0 01.707.293l1.414 1.414A1 1 0 0010.414 9H20a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" />
      : <path fill="#c5a14d" d="M2 6a2 2 0 012-2h5.586a1 1 0 01.707.293l1.414 1.414A1 1 0 0012.414 5H20a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    }
  </svg>
)

function updateNodeInTree(
  tree: FileNode[],
  path: string,
  updater: (node: FileNode) => FileNode,
): FileNode[] {
  return tree.map(node => {
    if (node.path === path) return updater(node)
    if (node.kind === 'directory' && node.children) {
      return { ...node, children: updateNodeInTree(node.children, path, updater) }
    }
    return node
  })
}

function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.children) {
      const found = findNode(n.children, path)
      if (found) return found
    }
  }
  return null
}

function TreeNode({ node, depth, activeFilePath, onToggle, onOpenFile }: TreeNodeProps) {
  const indent = depth * 12 + 8
  if (node.kind === 'directory') {
    return (
      <div>
        <div className="tree-item" style={{ paddingLeft: indent }} onClick={() => onToggle(node.path)}>
          <span className="tree-chevron">{node.expanded ? <ChevronDown /> : <ChevronRight />}</span>
          <span className="tree-icon"><FolderIcon open={node.expanded} /></span>
          <span className="tree-name">{node.name}</span>
        </div>
        {node.expanded && node.children?.map(child => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFilePath={activeFilePath}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    )
  }
  return (
    <div
      className={`tree-item${activeFilePath === node.path ? ' active' : ''}`}
      style={{ paddingLeft: indent + 16 }}
      onClick={() => onOpenFile(node)}
    >
      <span className="tree-icon"><FileTypeIcon name={node.name} /></span>
      <span className="tree-name">{node.name}</span>
    </div>
  )
}

export default function ExplorerPanel({
  rootHandle, fileTree, activeFilePath, onOpenFolder, onOpenFromGitHub, onUpdateTree, onOpenFile, githubConfig,
}: Props) {
  const isGitHub = !rootHandle && githubConfig != null

  const handleToggle = useCallback(async (path: string) => {
    const node = findNode(fileTree, path)
    if (!node || node.kind !== 'directory') return
    if (!node.expanded) {
      let children = node.children
      // GitHub mode: children already loaded (full tree at once); local mode: lazy-load
      if (!isGitHub && (!children || children.length === 0)) {
        children = await readDirectory(node.handle as FileSystemDirectoryHandle, node.path)
      }
      onUpdateTree(updateNodeInTree(fileTree, path, n => ({ ...n, expanded: true, children })))
    } else {
      onUpdateTree(updateNodeInTree(fileTree, path, n => ({ ...n, expanded: false })))
    }
  }, [fileTree, onUpdateTree, isGitHub])

  const handleOpenFile = useCallback(async (node: FileNode) => {
    if (node.kind !== 'file') return

    // ── GitHub mode ──────────────────────────────────────────────────────────
    if (isGitHub && githubConfig) {
      let content = ''
      let fileType: EditorTab['fileType'] = 'text'
      if (isImageFile(node.name)) {
        fileType = 'image'
        content = await getFileAsDataURL(
          githubConfig.token, githubConfig.owner, githubConfig.repo,
          node.path, githubConfig.branch,
        )
      } else if (isTextFile(node.name)) {
        fileType = 'text'
        content = await getFileContent(
          githubConfig.token, githubConfig.owner, githubConfig.repo,
          node.path, githubConfig.branch,
        )
      } else {
        fileType = 'binary'
      }
      onOpenFile({
        path: node.path,
        name: node.name,
        content,
        language: getLanguage(node.name),
        isDirty: false,
        fileType,
      })
      return
    }

    // ── Local mode ───────────────────────────────────────────────────────────
    const handle = node.handle as FileSystemFileHandle
    let content = ''
    let fileType: EditorTab['fileType'] = 'text'
    if (isImageFile(node.name)) {
      fileType = 'image'
      content = await readFileAsDataURL(handle)
    } else if (isTextFile(node.name)) {
      fileType = 'text'
      content = await readFileContent(handle)
    } else {
      fileType = 'binary'
    }
    onOpenFile({
      path: node.path,
      name: node.name,
      content,
      language: getLanguage(node.name),
      isDirty: false,
      handle,
      fileType,
    })
  }, [onOpenFile, isGitHub, githubConfig])

  if (!rootHandle && !isGitHub) {
    return (
      <div className="explorer-empty">
        <p>No folder opened.</p>
        <button className="open-folder-btn" onClick={onOpenFolder}>Open Folder</button>
        <button className="open-github-btn" onClick={onOpenFromGitHub}>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
            <path d="M8 .198C3.582.198 0 3.78 0 8.198c0 3.536 2.292 6.533 5.47 7.59.4.074.548-.173.548-.386 0-.19-.007-.693-.01-1.36-2.226.483-2.695-1.073-2.695-1.073-.364-.924-.888-1.17-.888-1.17-.726-.497.055-.486.055-.486.803.056 1.226.824 1.226.824.713 1.222 1.871.869 2.328.664.072-.517.279-.869.507-1.069-1.775-.202-3.643-.887-3.643-3.95 0-.873.312-1.587.823-2.147-.082-.202-.357-1.015.078-2.117 0 0 .672-.215 2.2.82A7.67 7.67 0 018 4.068c.68.003 1.364.092 2.003.269 1.527-1.035 2.198-.82 2.198-.82.436 1.102.161 1.915.079 2.117.513.56.822 1.274.822 2.147 0 3.07-1.87 3.746-3.653 3.944.288.248.543.735.543 1.481 0 1.07-.01 1.932-.01 2.194 0 .214.145.463.55.385C13.71 14.728 16 11.732 16 8.198 16 3.78 12.418.198 8 .198z" />
          </svg>
          Import from GitHub
        </button>
      </div>
    )
  }

  return (
    <div className="file-tree">
      {fileTree.map(node => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          activeFilePath={activeFilePath}
          onToggle={handleToggle}
          onOpenFile={handleOpenFile}
        />
      ))}
    </div>
  )
}
