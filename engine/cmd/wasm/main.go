//go:build js && wasm

// Package main is the Go WebAssembly entry point for the captive portal emulator.
// It exposes a JavaScript API consumed by the React virtual browser.
//
// Build with:
//
//	GOOS=js GOARCH=wasm go build -o web/public/portal.wasm ./cmd/wasm/
package main

import (
	"encoding/json"
	"io"
	"io/fs"
	"syscall/js"
	"time"

	"gopkg.gilang.dev/flexor"
)

var portal *flexor.Portal

func main() {
	// Expose the API on the global `hotspot` object.
	js.Global().Set("hotspot", js.ValueOf(map[string]any{
		// hotspot.init(config)          — initialise / re-initialise the portal
		"init": js.FuncOf(apiInit),
		// hotspot.checkAccess(ip, cookie, url) → PortalResponse
		"checkAccess": js.FuncOf(apiCheckAccess),
		// hotspot.handle(ip, cookie, path, method, formJSON, queryJSON, target) → PortalResponse
		"handle": js.FuncOf(apiHandle),
		// hotspot.getStatus(ip, cookie) → SessionStatus | null
		"getStatus": js.FuncOf(apiGetStatus),
		// hotspot.isLoggedIn(ip, cookie) → boolean
		"isLoggedIn": js.FuncOf(apiIsLoggedIn),
		// hotspot.recordTraffic(ip, cookie, bytesIn, bytesOut) — accumulate traffic bytes
		"recordTraffic": js.FuncOf(apiRecordTraffic),
		// hotspot.setAdvertDone(ip, cookie) — unblock session after advertisement
		"setAdvertDone": js.FuncOf(apiSetAdvertDone),
	}))

	// Keep the Go runtime alive forever.
	select {}
}

// ---- API handlers -------------------------------------------------------

// apiInit initialises the portal with a config object.
//
// JS:
//
//	hotspot.init({
//	  serverName?:    string,
//	  hostname?:      string,
//	  identity?:      string,
//	  allowTrial?:    boolean,
//	  advertRequired?: boolean,
//	  advertUrl?:     string,
//	  users?:         Array<{ username: string, password: string, profileId?: string }>,
//	  profiles?:      Array<{ id: string, sessionTimeout?: string }>,
//	  templates?:     Record<string, string>, // filename → HTML/text content
//	})
func apiInit(_ js.Value, args []js.Value) any {
	cfg := flexor.DefaultConfig()

	var fsys fs.FS // nil = no templates; portal will return "Template not found"

	if len(args) > 0 && args[0].Type() == js.TypeObject {
		obj := args[0]
		if v := obj.Get("serverName"); v.Type() == js.TypeString {
			cfg.ServerName = v.String()
		}
		if v := obj.Get("hostname"); v.Type() == js.TypeString {
			cfg.Hostname = v.String()
			cfg.ServerAddress = v.String()
		}
		if v := obj.Get("identity"); v.Type() == js.TypeString {
			cfg.Identity = v.String()
		}
		if v := obj.Get("allowTrial"); v.Type() == js.TypeBoolean {
			cfg.AllowTrial = v.Bool()
		}
		if v := obj.Get("advertRequired"); v.Type() == js.TypeBoolean {
			cfg.AdvertRequired = v.Bool()
		}
		if v := obj.Get("advertUrl"); v.Type() == js.TypeString {
			cfg.AdvertURL = v.String()
		}

		// Build in-memory FS from JS templates map.
		// Keys are relative filenames (e.g. "login.html", "lv/login.html").
		// They are stored under cfg.TemplateDir so portal.readTemplate finds them.
		templatesJS := obj.Get("templates")
		if templatesJS.Type() == js.TypeObject {
			mfs := make(mapFS)
			keys := js.Global().Get("Object").Call("keys", templatesJS)
			for i := 0; i < keys.Length(); i++ {
				key := keys.Index(i).String()
				content := templatesJS.Get(key).String()
				mfs[cfg.TemplateDir+"/"+key] = []byte(content)
			}
			if len(mfs) > 0 {
				fsys = mfs
			}
		}
	}

	portal = flexor.NewPortalWithFS(cfg, fsys)

	if len(args) > 0 && args[0].Type() == js.TypeObject {
		obj := args[0]

		// Register profiles before users so profile limits are available at login.
		profiles := obj.Get("profiles")
		if profiles.Type() == js.TypeObject && profiles.InstanceOf(js.Global().Get("Array")) {
			for i := 0; i < profiles.Length(); i++ {
				p := profiles.Index(i)
				id := p.Get("id").String()
				if id == "" {
					continue
				}
				pc := &flexor.ProfileConfig{}
				if v := p.Get("sessionTimeout"); v.Type() == js.TypeString && v.String() != "" {
					if d, err := time.ParseDuration(v.String()); err == nil {
						pc.SessionTimeout = d
					}
				}
				portal.AddProfile(id, pc)
			}
		}

		users := obj.Get("users")
		if users.Type() == js.TypeObject && users.InstanceOf(js.Global().Get("Array")) {
			for i := 0; i < users.Length(); i++ {
				u := users.Index(i)
				username := u.Get("username").String()
				password := u.Get("password").String()
				profileID := ""
				if v := u.Get("profileId"); v.Type() == js.TypeString {
					profileID = v.String()
				}
				if username != "" {
					portal.AddUserWithProfile(username, password, profileID)
				}
			}
		}
	}

	return nil
}

