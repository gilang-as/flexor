# CLAUDE.md — Project Guide

## Project Overview

Captive portal emulator that simulates hotspot login flow dari berbagai provider (saat ini: MikroTik RouterOS). Tujuannya untuk development & testing tampilan halaman captive portal tanpa perlu perangkat keras router.

## Repository Structure

```
.
├── engine/                   # Go module — template engine + proxy simulator
│   ├── mikrotik.go           # Core types: Session, SessionStore, ServerConfig, Variables()
│   ├── template.go           # MikroTik template engine: $(var), $(if/elif/else/endif)
│   ├── portal.go             # HTTP-agnostic portal engine (PortalRequest / PortalResponse)
│   ├── embed.go              # embed.FS — bundle templates ke binary/WASM
│   ├── simulator.go          # Thin HTTP wrapper di atas Portal (net/http)
│   ├── go.mod                # module gopkg.gilang.dev/mikrotik/hotspot
│   └── cmd/
│       ├── cli/main.go       # CLI server — jalankan simulator via flag
│       └── wasm/main.go      # WASM entry point — export JS API ke browser
│
├── editor/                   # React + Vite — web UI virtual browser
│   ├── src/
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── public/               # portal.wasm diletakkan di sini setelah build
│   └── package.json
│
└── templates/                # Contoh template captive portal untuk testing
    └── mikrotik-default/     # Template default MikroTik RouterOS
        ├── login.html
        ├── alogin.html
        ├── logout.html
        ├── status.html
        ├── redirect.html
        ├── rlogin.html
        ├── radvert.html
        ├── error.html
        ├── errors.txt
        ├── md5.js
        ├── img/
        ├── lv/               # Latvian translation
        └── xml/              # WISP XML response
```

## Development Commands

### Engine (Go)

```bash
# Masuk ke folder engine
cd engine

# Jalankan simulator CLI
go run ./cmd/cli/main.go

# Dengan opsi custom
go run ./cmd/cli/main.go -bind :8080 -users admin:secret,guest:guest -templates ../templates/mikrotik-default

# Build binary
go build -o hotspot-sim ./cmd/cli/

# Build WASM
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
```

### Template Engine (`template.go`)

Mensupport sintaks MikroTik:
- Substitusi variabel: `$(var-name)` dan `$(var-name-esc)`  
- Kondisional: `$(if expr)` … `$(elif expr)` … `$(else)` … `$(endif)`
- Kondisi: `varname`, `varname == value`, `varname != value`

### Menambah Provider Baru

1. Buat template baru di `templates/<provider-name>/`
2. Implementasikan interface jika variabel/syntax berbeda
3. Tambahkan konstanta `Provider` baru di `mikrotik.go`

## Notes
- `embed.go` meng-embed seluruh folder `templates/` ke dalam binary/WASM saat compile time
- WASM menggunakan embedded templates — tidak butuh akses disk
- CLI server membaca template dari disk (bisa di-override dengan flag `-templates`)
