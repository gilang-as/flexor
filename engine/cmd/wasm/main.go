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
	"syscall/js"

	hs "gopkg.gilang.dev/mikrotik/hotspot"
)

var portal *hs.Portal

func main() {
	// Expose the API on the global `hotspot` object.
	js.Global().Set("hotspot", js.ValueOf(map[string]any{
		// hotspot.init(config)          — initialise / re-initialise the portal
		"init": js.FuncOf(apiInit),
		// hotspot.checkAccess(ip, cookie, url) → PortalResponse
		// Intercept any browser navigation; returns action=="allow" if already logged in.
		"checkAccess": js.FuncOf(apiCheckAccess),
		// hotspot.handle(ip, cookie, path, method, formJSON, queryJSON, target) → PortalResponse
		// Drive a specific portal page directly (login POST, status GET, etc.)
		"handle": js.FuncOf(apiHandle),
		// hotspot.getStatus(ip, cookie) → SessionStatus | null
		"getStatus": js.FuncOf(apiGetStatus),
		// hotspot.isLoggedIn(ip, cookie) → boolean
		"isLoggedIn": js.FuncOf(apiIsLoggedIn),
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
//	  serverName?: string,   // default "hotspot1"
//	  hostname?:   string,   // default "localhost:8080"
//	  identity?:   string,   // default "MikroTik"
//	  allowTrial?: boolean,
//	  users?: Array<{ username: string, password: string }>,
//	})
func apiInit(_ js.Value, args []js.Value) any {
	cfg := hs.DefaultConfig()

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
	}

	// Always use embedded templates — WASM runs in the browser, no disk access.
	portal = hs.NewPortalWithFS(cfg, hs.DefaultTemplates)

	if len(args) > 0 && args[0].Type() == js.TypeObject {
		users := args[0].Get("users")
		if users.Type() == js.TypeObject && users.InstanceOf(js.Global().Get("Array")) {
			for i := 0; i < users.Length(); i++ {
				u := users.Index(i)
				username := u.Get("username").String()
				password := u.Get("password").String()
				if username != "" {
					portal.AddUser(username, password)
				}
			}
		}
	}

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
	req := hs.PortalRequest{
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
//
// SessionStatus: { loggedIn, username, ip, mac, loginBy, uptime, uptimeSec, bytesIn, bytesOut }
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
	return map[string]any{
		"loggedIn":  sess.LoggedIn,
		"username":  sess.Username,
		"ip":        sess.IP,
		"mac":       sess.MAC,
		"loginBy":   sess.LoginBy,
		"uptime":    sess.Uptime().String(),
		"uptimeSec": int(sess.Uptime().Seconds()),
		"bytesIn":   sess.BytesIn,
		"bytesOut":  sess.BytesOut,
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
		cfg := hs.DefaultConfig()
		portal = hs.NewPortalWithFS(cfg, hs.DefaultTemplates)
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

func responseToJS(resp hs.PortalResponse) map[string]any {
	return map[string]any{
		"action":    resp.Action,
		"html":      resp.HTML,
		"setCookie": resp.SetCookie,
		"targetURL": resp.TargetURL,
	}
}
