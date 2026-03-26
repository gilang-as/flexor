// Package mikrotikhotspot provides a simulation of a MikroTik RouterOS HotSpot
// captive portal. It handles session management, MikroTik-style template
// variable substitution ($(var)), and all standard hotspot servlet pages.
package mikrotikhotspot

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"sync"
	"time"
)

// Provider is the captive portal brand/type.
type Provider string

const (
	ProviderMikroTik Provider = "mikrotik"
)

// Session represents a connected hotspot client.
type Session struct {
	ID        string
	Username  string
	IP        string
	MAC       string
	LoggedIn  bool
	LoginBy   string // "password", "mac", "trial"
	LoginTime time.Time

	// limits (zero = unlimited)
	SessionTimeout time.Duration
	IdleTimeout    time.Duration
	BytesIn        int64
	BytesOut       int64
	LimitBytesIn   int64
	LimitBytesOut  int64

	// Blocked means the client must watch an advertisement before accessing the internet.
	Blocked bool

	Cookie string
}

// ProfileConfig holds per-profile limits applied to sessions at login.
type ProfileConfig struct {
	SessionTimeout time.Duration
	IdleTimeout    time.Duration
	LimitBytesIn   int64
	LimitBytesOut  int64
	SharedUsers    int
}

// Uptime returns elapsed time since login.
func (s *Session) Uptime() time.Duration {
	if !s.LoggedIn {
		return 0
	}
	return time.Since(s.LoginTime).Truncate(time.Second)
}

// SessionTimeLeft returns remaining session time. Returns 0 if no limit.
func (s *Session) SessionTimeLeft() time.Duration {
	if s.SessionTimeout == 0 || !s.LoggedIn {
		return 0
	}
	left := s.SessionTimeout - s.Uptime()
	if left < 0 {
		return 0
	}
	return left
}

// SessionStore manages active sessions in memory.
type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session // keyed by IP
	cookies  map[string]*Session // keyed by cookie value
}

func NewSessionStore() *SessionStore {
	return &SessionStore{
		sessions: make(map[string]*Session),
		cookies:  make(map[string]*Session),
	}
}

func (ss *SessionStore) Get(ip string) (*Session, bool) {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	s, ok := ss.sessions[ip]
	return s, ok
}

func (ss *SessionStore) GetByCookie(cookie string) (*Session, bool) {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	s, ok := ss.cookies[cookie]
	return s, ok
}

func (ss *SessionStore) Set(s *Session) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.sessions[s.IP] = s
	if s.Cookie != "" {
		ss.cookies[s.Cookie] = s
	}
}

func (ss *SessionStore) Delete(ip string) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if s, ok := ss.sessions[ip]; ok {
		if s.Cookie != "" {
			delete(ss.cookies, s.Cookie)
		}
		delete(ss.sessions, ip)
	}
}

// userEntry stores credentials and optional profile assignment for a single user.
type userEntry struct {
	password  string
	profileID string
}

// UserDatabase is a simple in-memory user store for the simulator.
type UserDatabase struct {
	mu    sync.RWMutex
	users map[string]userEntry
}

func NewUserDatabase() *UserDatabase {
	return &UserDatabase{users: make(map[string]userEntry)}
}

func (db *UserDatabase) Add(username, password string) {
	db.AddWithProfile(username, password, "")
}

func (db *UserDatabase) AddWithProfile(username, password, profileID string) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.users[username] = userEntry{password: password, profileID: profileID}
}

func (db *UserDatabase) Authenticate(username, password string) bool {
	db.mu.RLock()
	defer db.mu.RUnlock()
	e, ok := db.users[username]
	return ok && e.password == password
}

func (db *UserDatabase) GetProfileID(username string) string {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.users[username].profileID
}

// generateCookie creates a random hex cookie value.
func generateCookie() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// generateSessionID creates a random session ID.
func generateSessionID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// FormatDuration formats a duration in MikroTik style: "10h2m33s".
// Exported for use by the WASM API layer.
func FormatDuration(d time.Duration) string {
	return formatDuration(d)
}

