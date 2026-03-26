# Captive Portal Emulator

Emulator captive portal berbagai provider (MikroTik RouterOS, dan lainnya ke depannya) yang berjalan di browser maupun sebagai server lokal. Berguna untuk develop, menguji, dan mengedit tampilan halaman captive portal tanpa router fisik.

## Struktur Proyek

```
.
├── engine/       # Go — template engine + HTTP simulator + WASM module
├── editor/       # React + Vite — web UI virtual browser
└── templates/    # Contoh template captive portal untuk testing
```

## Fitur

- **Virtual browser** (React) — simulasi navigasi, intercept, dan tampilkan halaman portal
- **Template engine** — substitusi `$(var)` dan kondisional `$(if/elif/else/endif)` sesuai spec MikroTik
- **WASM module** — engine Go dikompilasi ke WebAssembly, berjalan langsung di browser tanpa server
- **CLI server** — jalankan simulator sebagai HTTP server lokal untuk testing browser nyata
- **Multi-template** — sub-direktori language (`?target=lv`), embed templates ke binary
- Semua halaman servlet standar: `login`, `alogin`, `logout`, `status`, `redirect`, `rlogin`, `radvert`, `error`

---

## Prasyarat

- Go 1.21+
- Node.js 18+

---

## engine/ — Go Template Engine & Simulator

Berisi semua logika inti: session management, template engine MikroTik, HTTP simulator, dan WASM entry point.

### Menjalankan CLI Server

```bash
cd engine
go run ./cmd/cli/main.go
```

Buka browser ke `http://127.0.0.1:8080` — langsung masuk ke simulasi captive portal.

### Opsi CLI

```
Flags:
  -bind string        Address to listen on          (default ":8080")
  -hostname string    Hostname shown in portal links (default "127.0.0.1:8080")
  -identity string    RouterOS identity name        (default "MikroTik")
  -server-name string HotSpot server name           (default "hotspot1")
  -templates string   Path to template directory    (default "templates/mikrotik-default")
  -trial              Allow trial access (T-<mac>)
  -users string       user:password pairs           (default "admin:admin,user:password")
```

```bash
# Contoh
go run ./cmd/cli/main.go -users "gilang:secret,tamu:tamu" -templates ../templates/mikrotik-default
```

### Build WASM

```bash
cd engine
GOOS=js GOARCH=wasm go build -o ../editor/public/portal.wasm ./cmd/wasm/
```

### Menggunakan sebagai Library

```go
import hs "gopkg.gilang.dev/mikrotik/hotspot"

cfg := hs.DefaultConfig()
portal := hs.NewPortalWithFS(cfg, hs.DefaultTemplates)
portal.AddUser("admin", "secret")

// Cek akses saat user navigasi ke URL tertentu
resp := portal.CheckAccess(clientIP, cookie, "https://google.com")
if resp.Action == "portal" {
    // Tampilkan resp.HTML ke user
}
```

---

## editor/ — Virtual Browser (React)

Web UI yang mensimulasikan browser dengan captive portal. Engine Go berjalan sebagai WASM di dalam browser — tidak butuh backend server.

```bash
cd editor
npm install

# Pastikan portal.wasm sudah ada di editor/public/
# (lihat langkah Build WASM di atas)

npm run dev      # http://localhost:5173
npm run build    # production build ke editor/dist/
```

**Cara kerja:**
1. User "mengetik" URL di address bar virtual
2. React memanggil `hotspot.checkAccess(ip, cookie, url)` ke WASM
3. Jika belum login → tampilkan HTML halaman login di dalam iframe/panel
4. User submit form login → `hotspot.handle(...)` diproses WASM
5. Login berhasil → navigasi berlanjut ke URL tujuan

---

## templates/ — Contoh Template untuk Testing

Berisi template siap pakai yang bisa langsung digunakan oleh CLI server maupun engine.

