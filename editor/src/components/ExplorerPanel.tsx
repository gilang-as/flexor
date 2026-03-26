import { useCallback } from 'react'
import type { FileNode, EditorTab } from '../types'
import { readDirectory, readFileContent, readFileAsDataURL, getLanguage, isImageFile, isTextFile } from '../utils/fs'
import FileTypeIcon from './FileTypeIcon'

interface Props {
  rootHandle: FileSystemDirectoryHandle | null
  fileTree: FileNode[]
  activeFilePath: string | null
  onOpenFolder: () => void
  onUpdateTree: (tree: FileNode[]) => void
  onOpenFile: (tab: EditorTab) => void
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
  rootHandle, fileTree, activeFilePath, onOpenFolder, onUpdateTree, onOpenFile,
}: Props) {
  const handleToggle = useCallback(async (path: string) => {
    const node = findNode(fileTree, path)
    if (!node || node.kind !== 'directory') return
    if (!node.expanded) {
      let children = node.children
      if (!children || children.length === 0) {
        children = await readDirectory(node.handle as FileSystemDirectoryHandle, node.path)
      }
      onUpdateTree(updateNodeInTree(fileTree, path, n => ({ ...n, expanded: true, children })))
    } else {
      onUpdateTree(updateNodeInTree(fileTree, path, n => ({ ...n, expanded: false })))
    }
  }, [fileTree, onUpdateTree])

  const handleOpenFile = useCallback(async (node: FileNode) => {
    if (node.kind !== 'file') return
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
  }, [onOpenFile])

  if (!rootHandle) {
    return (
      <div className="explorer-empty">
        <p>No folder opened.</p>
        <button className="open-folder-btn" onClick={onOpenFolder}>Open Folder</button>
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
