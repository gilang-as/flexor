import { useState, useEffect, useRef, useCallback } from 'react'
import type { SimConfig } from '../types'
import { useWasm } from '../hooks/useWasm'

// ── Icons ────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7.5H13a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" />
    </svg>
  )
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8.22 12.53a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06L9.28 2.97a.75.75 0 00-1.06 1.06L11.19 7H3a.75.75 0 000 1.5h8.19l-2.97 2.97a.75.75 0 000 1.06z" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0114.95 7.16a.75.75 0 11-1.49.178A5.501 5.501 0 008 2.5zM1.705 8.005a.75.75 0 01.834.656 5.501 5.501 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.001 7.001 0 011.05 8.84a.75.75 0 01.656-.834z" />
    </svg>
  )
}

function LockIcon({ color = '#89d185' }: { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill={color}>
      <path d="M4 4a4 4 0 018 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25v-5.5C2 6.784 2.784 6 3.75 6H4V4zm6.5 2V4a2.5 2.5 0 00-5 0v2zM8 9.5a1 1 0 100 2 1 1 0 000-2z" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  )
}


function RouterOsBadge() {
  return (
    <span className="vb-engine-badge">
      <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
        <path d="M5.5 4.143a.5.5 0 01.746-.434l6 3.5a.5.5 0 010 .868l-6 3.5A.5.5 0 015.5 11V4.143z" />
      </svg>
      RouterOS
    </span>
  )
}

// ── HTML preparation: inline resources + intercept navigation ─────────────────
//
// Three problems solved here:
//  1. <script src="/md5.js">  — browser fetches from hotspot.local → DNS error
//  2. location.href = "..."   — iframe navigates to real URL → DNS error
//  3. <meta http-equiv="refresh"> — browser redirects the iframe → DNS error
//
// Solution: inline all JS/CSS from templateFiles, override location navigation,
// and strip meta-refresh tags — all before setting srcdoc.

const INTERCEPTOR_SCRIPT = `<script>
(function() {
  // ── Helpers ────────────────────────────────────────────────────────────
  var BASE = 'http://portal/';

  // sendNav dispatches a navigation event to the parent frame.
  // For external URLs (non-portal hostname), href is the full URL so the
  // parent can show the simulated external-web page directly.
  function sendNav(href, method, form) {
    var path = '/';
    var query = {};
    var fullHref = '';
    try {
      var u = new URL(href, BASE);
      path = u.pathname;
      u.searchParams.forEach(function(v, k) { query[k] = v; });
      if (u.hostname !== 'portal') fullHref = u.href; // external URL
    } catch(e) {}
    window.parent.postMessage({ type: 'portal-navigate', path: path, method: method || 'GET', form: form || {}, query: query, href: fullHref }, '*');
  }

  // ── Intercept location.href / location.assign / location.replace ───────
  try {
    var _href = '';
    Object.defineProperty(window, 'location', {
      get: function() { return _locProxy; },
      configurable: true,
    });
    var _locProxy = {
      get href() { return _href; },
      set href(v) { sendNav(v, 'GET', {}); },
      assign:  function(v) { sendNav(v, 'GET', {}); },
      replace: function(v) { sendNav(v, 'GET', {}); },
      reload:  function() {},
      pathname: '/',
      search: '',
      hash: '',
      host: 'portal',
      hostname: 'portal',
      origin: 'http://portal',
      protocol: 'http:',
      toString: function() { return _href; },
    };
  } catch(e) {
    try { window.location.assign  = function(v) { sendNav(v, 'GET', {}); }; } catch(_) {}
    try { window.location.replace = function(v) { sendNav(v, 'GET', {}); }; } catch(_) {}
  }

  // ── Intercept form submits ─────────────────────────────────────────────
  document.addEventListener('submit', function(e) {
    e.preventDefault();
    var form = e.target;
    var data = {};
    new FormData(form).forEach(function(v, k) { data[k] = String(v); });
    var action = form.getAttribute('action') || '/';
    sendNav(action, (form.getAttribute('method') || 'POST').toUpperCase(), data);
  }, true);

  // ── Intercept link clicks ──────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.indexOf('#') === 0 || href.indexOf('javascript:') === 0) return;
    e.preventDefault();
    sendNav(href, 'GET', {});
  }, true);

  // ── Intercept window.open (popup status page) ─────────────────────────
  window.open = function() { return null; };
})();
<\/script>`

/**
 * Prepare HTML from WASM for safe rendering in a sandboxed srcdoc iframe:
 *  - Inline <script src="..."> from templateFiles (avoids DNS fetch)
 *  - Inline <link rel="stylesheet" href="..."> from templateFiles
 *  - Strip <meta http-equiv="refresh"> (avoids iframe navigation)
 *  - Inject interceptor script (captures navigation, form, link)
 */