```
templates/
└── mikrotik-default/    # Template default MikroTik RouterOS
    ├── login.html       # Halaman login utama
    ├── alogin.html      # Setelah login berhasil (popup status + redirect)
    ├── logout.html      # Setelah logout (statistik sesi)
    ├── status.html      # Status sesi aktif (bytes, uptime, dll)
    ├── redirect.html    # Redirect ke URL lain
    ├── rlogin.html      # Redirect ke login (untuk user belum login)
    ├── radvert.html     # Halaman iklan
    ├── error.html       # Halaman error fatal
    ├── errors.txt       # Pesan error yang bisa ditranslasi
    ├── md5.js           # MD5 untuk HTTP-CHAP authentication
    ├── img/             # Gambar logo MikroTik
    ├── lv/              # Terjemahan Latvian
    └── xml/             # Response WISP XML
```

Untuk membuat template kustom: salin `mikrotik-default/`, edit HTML-nya, lalu gunakan dengan flag `-templates ./template-kustom`.

---

## Sintaks Template MikroTik

Variabel:
```html
Halo, $(username)!  IP kamu: $(ip)  MAC: $(mac)
<a href="$(link-logout)">Logout</a>
```

Kondisional:
```html
$(if username == admin)
  Selamat datang, Admin!
$(elif logged-in == yes)
  Selamat datang, $(username)!
$(else)
  Silakan login.
$(endif)
```

Variabel yang tersedia: `hostname`, `username`, `ip`, `mac`, `uptime`, `bytes-in-nice`, `bytes-out-nice`, `session-time-left`, `link-login`, `link-logout`, `link-status`, `error`, dan [lainnya](MIKROTIK.md).

---

## WASM JS API

Setelah `portal.wasm` dimuat:

```js
// Inisialisasi
hotspot.init({
  hostname: 'localhost:8080',
  identity: 'MikroTik',
  allowTrial: false,
  users: [{ username: 'admin', password: 'admin' }]
})

// Intercept navigasi
const resp = hotspot.checkAccess(clientIP, cookie, 'https://google.com')
// resp: { action: 'portal'|'allow', html: string, setCookie: string, targetURL: string }

// Proses request halaman portal
hotspot.handle(ip, cookie, '/login', 'POST', JSON.stringify({username:'admin',password:'admin',dst:''}), '{}', '')

// Cek status sesi
hotspot.getStatus(ip, cookie)
// → { username, ip, mac, uptime, uptimeSec, bytesIn, bytesOut }

hotspot.isLoggedIn(ip, cookie) // → boolean
```

---

## Alur Captive Portal

```
Browser buka google.com
        ↓
checkAccess() → action: "portal"
        ↓
Tampilkan login.html
        ↓
User isi username + password → POST /login
        ↓
  ┌─ Salah → login.html + $(error)
  └─ Benar → alogin.html + setCookie → redirect ke google.com
                    ↓
           Navigasi kembali diizinkan (action: "allow")
                    ↓
              status.html (uptime, bytes, logout button)
```

---

## Menambah Provider Baru

1. Buat direktori `templates/<provider>/` dengan halaman HTML provider tersebut
2. Sesuaikan variable mapping di `engine/mikrotik.go` jika syntax variabel berbeda
3. Tambahkan `Provider` constant baru
4. Buat entry di `templates/` untuk pengujian

## Lisensi

MIT

## Prasyarat

- Go 1.21+

## Instalasi

```bash
git clone https://github.com/your-username/mikrotik-hotspot
cd mikrotik-hotspot
go build ./...
```

## Menjalankan Simulator

### Via `go run`

```bash
go run ./cmd/cli/main.go
```

Buka browser ke `http://127.0.0.1:8080`

### Via binary

```bash
go build -o hotspot-sim ./cmd/cli/main.go
./hotspot-sim
```

## Opsi CLI