// apiRecordTraffic accumulates traffic bytes for a session.
//
// JS: hotspot.recordTraffic(clientIP: string, cookie: string, bytesIn: number, bytesOut: number)
func apiRecordTraffic(_ js.Value, args []js.Value) any {
	ensureInit()
	ip := strArg(args, 0)
	bytesIn := int64(0)
	bytesOut := int64(0)
	if len(args) > 2 && args[2].Type() == js.TypeNumber {
		bytesIn = int64(args[2].Int())
	}
	if len(args) > 3 && args[3].Type() == js.TypeNumber {
		bytesOut = int64(args[3].Int())
	}
	portal.RecordTraffic(ip, bytesIn, bytesOut)
	return nil
}

// apiSetAdvertDone unblocks a session after the client has watched the advertisement.
//
// JS: hotspot.setAdvertDone(clientIP: string, cookie: string)
func apiSetAdvertDone(_ js.Value, args []js.Value) any {
	ensureInit()
	portal.SetAdvertDone(strArg(args, 0))
	return nil
}

// apiCheckAccess decides whether a browser navigation should be intercepted.
//
// JS: hotspot.checkAccess(clientIP: string, cookie: string, url: string) → PortalResponse
//
// PortalResponse: { action: "portal"|"allow", html: string, setCookie: string, targetURL: string }
func apiCheckAccess(_ js.Value, args []js.Value) any {
	ensureInit()
	resp := portal.CheckAccess(strArg(args, 0), strArg(args, 1), strArg(args, 2))
	return responseToJS(resp)
}

// apiHandle drives a specific portal servlet page.
//
// JS: hotspot.handle(clientIP, cookie, path, method, formJSON, queryJSON, target) → PortalResponse
//
//   - formJSON  — JSON-encoded object for POST form fields  (pass "{}" if N/A)
//   - queryJSON — JSON-encoded object for URL query params  (pass "{}" if N/A)
//   - target    — template sub-directory, e.g. "lv" for Latvian  (pass "" for default)
func apiHandle(_ js.Value, args []js.Value) any {
	ensureInit()
	req := flexor.PortalRequest{
		ClientIP: strArg(args, 0),
		Cookie:   strArg(args, 1),
		Path:     strArg(args, 2),
		Method:   strArg(args, 3),
		Form:     parseJSONMap(strArg(args, 4)),
		Query:    parseJSONMap(strArg(args, 5)),
		Target:   strArg(args, 6),
	}
	return responseToJS(portal.Handle(req))
}

