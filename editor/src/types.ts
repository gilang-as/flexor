export const BROWSER_TAB_PATH = '__virtual_browser__'

export type FileNode = {
  name: string
  path: string
  kind: 'file' | 'directory'
  handle?: FileSystemHandle   // present for local files, absent for GitHub-mode nodes
  children?: FileNode[]
  expanded: boolean
  sha?: string                // GitHub blob/tree SHA
}

export type GitHubConfig = {
  token: string
  owner: string
  repo: string
  branch: string
}

export type EditorTab = {
  path: string
  name: string
  content: string        // text content, or data URL for images
  language: string
  isDirty: boolean
  handle?: FileSystemFileHandle  // undefined for virtual tabs (e.g. browser)
  fileType: 'text' | 'image' | 'binary' | 'browser'
}

export type SearchResult = {
  filePath: string
  fileName: string
  line: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

// ── Simulator types ───────────────────────────────────────────────────────────

export type EngineMode = 'routeros'

export type BandwidthLimit = {
  uploadKbps: number    // 0 = unlimited
  downloadKbps: number  // 0 = unlimited
}

export type SimProfile = {
  id: string
  name: string
  sessionTimeLeft: string   // '' = no time limit, e.g. '1h', '30m', '2h30m'
  addressPool: string       // e.g. '192.168.88.0/24'
  bandwidth: BandwidthLimit
  sharedUsers: number       // 1 = no sharing
}

export type SimUser = {
  id: string
  username: string
  password: string
  profileId: string
  disabled: boolean
}

export type SimServerConfig = {
  engineMode: EngineMode
  hostname: string
  serverName: string
  loginPage: string       // e.g. 'login.html'
  captivePortal: boolean  // whether to intercept all HTTP and redirect
  allowTrial: boolean     // trial (login-by=trial) button on login page
  advertRequired: boolean // blocked=yes → Advertisement required
  advertUrl: string       // link-advert target URL
  loginByMac: boolean     // auto-login by MAC
}

export type SimConfig = {
  server: SimServerConfig
  profiles: SimProfile[]
  users: SimUser[]
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  server: {
    engineMode: 'routeros',
    hostname: 'hotspot.local',
    serverName: 'MikroTik Hotspot',
    loginPage: 'login.html',
    captivePortal: true,
    allowTrial: false,
    advertRequired: false,
    advertUrl: 'http://example.com/advert',
    loginByMac: false,
  },
  profiles: [
    {
      id: 'default',
      name: 'default',
      sessionTimeLeft: '',
      addressPool: '192.168.88.0/24',
      bandwidth: { uploadKbps: 0, downloadKbps: 0 },
      sharedUsers: 1,
    },
    {
      id: 'limited',
      name: 'limited',
      sessionTimeLeft: '1h',
      addressPool: '192.168.88.0/24',
      bandwidth: { uploadKbps: 2048, downloadKbps: 5120 },
      sharedUsers: 1,
    },
  ],
  users: [
    { id: 'u1', username: 'admin', password: 'admin', profileId: 'default', disabled: false },
    { id: 'u2', username: 'guest', password: 'guest', profileId: 'limited', disabled: false },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────

export type Diagnostic = {
  id: string
  severity: DiagnosticSeverity
  message: string
  filePath: string
  fileName: string
  line: number       // 1-based
  column: number     // 1-based
  source?: string    // e.g. "eslint", "tsc", "mikrotik-lsp"
  code?: string      // rule id or error code
}
