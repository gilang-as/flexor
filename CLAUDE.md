# CLAUDE.md — Project Guide

## Project Overview

**Flexor** — captive portal emulator & web editor. Mensimulasikan hotspot login flow dari berbagai provider (saat ini: MikroTik RouterOS). Tujuannya untuk development & testing tampilan halaman captive portal tanpa perlu perangkat keras router.

- **Repository:** https://github.com/gilang-as/flexor
- **Author:** Gilang Adi S
- **Go module:** `gopkg.gilang.dev/flexor`

## Repository Structure

```
.
├── engine/                   # Go module
│   ├── mikrotik.go           # Core types: Session, SessionStore, ServerConfig, Variables()
│   ├── template.go           # MikroTik template engine: $(var), $(if/elif/else/endif)
│   ├── portal.go             # HTTP-agnostic portal engine (PortalRequest / PortalResponse)
│   ├── simulator.go          # Thin HTTP wrapper di atas Portal (net/http)
│   ├── embed.go              # embed.FS — bundle templates ke binary/WASM
│   ├── embed_wasm.go         # WASM-specific embed
│   ├── go.mod                # module gopkg.gilang.dev/flexor
│   └── cmd/
│       ├── cli/main.go       # CLI server — jalankan simulator via flag
│       └── wasm/main.go      # WASM entry point — export JS API ke browser
│
├── editor/                   # React 19 + Vite + Monaco — VS Code-like web editor
│   ├── src/
│   │   ├── App.tsx           # Root component + all state management
│   │   ├── types.ts          # Shared types (FileNode, EditorTab, GitHubConfig, etc.)
│   │   ├── components/
│   │   │   ├── ActivityBar.tsx      # Left icon strip (explorer/search/github/simulator)
│   │   │   ├── EditorArea.tsx       # Monaco editor + tabs + welcome screen
│   │   │   ├── ExplorerPanel.tsx    # File tree (local FS + GitHub mode)
│   │   │   ├── SearchPanel.tsx      # VS Code-like search & replace
│   │   │   ├── GitHubPanel.tsx      # GitHub connect / repo browser / commit UI
│   │   │   ├── SimulatorPanel.tsx   # Hotspot config (users, bandwidth, etc.)
│   │   │   ├── VirtualBrowser.tsx   # Virtual browser tab
│   │   │   ├── ProblemsPanel.tsx    # Diagnostics panel
│   │   │   ├── ImagePreview.tsx     # Image file preview
│   │   │   └── FileTypeIcon.tsx     # File icon by extension
│   │   ├── hooks/
│   │   │   └── useWasm.ts           # WASM loading hook
│   │   └── utils/
│   │       ├── fs.ts                # File System Access API helpers + search utils
│   │       └── github.ts            # GitHub REST API client
│   ├── public/
│   │   ├── portal.wasm              # Built WASM (gitignored, must build locally)
│   │   ├── wasm_exec.js             # Go WASM runtime
│   │   ├── icon.png                 # App icon
│   │   └── favicon.png
│   └── package.json
│
├── sc1.png … sc5.png         # Screenshots for README
├── README.md
├── MIKROTIK.md               # MikroTik template variable reference
└── CLAUDE.md                 # This file
```

## Development Commands

### Engine (Go)

```bash
cd engine

# Run CLI simulator
go run ./cmd/cli/main.go

# With custom options
go run ./cmd/cli/main.go -bind :8080 -users admin:secret,guest:guest -templates /path/to/template

# Build binary
go build -o hotspot-sim ./cmd/cli/

# Build WASM  ← required before running editor
GOOS=js GOARCH=wasm go build -o ../editor/public/portal.wasm ./cmd/wasm/

# Test & lint
go test ./...
go vet ./...
```

### Editor (React)

```bash
cd editor
npm install
npm run dev       # dev server http://localhost:5173
npm run build     # production build
npx tsc --noEmit  # type-check only
```

## Key Concepts

### Portal Engine (`portal.go`)

`Portal` adalah engine HTTP-agnostic. Menerima `PortalRequest` dan mengembalikan `PortalResponse` tanpa tahu transport-nya (HTTP server, WASM, test, dll).

```go
resp := portal.CheckAccess(clientIP, cookie, "https://google.com")
// resp.Action == "allow"  → user sudah login, boleh lanjut
// resp.Action == "portal" → tampilkan resp.HTML (halaman login)
```

### WASM JS API (`cmd/wasm/main.go`)

Setelah di-build, tersedia sebagai global `hotspot` di browser:

```js
hotspot.init({ hostname: 'localhost', users: [{ username: 'admin', password: 'admin' }] })
hotspot.checkAccess(ip, cookie, url)   // → { action, html, setCookie, targetURL }
hotspot.handle(ip, cookie, path, method, formJSON, queryJSON, target)
hotspot.getStatus(ip, cookie)          // → { username, uptime, bytesIn, ... }
hotspot.isLoggedIn(ip, cookie)         // → boolean
hotspot.recordTraffic(ip, cookie, bytesIn, bytesOut)
hotspot.setAdvertDone(ip, cookie)
```

### Template Engine (`template.go`)

Mensupport sintaks MikroTik:
- Substitusi variabel: `$(var-name)` dan `$(var-name-esc)`
- Kondisional: `$(if expr)` … `$(elif expr)` … `$(else)` … `$(endif)`
- Kondisi: `varname`, `varname == value`, `varname != value`

### Web Editor Features

- Monaco editor (same engine as VS Code) dengan syntax highlighting
- File tree: local folder (File System Access API) atau GitHub repo
- GitHub integration: open public/private repos, commit & push, branch switching
- Search & Replace: regex, case-sensitive, whole-word, include/exclude patterns
- Download as ZIP (local or GitHub repo)
- Virtual browser: simulate captive portal flow in-editor via WASM
- Simulator panel: configure hotspot users, bandwidth limits, etc.

### Menambah Provider Baru

1. Buat template baru (bisa di repo terpisah atau folder lokal)
2. Tambahkan `ProviderXxx` constant dan variable map di `engine/`
3. Wire up di CLI flags dan WASM `init` config

## Roadmap

### Near-term
- [ ] LSP server untuk MikroTik template variables (autocomplete, hover docs)
- [ ] VS Code extension dengan LSP yang sama
- [ ] LSP integration di web editor (Monaco language server protocol)

### Provider support
- [ ] pfSense / OPNsense captive portal
- [ ] OpenWrt (nodogsplash, coova-chilli)
- [ ] Generic HTML-only portal

### Infrastructure
- [ ] Published WASM build (tanpa perlu build lokal)
- [ ] One-click deploy ke Vercel / Cloudflare Pages

## Notes
- `templates/` folder **tidak ada** di repo ini — pengguna bawa template sendiri
- Community template repos: github.com/gilang-as/router-os-default-hotspot-new, github.com/gilang-as/router-os-default-hotspot, github.com/gilang-as/mikrotik-hotspot-template-pink
- `embed.go` punya `var DefaultTemplates embed.FS` kosong (tidak ada `//go:embed`)
- WASM: `embed_wasm.go` punya `var DefaultTemplates fs.FS = nil` — templates di-inject dari browser
- CLI server membaca template dari disk via flag `-templates` (default `../templates/mikrotik-default-v7` — tidak ada, harus di-set manual)
- Pre-existing TS error: `App.tsx` (showDirectoryPicker) dan `utils/fs.ts` (entries) — Web API types, bukan blocking
- GitHub auth: Fine-grained PAT disimpan di `localStorage` sebagai `gh_token`; token kosong = public read-only