// apiGetStatus returns session statistics for the current client.
//
// JS: hotspot.getStatus(clientIP: string, cookie: string) → SessionStatus | null
func apiGetStatus(_ js.Value, args []js.Value) any {
	ensureInit()
	clientIP := strArg(args, 0)
	cookie := strArg(args, 1)

	if !portal.IsLoggedIn(clientIP, cookie) {
		return nil
	}
	sess := portal.GetSession(clientIP)
	if sess == nil {
		return nil
	}
	uptime := sess.Uptime()
	timeLeft := sess.SessionTimeLeft()
	return map[string]any{
		"loggedIn":           sess.LoggedIn,
		"username":           sess.Username,
		"ip":                 sess.IP,
		"mac":                sess.MAC,
		"loginBy":            sess.LoginBy,
		"uptime":             flexor.FormatDuration(uptime),
		"uptimeSec":          int(uptime.Seconds()),
		"bytesIn":            sess.BytesIn,
		"bytesOut":           sess.BytesOut,
		"sessionTimeLeft":    flexor.FormatDuration(timeLeft),
		"sessionTimeLeftSec": int(timeLeft.Seconds()),
		"blocked":            sess.Blocked,
		"limitBytesIn":       sess.LimitBytesIn,
		"limitBytesOut":      sess.LimitBytesOut,
	}
}

// apiIsLoggedIn reports whether the client is authenticated.
//
// JS: hotspot.isLoggedIn(clientIP: string, cookie: string) → boolean
func apiIsLoggedIn(_ js.Value, args []js.Value) any {
	ensureInit()
	return portal.IsLoggedIn(strArg(args, 0), strArg(args, 1))
}

// ---- Helpers ------------------------------------------------------------

// ensureInit creates a default portal if apiInit was never called.
func ensureInit() {
	if portal == nil {
		cfg := flexor.DefaultConfig()
		portal = flexor.NewPortalWithFS(cfg, flexor.DefaultTemplates)
		portal.AddUser("admin", "admin")
	}
}

func strArg(args []js.Value, i int) string {
	if i < len(args) && args[i].Type() == js.TypeString {
		return args[i].String()
	}
	return ""
}

func parseJSONMap(s string) map[string]string {
	if s == "" || s == "{}" {
		return map[string]string{}
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return map[string]string{}
	}
	return m
}

func responseToJS(resp flexor.PortalResponse) map[string]any {
	return map[string]any{
		"action":    resp.Action,
		"html":      resp.HTML,
		"setCookie": resp.SetCookie,
		"targetURL": resp.TargetURL,
	}
}

// ---- In-memory FS -------------------------------------------------------

// mapFS is a minimal read-only in-memory file system backed by a flat map.
// Keys are slash-separated paths (no leading slash), values are file contents.
type mapFS map[string][]byte

func (m mapFS) Open(name string) (fs.File, error) {
	data, ok := m[name]
	if !ok {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrNotExist}
	}
	return &mapFile{name: name, data: data}, nil
}

type mapFile struct {
	name string
	data []byte
	pos  int
}

func (f *mapFile) Read(p []byte) (int, error) {
	if f.pos >= len(f.data) {
		return 0, io.EOF
	}
	n := copy(p, f.data[f.pos:])
	f.pos += n
	return n, nil
}

func (f *mapFile) Close() error               { return nil }
func (f *mapFile) Stat() (fs.FileInfo, error) { return f, nil }
func (f *mapFile) Name() string               { return f.name }
func (f *mapFile) Size() int64                { return int64(len(f.data)) }
func (f *mapFile) Mode() fs.FileMode          { return 0o444 }
func (f *mapFile) ModTime() time.Time         { return time.Time{} }
func (f *mapFile) IsDir() bool                { return false }
func (f *mapFile) Sys() any                   { return nil }