// formatDuration formats a duration in MikroTik style: "10h2m33s".
func formatDuration(d time.Duration) string {
	if d == 0 {
		return ""
	}
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh%dm%ds", h, m, s)
	}
	if m > 0 {
		return fmt.Sprintf("%dm%ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}

// formatBytes formats bytes in a human-friendly MikroTik style.
func formatBytes(n int64) string {
	if n < 1024 {
		return fmt.Sprintf("%dB", n)
	}
	if n < 1024*1024 {
		return fmt.Sprintf("%.1fKiB", float64(n)/1024)
	}
	if n < 1024*1024*1024 {
		return fmt.Sprintf("%.1fMiB", float64(n)/(1024*1024))
	}
	return fmt.Sprintf("%.1fGiB", float64(n)/(1024*1024*1024))
}

// ServerConfig holds configuration for the hotspot server.
type ServerConfig struct {
	// ServerAddress is the address:port of this hotspot server (e.g. "10.5.50.1:80")
	ServerAddress string
	// Hostname is the DNS name or IP shown in hotspot links
	Hostname string
	// ServerName is the name property from /ip hotspot
	ServerName string
	// Identity is the RouterOS identity
	Identity string
	// TemplateDir is path to the hotspot HTML template directory
	TemplateDir string
	// BindAddress is the address the HTTP server listens on
	BindAddress string

	// CHAP authentication settings
	EnableCHAP bool

	// AllowTrial enables trial user access via T-<mac> username
	AllowTrial bool

	// AdvertRequired marks new sessions as blocked until they complete an advertisement.
	AdvertRequired bool
	// AdvertURL is the advertisement URL injected as $(link-advert).
	AdvertURL string

	// SSLLogin indicates HTTPS is being used
	SSLLogin bool
}

// DefaultConfig returns a sensible default configuration for local development.
func DefaultConfig() ServerConfig {
	return ServerConfig{
		ServerAddress: "127.0.0.1:8080",
		Hostname:      "127.0.0.1",
		ServerName:    "hotspot1",
		Identity:      "MikroTik",
		TemplateDir:   "templates/mikrotik-default",
		BindAddress:   ":8080",
		EnableCHAP:    false,
		AllowTrial:    false,
		SSLLogin:      false,
	}
}

// Variables builds the MikroTik template variable map for a given request context.
func Variables(cfg ServerConfig, sess *Session, dst string, errMsg string, chapID string, chapChallenge string, popup string, target string) map[string]string {
	scheme := "http"
	if cfg.SSLLogin {
		scheme = "https"
	}

	base := fmt.Sprintf("%s://%s", scheme, cfg.Hostname)
	if target != "" {
		base = fmt.Sprintf("%s://%s/%s", scheme, cfg.Hostname, target)
	}

	linkLoginOnly := fmt.Sprintf("%s://%s/login", scheme, cfg.Hostname)
	linkLogin := linkLoginOnly
	if dst != "" {
		linkLogin = linkLoginOnly + "?dst=" + url.QueryEscape(dst)
	}
	linkLogout := fmt.Sprintf("%s://%s/logout", scheme, cfg.Hostname)
	linkStatus := fmt.Sprintf("%s://%s/status", scheme, cfg.Hostname)
	_ = base

	linkRedirect := dst
	if linkRedirect == "" {
		linkRedirect = linkStatus
	}

	vars := map[string]string{
		// server
		"hostname":       cfg.Hostname,
		"identity":       cfg.Identity,
		"server-address": cfg.ServerAddress,
		"server-name":    cfg.ServerName,
		"ssl-login":      boolToYesNo(cfg.SSLLogin),
		"plain-passwd":   "yes",

		// links
		"link-login":        linkLogin,
		"link-login-only":   linkLoginOnly,
		"link-logout":       linkLogout,
		"link-status":       linkStatus,
		"link-orig":         dst,
		"link-orig-esc":     url.QueryEscape(dst),
		"link-redirect":     linkRedirect,
		"link-redirect-esc": url.QueryEscape(linkRedirect),

		// misc login page
		"chap-id":        chapID,
		"chap-challenge": chapChallenge,
		"popup":          popup,
		"error":          errMsg,
		"error-orig":     errMsg,
		"target-dir":     target,

		// advert
		"advert-pending": "no",
		"link-advert":    "",
	}

	if sess != nil {
		uptime := sess.Uptime()
		timeLeft := sess.SessionTimeLeft()

		vars["username"] = sess.Username
		vars["ip"] = sess.IP
		vars["mac"] = sess.MAC
		vars["mac-esc"] = url.QueryEscape(sess.MAC)
		vars["logged-in"] = boolToYesNo(sess.LoggedIn)
		vars["login-by"] = sess.LoginBy
		vars["session-id"] = sess.ID

		vars["uptime"] = formatDuration(uptime)
		vars["uptime-secs"] = fmt.Sprintf("%d", int(uptime.Seconds()))

		if timeLeft > 0 {
			vars["session-time-left"] = formatDuration(timeLeft)
			vars["session-time-left-secs"] = fmt.Sprintf("%d", int(timeLeft.Seconds()))
			vars["session-timeout"] = formatDuration(timeLeft)
			vars["session-timeout-secs"] = fmt.Sprintf("%d", int(timeLeft.Seconds()))
		} else {
			vars["session-time-left"] = ""
			vars["session-time-left-secs"] = "0"
			vars["session-timeout"] = ""
			vars["session-timeout-secs"] = "0"
		}

		if sess.IdleTimeout > 0 {
			vars["idle-timeout"] = formatDuration(sess.IdleTimeout)
			vars["idle-timeout-secs"] = fmt.Sprintf("%d", int(sess.IdleTimeout.Seconds()))
		} else {
			vars["idle-timeout"] = ""
			vars["idle-timeout-secs"] = "0"
		}

		vars["bytes-in"] = fmt.Sprintf("%d", sess.BytesIn)
		vars["bytes-out"] = fmt.Sprintf("%d", sess.BytesOut)
		vars["bytes-in-nice"] = formatBytes(sess.BytesIn)
		vars["bytes-out-nice"] = formatBytes(sess.BytesOut)
		vars["packets-in"] = "0"
		vars["packets-out"] = "0"

		if sess.LimitBytesIn > 0 {
			vars["limit-bytes-in"] = fmt.Sprintf("%d", sess.LimitBytesIn)
			vars["remain-bytes-in"] = fmt.Sprintf("%d", sess.LimitBytesIn-sess.BytesIn)
		} else {
			vars["limit-bytes-in"] = "---"
			vars["remain-bytes-in"] = "---"
		}
		if sess.LimitBytesOut > 0 {
			vars["limit-bytes-out"] = fmt.Sprintf("%d", sess.LimitBytesOut)
			vars["remain-bytes-out"] = fmt.Sprintf("%d", sess.LimitBytesOut-sess.BytesOut)
		} else {
			vars["limit-bytes-out"] = "---"
			vars["remain-bytes-out"] = "---"
		}

		vars["trial"] = "no"
		if sess.LoginBy == "trial" {
			vars["trial"] = "yes"
		}

		vars["refresh-timeout"] = ""
		vars["refresh-timeout-secs"] = "0"
		vars["blocked"] = boolToYesNo(sess.Blocked)
		vars["login-by-mac"] = boolToYesNo(sess.LoginBy == "mac")
		if sess.Blocked && cfg.AdvertURL != "" {
			vars["link-advert"] = cfg.AdvertURL
			vars["advert-pending"] = "yes"
		}
	} else {
		vars["username"] = ""
		vars["ip"] = ""
		vars["mac"] = ""
		vars["mac-esc"] = ""
		vars["logged-in"] = "no"
		vars["login-by"] = ""
		vars["session-id"] = ""
		vars["uptime"] = ""
		vars["uptime-secs"] = "0"
		vars["session-time-left"] = ""
		vars["session-time-left-secs"] = "0"
		vars["session-timeout"] = ""
		vars["session-timeout-secs"] = "0"
		vars["idle-timeout"] = ""
		vars["idle-timeout-secs"] = "0"
		vars["bytes-in"] = "0"
		vars["bytes-out"] = "0"
		vars["bytes-in-nice"] = "0B"
		vars["bytes-out-nice"] = "0B"
		vars["packets-in"] = "0"
		vars["packets-out"] = "0"
		vars["limit-bytes-in"] = "---"
		vars["limit-bytes-out"] = "---"
		vars["remain-bytes-in"] = "---"
		vars["remain-bytes-out"] = "---"
		vars["trial"] = "no"
		vars["refresh-timeout"] = ""
		vars["refresh-timeout-secs"] = "0"
		vars["blocked"] = "no"
		vars["login-by-mac"] = "no"
	}

	return vars
}

func boolToYesNo(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}
