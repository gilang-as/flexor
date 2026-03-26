import type { Diagnostic, DiagnosticSeverity } from '../types'

// ── Mock data (replace with real LSP diagnostics later) ──────────────────────

export const MOCK_DIAGNOSTICS: Diagnostic[] = [
  {
    id: '1',
    severity: 'error',
    message: "Variable '$(link-login-only)' is used but not defined in this template scope",
    filePath: 'templates/mikrotik-default/login.html',
    fileName: 'login.html',
    line: 37,
    column: 12,
    source: 'mikrotik-lsp',
    code: 'undefined-variable',
  },
  {
    id: '2',
    severity: 'error',
    message: "Unclosed conditional: '$(if chap-id)' has no matching '$(endif)'",
    filePath: 'templates/mikrotik-default/alogin.html',
    fileName: 'alogin.html',
    line: 14,
    column: 3,
    source: 'mikrotik-lsp',
    code: 'unclosed-conditional',
  },
  {
    id: '3',
    severity: 'warning',
    message: "Deprecated variable '$(bytes-in)': use '$(bytes-in-nice)' for display",
    filePath: 'templates/mikrotik-default/status.html',
    fileName: 'status.html',
    line: 62,
    column: 36,
    source: 'mikrotik-lsp',
    code: 'deprecated-variable',
  },
  {
    id: '4',
    severity: 'warning',
    message: "Empty '$(else)' branch has no content",
    filePath: 'templates/mikrotik-default/status.html',
    fileName: 'status.html',
    line: 78,
    column: 1,
    source: 'mikrotik-lsp',
    code: 'empty-branch',
  },
  {
    id: '5',
    severity: 'info',
    message: "Consider using '$(link-orig-esc)' instead of '$(link-orig)' inside href attributes",
    filePath: 'templates/mikrotik-default/login.html',
    fileName: 'login.html',
    line: 54,
    column: 20,
    source: 'mikrotik-lsp',
    code: 'prefer-escaped',
  },
  {
    id: '6',
    severity: 'hint',
    message: "'$(refresh-timeout)' is always empty when session has no time limit",
    filePath: 'templates/mikrotik-default/status.html',
    fileName: 'status.html',
    line: 90,
    column: 5,
    source: 'mikrotik-lsp',
    code: 'always-empty',
  },
]

// ── Icons ────────────────────────────────────────────────────────────────────

function IconError() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a.875.875 0 110-1.75.875.875 0 010 1.75z" />
    </svg>
  )
}

function IconWarning() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M7.097 2.51L1.168 12.51A1.044 1.044 0 002.07 14h11.86a1.044 1.044 0 00.902-1.49L8.903 2.51a1.044 1.044 0 00-1.806 0zM8 5.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 5.5zm0 6.5a.875.875 0 110-1.75.875.875 0 010 1.75z" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 6.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 5.5a.875.875 0 110-1.75.875.875 0 010 1.75z" />
    </svg>
  )
}

function IconHint() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8 1a5.5 5.5 0 00-2.83 10.23c.11.06.19.17.2.3l.18 1.44A.75.75 0 006.3 14h3.4a.75.75 0 00.75-.73l.18-1.44a.36.36 0 01.2-.3A5.5 5.5 0 008 1zm-1 10.5h2v1H7v-1zm-.085-2.237a.75.75 0 01-.415-.663V8a1.5 1.5 0 113 0v.6a.75.75 0 01-.415.663l-.335.168v.069H7.75v-.069l-.335-.168z" />
    </svg>
  )
}

export function SeverityIcon({ severity }: { severity: DiagnosticSeverity }) {
  switch (severity) {
    case 'error':   return <span className="diag-icon diag-error"><IconError /></span>
    case 'warning': return <span className="diag-icon diag-warning"><IconWarning /></span>
    case 'info':    return <span className="diag-icon diag-info"><IconInfo /></span>
    case 'hint':    return <span className="diag-icon diag-hint"><IconHint /></span>
  }
}

// ── Component ────────────────────────────────────────────────────────────────

type Props = {
  diagnostics: Diagnostic[]
  onClose: () => void
  onGoTo: (d: Diagnostic) => void
}

type GroupedFile = {
  filePath: string
  fileName: string
  items: Diagnostic[]
}

export default function ProblemsPanel({ diagnostics, onClose, onGoTo }: Props) {
  // Group by file path.
  const groups: GroupedFile[] = Object.values(
    diagnostics.reduce<Record<string, GroupedFile>>((acc, d) => {
      if (!acc[d.filePath]) acc[d.filePath] = { filePath: d.filePath, fileName: d.fileName, items: [] }
      acc[d.filePath].items.push(d)
      return acc
    }, {})
  )

  const errors   = diagnostics.filter(d => d.severity === 'error').length
  const warnings = diagnostics.filter(d => d.severity === 'warning').length
  const infos    = diagnostics.filter(d => d.severity === 'info' || d.severity === 'hint').length

  return (
    <div className="problems-panel">
      <div className="problems-header">
        <span className="problems-title">PROBLEMS</span>
        <div className="problems-summary">
          {errors > 0    && <span className="ps-errors"><IconError /> {errors}</span>}
          {warnings > 0  && <span className="ps-warnings"><IconWarning /> {warnings}</span>}
          {infos > 0     && <span className="ps-infos"><IconInfo /> {infos}</span>}
        </div>
        <button className="problems-close" onClick={onClose} title="Close panel">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
          </svg>
        </button>
      </div>

      <div className="problems-body">
        {diagnostics.length === 0 ? (
          <div className="problems-empty">No problems detected.</div>
        ) : (
          groups.map(group => (
            <div key={group.filePath} className="problems-group">
              <div className="problems-file">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
                  <path d="M9.5 1.1l3.4 3.5.1.4v9c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V2c0-.6.4-1 1-1h5.2l.3.1zM9 5V2H4v12h8V5H9z" />
                </svg>
                <span className="problems-file-name">{group.fileName}</span>
                <span className="problems-file-path">{group.filePath}</span>
              </div>
              {group.items.map(d => (
                <div
                  key={d.id}
                  className="problems-item"
                  onClick={() => onGoTo(d)}
                  title={`${d.filePath}:${d.line}:${d.column}`}
                >
                  <SeverityIcon severity={d.severity} />
                  <span className="problems-message">{d.message}</span>
                  <span className="problems-location">
                    {d.source && <span className="problems-source">{d.source}</span>}
                    {d.code && <span className="problems-code">({d.code})</span>}
                    <span className="problems-pos">[Ln {d.line}, Col {d.column}]</span>
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
