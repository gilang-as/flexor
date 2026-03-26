import { useState, useEffect, useRef } from 'react'
import type { SimConfig } from '../types'

// ── Types mirroring WASM Go API output ───────────────────────────────────────

export type PortalResponse = {
  action: 'portal' | 'allow'
  html: string
  setCookie: string
  targetURL: string
}

export type SessionStatus = {
  loggedIn: boolean
  username: string
  ip: string
  mac: string
  loginBy: string
  uptime: string
  uptimeSec: number
  bytesIn: number
  bytesOut: number
  sessionTimeLeft: string
  sessionTimeLeftSec: number
  blocked: boolean
  limitBytesIn: number
  limitBytesOut: number
}

// ── WASM global interface (populated by Go) ───────────────────────────────────

interface HotspotWasm {
  init(config: object): void
  checkAccess(clientIP: string, cookie: string, url: string): PortalResponse
  handle(
    clientIP: string,
    cookie: string,
    path: string,
    method: string,
    formJSON: string,
    queryJSON: string,
    target: string,
  ): PortalResponse
  getStatus(clientIP: string, cookie: string): SessionStatus | null
  isLoggedIn(clientIP: string, cookie: string): boolean
  recordTraffic(clientIP: string, cookie: string, bytesIn: number, bytesOut: number): void
  setAdvertDone(clientIP: string, cookie: string): void
}

declare global {
  // Injected by wasm_exec.js
  class Go {
    importObject: WebAssembly.Imports
    run(instance: WebAssembly.Instance): void
  }
  var hotspot: HotspotWasm | undefined
}

// ── Hook state ────────────────────────────────────────────────────────────────

export type WasmState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; api: HotspotWasm }
  | { status: 'error'; message: string }

// ── useWasm ───────────────────────────────────────────────────────────────────

/**
 * Loads portal.wasm once and exposes the hotspot API.
 * Re-initialises the portal whenever `simConfig` or `templateFiles` changes.
 * `templateFiles` is a flat map of { relativeFilename: textContent } built
 * from the folder the user opened in the editor.
 */
export function useWasm(simConfig: SimConfig, templateFiles: Record<string, string>): WasmState {
  const [state, setState] = useState<WasmState>({ status: 'idle' })
  // Keep a ref to track if WASM was already booted across config changes
  const wasmBooted = useRef(false)

  // ── Boot WASM once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (wasmBooted.current) return
    wasmBooted.current = true
    setState({ status: 'loading' })

    async function boot() {
      try {
        // wasm_exec.js must be loaded first to define window.Go
        await loadScript('/wasm_exec.js')

        const go = new Go()
        const result = await WebAssembly.instantiateStreaming(
          fetch('/portal.wasm'),
          go.importObject,
        )
        // Run the Go program (sets up window.hotspot, then blocks in select{})
        go.run(result.instance)

        // Give the Go runtime one tick to register globals
        await new Promise(r => setTimeout(r, 0))

        if (!window.hotspot) throw new Error('hotspot global not found after WASM boot')
        setState({ status: 'ready', api: window.hotspot })
      } catch (err) {
        setState({ status: 'error', message: String(err) })
      }
    }

    boot()
  }, []) // boot only once

  // ── Re-init when simConfig or templateFiles changes ─────────────────
  useEffect(() => {
    if (state.status !== 'ready') return
    const { server, users, profiles } = simConfig
    state.api.init({
      hostname:       server.hostname,
      serverName:     server.serverName,
      identity:       server.serverName,
      allowTrial:     server.allowTrial,
      advertRequired: server.advertRequired,
      advertUrl:      server.advertUrl,
      users: users
        .filter(u => !u.disabled)
        .map(u => ({ username: u.username, password: u.password, profileId: u.profileId })),
      profiles: profiles.map(p => ({
        id:             p.id,
        sessionTimeout: p.sessionTimeLeft, // e.g. "1h30m" — parsed by Go time.ParseDuration
      })),
      // Flat map of { 'login.html': '<html>...' } — converted to in-memory FS in Go.
      templates: templateFiles,
    })
  }, [state.status, simConfig, templateFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}

// ── Helper ────────────────────────────────────────────────────────────────────

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Don't load twice
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(s)
  })
}