```
Usage: hotspot-sim [flags]

Flags:
  -bind string
        Address to listen on (default ":8080")
  -hostname string
        Hostname shown in hotspot links (default "127.0.0.1:8080")
  -identity string
        RouterOS identity name (default "MikroTik")
  -server-name string
        HotSpot server name (default "hotspot1")
  -templates string
        Path to hotspot template directory (default "templates/mikrotik-default")
  -trial
        Allow trial access (T-<mac> username)
  -users string
        Comma-separated user:password pairs (default "admin:admin,user:password")
```

### Contoh

```bash
# Akun custom, port berbeda
./hotspot-sim -bind :9090 -hostname "192.168.1.1:9090" -users "gilang:secret,tamu:tamu"

# Gunakan template custom
./hotspot-sim -templates ./my-hotspot-theme

# Aktifkan trial access
./hotspot-sim -trial -users "admin:admin"
```

## Struktur Direktori

```
mikrotik-hotspot/
├── mikrotik.go           # Types inti: Session, SessionStore, ServerConfig, Variables()
├── template.go           # Template engine: $(var), $(if), $(elif), $(else), $(endif)
├── simulator.go          # HTTP server dengan semua route hotspot
├── cmd/
│   └── cli/
│       └── main.go       # CLI entrypoint
└── templates/
    └── mikrotik-default/ # Template HotSpot default MikroTik
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
        ├── lv/           # Template bahasa Latvia
        └── xml/          # Template WISP XML
```

## Menggunakan sebagai Library

```go
import mikrotikhotspot "gopkg.gilang.dev/mikrotik/hotspot"

cfg := mikrotikhotspot.DefaultConfig()
cfg.BindAddress = ":8080"
cfg.TemplateDir = "templates/mikrotik-default"
cfg.Hostname = "127.0.0.1:8080"

sim := mikrotikhotspot.NewSimulator(cfg)
sim.AddUser("admin", "secret")
sim.AddUser("guest", "guest")

log.Fatal(sim.ListenAndServe())
```

Karena `Simulator` mengimplementasikan `http.Handler`, bisa di-mount ke mux yang sudah ada:

```go
http.Handle("/hotspot/", http.StripPrefix("/hotspot", sim))
```

## Alur HotSpot

```
Browser buka URL apapun
        ↓
GET /  → rlogin.html / redirect.html → ke /login
        ↓
GET /login → login.html
        ↓
POST /login (username + password)
  ├─ Salah → login.html + pesan error $(error)
  └─ Benar → alogin.html + Set-Cookie → redirect ke URL asal
        ↓
GET /status → status.html (bytes in/out, uptime, sisa waktu)
        ↓
POST /logout → logout.html (statistik akhir sesi)
```

## Variabel Template yang Didukung

Semua variabel standar MikroTik tersedia. Di antaranya:

| Variabel | Contoh nilai |
|---|---|
| `$(hostname)` | `127.0.0.1:8080` |
| `$(username)` | `admin` |
| `$(ip)` | `127.0.0.1` |
| `$(mac)` | `AA:BB:CC:DD:EE:FF` |
| `$(uptime)` | `1h23m45s` |
| `$(bytes-in-nice)` | `1.2MiB` |
| `$(session-time-left)` | `30m0s` |
| `$(link-login)` | `http://127.0.0.1:8080/login` |
| `$(link-logout)` | `http://127.0.0.1:8080/logout` |
| `$(link-status)` | `http://127.0.0.1:8080/status` |
| `$(error)` | `invalid username or password` |

Sintaks kondisional yang didukung:

```html
$(if username == admin)
  Selamat datang, admin!
$(elif logged-in == yes)
  Selamat datang, $(username)!
$(else)
  Silakan login.
$(endif)
```

## Membuat Template Kustom

1. Salin direktori `templates/mikrotik-default` ke direktori baru
2. Edit file HTML sesuai kebutuhan
3. Gunakan variabel `$(...)` dan kondisional sesuai [dokumentasi MikroTik](MIKROTIK.md)
4. Jalankan simulator dengan `-templates ./direktori-baru`

## Lisensi

MIT
