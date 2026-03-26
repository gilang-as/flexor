package flexor

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"path/filepath"
	"strings"
)

// Simulator is a thin HTTP wrapper around Portal.
// It implements http.Handler so it can be embedded or run standalone.
type Simulator struct {
	portal *Portal
	mux    *http.ServeMux
}

// NewSimulator creates a Simulator backed by the given configuration.
// At least one user should be added via AddUser before starting.
func NewSimulator(cfg ServerConfig) *Simulator {
	s := &Simulator{
		portal: NewPortal(cfg),
	}
	s.mux = http.NewServeMux()
	s.registerRoutes()
	return s
}

// AddUser adds a username/password pair to the local user database.
func (s *Simulator) AddUser(username, password string) {
	s.portal.AddUser(username, password)
}

// ServeHTTP implements http.Handler.
func (s *Simulator) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// ListenAndServe starts the HTTP server on cfg.BindAddress.
func (s *Simulator) ListenAndServe() error {
	cfg := s.portal.cfg
	log.Printf("[hotspot] simulator listening on %s", cfg.BindAddress)
	log.Printf("[hotspot] template dir: %s", cfg.TemplateDir)
	return http.ListenAndServe(cfg.BindAddress, s)
}

func (s *Simulator) registerRoutes() {
	s.mux.HandleFunc("/", s.handleAny)
	s.mux.HandleFunc("/login", s.handleAny)
	s.mux.HandleFunc("/logout", s.handleAny)
	s.mux.HandleFunc("/status", s.handleAny)
	// Static assets served directly from template dir.
	s.mux.HandleFunc("/md5.js", s.handleStatic)
	s.mux.HandleFunc("/img/", s.handleStatic)
}

// handleAny converts the HTTP request into a PortalRequest, calls Portal.Handle,
// and writes the PortalResponse back to the client.
func (s *Simulator) handleAny(w http.ResponseWriter, r *http.Request) {
	// Serve unknown paths as static files.
	if r.URL.Path != "/" && !isPortalPath(r.URL.Path) {
		s.handleStatic(w, r)
		return
	}

	ip := extractClientIP(r)
	cookie := ""
	if c, err := r.Cookie("hotspot_session"); err == nil {
		cookie = c.Value
	}

	req := PortalRequest{
		Path:     r.URL.Path,
		Method:   r.Method,
		ClientIP: ip,
		Cookie:   cookie,
		Query:    queryToMap(r),
		Target:   r.URL.Query().Get("target"),
	}

	if r.Method == http.MethodPost {
		if err := r.ParseForm(); err == nil {
			req.Form = formToMap(r)
		}
	}

	resp := s.portal.Handle(req)

	if resp.SetCookie != "" {
		http.SetCookie(w, &http.Cookie{
			Name:     "hotspot_session",
			Value:    resp.SetCookie,
			Path:     "/",
			HttpOnly: true,
		})
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	fmt.Fprint(w, resp.HTML)
}

// handleStatic serves raw static files from the template directory.
func (s *Simulator) handleStatic(w http.ResponseWriter, r *http.Request) {
	clean := filepath.Clean(r.URL.Path)
	if strings.Contains(clean, "..") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	full := filepath.Join(s.portal.cfg.TemplateDir, clean)
	http.ServeFile(w, r, full)
}

// ---- Helpers ------------------------------------------------------------

func isPortalPath(path string) bool {
	switch path {
	case "/login", "/logout", "/status":
		return true
	}
	return false
}

func extractClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Sim-Client-IP"); xff != "" {
		return xff
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func queryToMap(r *http.Request) map[string]string {
	m := make(map[string]string, len(r.URL.Query()))
	for k, v := range r.URL.Query() {
		if len(v) > 0 {
			m[k] = v[0]
		}
	}
	return m
}

func formToMap(r *http.Request) map[string]string {
	m := make(map[string]string, len(r.Form))
	for k, v := range r.Form {
		if len(v) > 0 {
			m[k] = v[0]
		}
	}
	return m
}

// clientMAC returns a fake MAC derived from the IP for simulation.
func clientMAC(ip string) string {
	parts := strings.Split(ip, ".")
	if len(parts) == 4 {
		return fmt.Sprintf("AA:BB:CC:%02X:%02X:%02X",
			parseOctet(parts[1]),
			parseOctet(parts[2]),
			parseOctet(parts[3]),
		)
	}
	return "AA:BB:CC:DD:EE:FF"
}

func parseOctet(s string) int {
	n := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		}
	}
	if n > 255 {
		n = 255
	}
	return n
}