function prepareHtml(
  html: string,
  hostname: string,
  templateFiles: Record<string, string>,
): string {
  const base = `http://${hostname}/`

  function templateContent(url: string): string | null {
    // Absolute URL pointing to this hotspot
    if (url.startsWith(base)) {
      const key = url.slice(base.length)
      return templateFiles[key] ?? null
    }
    // Root-relative or bare path
    if (url.startsWith('/')) {
      const key = url.slice(1)
      return templateFiles[key] ?? null
    }
    // Relative (e.g. "md5.js") — just try as-is
    return templateFiles[url] ?? null
  }

  // Inline <script src="...">
  html = html.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*?)><\/script>/gi,
    (_match, pre, src, post) => {
      const content = templateContent(src)
      if (content == null) return `<script${pre}${post}><\/script>`
      return `<script${pre}${post}>${content}<\/script>`
    })

  // Inline <link rel="stylesheet" href="...">
  html = html.replace(/<link\b([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (_match, pre, href, post) => {
      const isStylesheet = /rel=["']stylesheet["']/i.test(pre + post)
      if (!isStylesheet) return _match
      const content = templateContent(href)
      if (content == null) return _match
      return `<style>${content}</style>`
    })

  // Convert <meta http-equiv="refresh" content="N; url=X"> to a postMessage script.
  html = html.replace(
    /<meta\b[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)[^"']*["'][^>]*>/gi,
    (_match, url) => {
      const safeUrl = url.replace(/&amp;/g, '&')
      return `<script>(function(){` +
        `var u=${JSON.stringify(safeUrl)};` +
        `var p='/',q={},h='';` +
        `try{var x=new URL(u,'http://portal/');p=x.pathname;x.searchParams.forEach(function(v,k){q[k]=v;});if(x.hostname!=='portal')h=x.href;}catch(e){}` +
        `window.parent.postMessage({type:'portal-navigate',path:p,method:'GET',form:{},query:q,href:h},'*');` +
        `})()</script>`
    },
  )
  // Also strip any remaining meta-refresh without a url= (e.g. just delay)
  html = html.replace(/<meta\b[^>]*http-equiv=["']refresh["'][^>]*>/gi, '')

  // Inject interceptor before </head> (runs before inline scripts)
  if (html.includes('</head>')) {
    html = html.replace('</head>', INTERCEPTOR_SCRIPT + '</head>')
  } else if (html.includes('</body>')) {
    html = html.replace('</body>', INTERCEPTOR_SCRIPT + '</body>')
  } else {
    html += INTERCEPTOR_SCRIPT
  }

  return html
}

// ── Browser state ─────────────────────────────────────────────────────────────

type PageState =
  | { kind: 'idle' }
  | { kind: 'portal'; html: string; url: string }
  | { kind: 'external'; url: string; domain: string }

const CLIENT_IP = '192.168.88.100'

function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return 'http://' + s
}

// Simulate page traffic: deterministic but varied bytes per URL to look realistic.
function simulatePageTraffic(url: string): [number, number] {
  let h = 0
  for (let i = 0; i < url.length; i++) h = (Math.imul(h, 31) + url.charCodeAt(i)) | 0
  const bytesIn  = 50 * 1024 + Math.abs(h % (450 * 1024))
  const bytesOut = 1024      + Math.abs((h >> 8) % (10 * 1024))
  return [bytesIn, bytesOut]
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  simConfig: SimConfig
  templateFiles: Record<string, string>
}

export default function VirtualBrowser({ simConfig, templateFiles }: Props) {
  const wasmState = useWasm(simConfig, templateFiles)
  const hasTemplates = Object.keys(templateFiles).length > 0
  const [addressBar, setAddressBar] = useState(`http://${simConfig.server.hostname}/`)
  const [page, setPage]             = useState<PageState>({ kind: 'idle' })
  const [cookie, setCookieState]    = useState('')
  const [history, setHistory]       = useState<string[]>([])
  const [histIdx, setHistIdx]       = useState(-1)
  const [tick, setTick]             = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // 1-second heartbeat for live session stats + expiry detection
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Navigation helpers ──────────────────────────────────────────────────

  const navigate = useCallback((rawUrl: string, pushHistory = true) => {
    if (wasmState.status !== 'ready') return
    const url = normalizeUrl(rawUrl)
    if (!url) return

    let hostname = ''
    try { hostname = new URL(url).hostname } catch (_) {}

    setAddressBar(url)

    const pushEntry = (u: string) => {
      if (pushHistory) {
        setHistory(h => [...h.slice(0, histIdx + 1), u])
        setHistIdx(i => i + 1)
      }
    }

    const isHotspot = hostname === simConfig.server.hostname

    if (isHotspot) {
      // Portal pages: route directly through handle() — no auth check needed.
      // This makes hotspot.local/status, /login, /logout work on direct navigation.
      const p = new URL(url)
      const queryObj: Record<string, string> = {}
      p.searchParams.forEach((v, k) => { queryObj[k] = v })
      const resp = wasmState.api.handle(CLIENT_IP, cookie, p.pathname || '/', 'GET', '{}', JSON.stringify(queryObj), '')
      if (resp.setCookie) setCookieState(resp.setCookie)
      setPage({ kind: 'portal', html: prepareHtml(resp.html, simConfig.server.hostname, templateFiles), url })
      pushEntry(url)
      return
    }

    // External (non-hotspot) URL
    const isLoggedIn = wasmState.api.isLoggedIn(CLIENT_IP, cookie)

    if (!simConfig.server.captivePortal || isLoggedIn) {
      // Allowed: either no captive portal, or user is authenticated.
      if (isLoggedIn) {
        const [bi, bo] = simulatePageTraffic(url)
        wasmState.api.recordTraffic(CLIENT_IP, cookie, bi, bo)
      }
      setPage({ kind: 'external', url, domain: hostname || url })
      pushEntry(url)
    } else {
      // Captive portal active + not logged in → intercept and show login.
      const resp = wasmState.api.checkAccess(CLIENT_IP, cookie, url)
      if (resp.setCookie) setCookieState(resp.setCookie)
      const portalUrl = `http://${simConfig.server.hostname}/`
      setPage({ kind: 'portal', html: prepareHtml(resp.html, simConfig.server.hostname, templateFiles), url: portalUrl })
      setAddressBar(portalUrl)
      pushEntry(url) // preserve original URL for Back
    }
  }, [wasmState, cookie, histIdx, simConfig, templateFiles])

  const handlePortalRequest = useCallback((
    path: string,
    method: string,
    form: Record<string, string>,
    query: Record<string, string>,
    href?: string,
  ) => {
    if (wasmState.status !== 'ready') return

    // Only treat href as "external navigation" when it is genuinely a different
    // host (e.g. alogin.html redirecting to google.com after login).
    // Hotspot-domain URLs (hotspot.local/*) must fall through to handle() so
    // that POST form data is preserved — the form action is an absolute URL
    // like http://hotspot.local/login, which is NOT external.
    if (href && /^https?:\/\//i.test(href)) {
      try {
        if (new URL(href).hostname !== simConfig.server.hostname) {
          navigate(href)
          return
        }
        // Hotspot URL in href — fall through and use path/method/form below.
      } catch (_) { /* malformed href, fall through */ }
    }

    const resp = wasmState.api.handle(CLIENT_IP, cookie, path, method, JSON.stringify(form), JSON.stringify(query), '')
    if (resp.setCookie) setCookieState(resp.setCookie)
    const url = `http://${simConfig.server.hostname}${path}`
    setAddressBar(url)
    setPage({ kind: 'portal', html: prepareHtml(resp.html, simConfig.server.hostname, templateFiles), url })
    setHistory(h => [...h.slice(0, histIdx + 1), url])
    setHistIdx(i => i + 1)
  }, [wasmState, cookie, histIdx, simConfig, templateFiles, navigate])

  // ── Auto-navigate when WASM becomes ready and templates are loaded ───

  useEffect(() => {
    if (wasmState.status === 'ready' && hasTemplates) {
      navigate(`http://${simConfig.server.hostname}/`, false)
    } else if (wasmState.status === 'ready' && !hasTemplates) {
      setPage({ kind: 'idle' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasmState.status, hasTemplates])

  // Re-navigate when a file is saved (templateFiles reference changes)
  useEffect(() => {
    if (wasmState.status === 'ready' && hasTemplates) {
      setCookieState('')
      navigate(`http://${simConfig.server.hostname}/`, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateFiles])

  // Reset session when hostname changes
  useEffect(() => {
    if (wasmState.status === 'ready') {
      setCookieState('')
      if (hasTemplates) navigate(`http://${simConfig.server.hostname}/`, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simConfig.server.hostname])

  // Session expiry: check every tick when browsing an external page
  useEffect(() => {
    if (wasmState.status !== 'ready' || page.kind !== 'external') return
    if (!wasmState.api.isLoggedIn(CLIENT_IP, cookie)) {
      setCookieState('')
      const portalUrl = `http://${simConfig.server.hostname}/`
      const resp = wasmState.api.handle(CLIENT_IP, '', '/login', 'GET', '{}', '{}', '')
      setPage({ kind: 'portal', html: prepareHtml(resp.html, simConfig.server.hostname, templateFiles), url: portalUrl })
      setAddressBar(portalUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  // ── Listen for postMessage from iframe ─────────────────────────────────

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || e.data.type !== 'portal-navigate') return
      const { path, method, form, query, href } = e.data as {
        path: string
        method: string
        form: Record<string, string>
        query: Record<string, string>
        href?: string
      }
      handlePortalRequest(path, method, form ?? {}, query ?? {}, href)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [handlePortalRequest])

  // ── Address bar ─────────────────────────────────────────────────────────

  function onAddressBarSubmit(e: React.FormEvent) {
    e.preventDefault()
    navigate(addressBar)
  }

  // ── History nav ─────────────────────────────────────────────────────────

  function goBack() {
    if (histIdx <= 0) return
    const newIdx = histIdx - 1
    setHistIdx(newIdx)
    navigate(history[newIdx], false)
  }

  function goForward() {
    if (histIdx >= history.length - 1) return
    const newIdx = histIdx + 1
    setHistIdx(newIdx)
    navigate(history[newIdx], false)
  }

  function refresh() {
    if (page.kind === 'portal' || page.kind === 'external') {
      navigate(addressBar, false)
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────

  const canBack     = histIdx > 0
  const canForward  = histIdx < history.length - 1
  const sessionStatus = (wasmState.status === 'ready')
    ? wasmState.api.getStatus(CLIENT_IP, cookie)
    : null

  // ── Loading / error ─────────────────────────────────────────────────────

  if (wasmState.status === 'idle' || wasmState.status === 'loading') {
    return (
      <div className="vbrowser">
        <ToolbarShell addressBar={addressBar} />
        <div className="vbrowser-viewport">
          <div className="vbrowser-placeholder">
            <div className="vb-loading-spinner" />
            <div className="vbrowser-ph-server">Loading engine…</div>
            <div className="vbrowser-ph-wasm-label">
              {wasmState.status === 'idle' ? 'Initialising…' : 'Downloading portal.wasm'}
            </div>
          </div>
        </div>
        <FooterShell serverName={simConfig.server.serverName} connected={false} label="Loading…" />
      </div>
    )
  }

  if (wasmState.status === 'error') {
    return (
      <div className="vbrowser">
        <ToolbarShell addressBar="Error" lockColor="#f48771" />
        <div className="vbrowser-viewport">
          <div className="vbrowser-placeholder">
            <div className="vbrowser-ph-server" style={{ color: '#f48771' }}>Engine Error</div>
            <div className="vbrowser-ph-wasm-label">{wasmState.message}</div>
            <div className="vbrowser-ph-divider" />
            <div className="vbrowser-ph-wasm-label">Build portal.wasm first:</div>
            <div className="vbrowser-ph-cmd">
              <code>cd engine &amp;&amp; GOOS=js GOARCH=wasm go build -o ../editor/public/portal.wasm ./cmd/wasm/</code>
            </div>
          </div>
        </div>
        <FooterShell serverName={simConfig.server.serverName} connected={false} label="Error" dotColor="#f48771" />
      </div>
    )
  }

  // ── Main browser (WASM ready) ───────────────────────────────────────────

  return (
    <div className="vbrowser">

      {/* Toolbar */}
      <div className="vbrowser-toolbar">
        <div className="vbrowser-navbtns">
          <button className="vbrowser-navbtn" disabled={!canBack}    onClick={goBack}    title="Back"><BackIcon /></button>
          <button className="vbrowser-navbtn" disabled={!canForward} onClick={goForward} title="Forward"><ForwardIcon /></button>
          <button className="vbrowser-navbtn" onClick={refresh} title="Refresh"><RefreshIcon /></button>
        </div>

        <form className="vbrowser-address-bar" onSubmit={onAddressBarSubmit}>
          <span className="vbrowser-lock">
            <LockIcon color={addressBar.startsWith('https://') ? '#89d185' : '#858585'} />
          </span>
          <input
            className="vbrowser-url-input"
            value={addressBar}
            onChange={e => setAddressBar(e.target.value)}
            onFocus={e => e.target.select()}
            spellCheck={false}
            autoComplete="off"
          />
        </form>

        <RouterOsBadge />
      </div>

      {/* Viewport */}
      <div className="vbrowser-viewport vbrowser-viewport-framed">

        {page.kind === 'idle' && (
          <div className="vbrowser-placeholder">
            <div className="vbrowser-ph-icon"><GlobeIcon /></div>
            <div className="vbrowser-ph-server">{simConfig.server.serverName}</div>
            {hasTemplates ? (
              <div className="vbrowser-ph-url">http://{simConfig.server.hostname}/</div>
            ) : (
              <>
                <div className="vbrowser-ph-wasm-label">Open a hotspot template folder to enable preview.</div>
                <div className="vbrowser-ph-wasm-label" style={{ color: '#444', fontSize: 11 }}>
                  Explorer → Open Folder → select e.g. <code style={{ color: '#89d185' }}>mikrotik-default/</code>
                </div>
              </>
            )}
          </div>
        )}

        {page.kind === 'portal' && (
          <iframe
            ref={iframeRef}
            className="vbrowser-iframe"
            srcDoc={page.html}
            sandbox="allow-scripts allow-forms"
            title="Captive Portal"
          />
        )}

        {page.kind === 'external' && (
          <div className="vbrowser-external">
            {/* Fake browser page content */}
            <div className="vbrowser-ext-page">
              <div className="vbrowser-ext-favicon-row">
                <span className="vbrowser-ext-favicon-circle">
                  {page.domain.charAt(0).toUpperCase()}
                </span>
                <span className="vbrowser-ext-domain-label">{page.domain}</span>
              </div>

              <div className="vbrowser-ext-hero">
                <div className="vbrowser-ext-hero-title">{page.domain}</div>
                <div className="vbrowser-ext-hero-sub">
                  Simulated page — accessed through <strong>{simConfig.server.hostname}</strong>
                </div>
              </div>

              <div className="vbrowser-ext-skeleton">
                <div className="vbrowser-ext-skel-h" />
                <div className="vbrowser-ext-skel-line" style={{ width: '88%' }} />
                <div className="vbrowser-ext-skel-line" style={{ width: '72%' }} />
                <div className="vbrowser-ext-skel-line" style={{ width: '91%' }} />
                <div className="vbrowser-ext-skel-line" style={{ width: '54%' }} />
              </div>
            </div>

            {/* Session info bar */}
            {sessionStatus && (
              <div className="vbrowser-ext-session-bar">
                <span className="vbrowser-chip vbrowser-chip-on">👤 {sessionStatus.username}</span>
                <span className="vbrowser-chip">⏱ {sessionStatus.uptime}</span>
                {sessionStatus.sessionTimeLeft && (
                  <span className="vbrowser-chip vbrowser-chip-warn">⏳ {sessionStatus.sessionTimeLeft} left</span>
                )}
                <span className="vbrowser-chip">↓ {formatBytes(sessionStatus.bytesIn)}</span>
                <span className="vbrowser-chip">↑ {formatBytes(sessionStatus.bytesOut)}</span>
                <button
                  className="vbrowser-chip vbrowser-chip-btn"
                  onClick={() => navigate(`http://${simConfig.server.hostname}/status`)}
                  title="Open hotspot status page"
                >
                  Status
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="vbrowser-footer">
        <span className="vbrowser-conn">
          <span className="vbrowser-conn-dot" style={{ background: '#89d185' }} />
          {sessionStatus
            ? `${sessionStatus.username} · ${CLIENT_IP}`
            : `Connected · ${CLIENT_IP}`}
        </span>
        <span className="vbrowser-footer-server">{simConfig.server.serverName}</span>
      </div>

    </div>
  )
}

// ── Shell components for loading / error states ───────────────────────────────

function ToolbarShell({ addressBar, lockColor = '#555' }: { addressBar: string; lockColor?: string }) {
  return (
    <div className="vbrowser-toolbar">
      <div className="vbrowser-navbtns">
        <button className="vbrowser-navbtn" disabled><BackIcon /></button>
        <button className="vbrowser-navbtn" disabled><ForwardIcon /></button>
        <button className="vbrowser-navbtn" disabled><RefreshIcon /></button>
      </div>
      <div className="vbrowser-address-bar">
        <span className="vbrowser-lock"><LockIcon color={lockColor} /></span>
        <input className="vbrowser-url-input" value={addressBar} readOnly />
      </div>
      <RouterOsBadge />
    </div>
  )
}

function FooterShell({ serverName, connected, label, dotColor }: {
  serverName: string
  connected: boolean
  label: string
  dotColor?: string
}) {
  return (
    <div className="vbrowser-footer">
      <span className="vbrowser-conn">
        <span className="vbrowser-conn-dot" style={{ background: dotColor ?? (connected ? '#89d185' : '#555') }} />
        {label}
      </span>
      <span className="vbrowser-footer-server">{serverName}</span>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
