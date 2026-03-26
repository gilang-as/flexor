package mikrotikhotspot

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Portal is the HTTP-agnostic captive portal engine.
// It can be used by the HTTP Simulator, the WASM module, or any other transport.
type Portal struct {
	cfg    ServerConfig
	store  *SessionStore
	userDB *UserDatabase
	fsys   fs.FS // nil = read from cfg.TemplateDir on disk
}

// NewPortal creates a Portal that reads templates from disk (cfg.TemplateDir).
func NewPortal(cfg ServerConfig) *Portal {
	return &Portal{
		cfg:    cfg,
		store:  NewSessionStore(),
		userDB: NewUserDatabase(),
	}
}

// NewPortalWithFS creates a Portal using an embedded or virtual filesystem for
// templates. Required for WASM where direct disk access is unavailable.
func NewPortalWithFS(cfg ServerConfig, fsys fs.FS) *Portal {
	p := NewPortal(cfg)
	p.fsys = fsys
	return p
}

// AddUser registers a username/password pair.
func (p *Portal) AddUser(username, password string) {
	p.userDB.Add(username, password)
}

// Store returns the session store (e.g. for the HTTP layer to inspect sessions).
func (p *Portal) Store() *SessionStore {
	return p.store
}

// ---- Request / Response -------------------------------------------------

// PortalRequest is a transport-agnostic representation of a client request.
type PortalRequest struct {
	// Path is the servlet path: /, /login, /logout, /status.
	Path string
	// Method is "GET" or "POST".
	Method string
	// Form contains POST form values.
	Form map[string]string
	// Query contains URL query parameters.
	Query map[string]string
	// ClientIP is the simulated or real client IP address.
	ClientIP string
	// Cookie is the value of the hotspot_session cookie, if present.
	Cookie string
	// Target is the template sub-directory (e.g. "lv" for Latvian).
	Target string
}

// PortalResponse describes what should be shown to the client.
type PortalResponse struct {
	// Action is "portal" (show HTML) or "allow" (user is authenticated).
	Action string
	// HTML is the rendered portal page (when Action == "portal").
	HTML string
	// SetCookie is a new session cookie value to set on the client.
	SetCookie string
	// TargetURL is where the browser should go after a successful login,
	// or the originally requested URL when Action == "allow".
	TargetURL string
}

// ---- Public API ---------------------------------------------------------

// CheckAccess determines whether a navigation to targetURL should be
// intercepted. Returns Action=="allow" if already authenticated.
func (p *Portal) CheckAccess(clientIP, cookie, targetURL string) PortalResponse {
	if p.isLoggedIn(clientIP, cookie) {
		return PortalResponse{Action: "allow", TargetURL: targetURL}
	}
	return p.Handle(PortalRequest{
		Path:     "/",
		Method:   "GET",
		ClientIP: clientIP,
		Cookie:   cookie,
		Query:    map[string]string{"dst": targetURL},
	})
}

// Handle processes a request to a portal servlet page.
func (p *Portal) Handle(req PortalRequest) PortalResponse {
	sess := p.resolveSession(req.ClientIP, req.Cookie)
	dst := req.get("dst")

	switch req.Path {
	case "/login", "login":
		return p.handleLogin(req, sess, dst)
	case "/logout", "logout":
		return p.handleLogout(req, sess)
	case "/status", "status":
		return p.handleStatus(req, sess)
	default:
		return p.handleRoot(req, sess, dst)
	}
}

// IsLoggedIn reports whether the client identified by IP or cookie is logged in.
func (p *Portal) IsLoggedIn(clientIP, cookie string) bool {
	return p.isLoggedIn(clientIP, cookie)
}

// GetSession returns the active session for clientIP, or nil if none.
func (p *Portal) GetSession(clientIP string) *Session {
	sess, ok := p.store.Get(clientIP)
	if !ok {
		return nil
	}
	return sess
}

// Logout removes the session for clientIP.
func (p *Portal) Logout(clientIP string) {
	p.store.Delete(clientIP)
}

// ---- Internal handlers --------------------------------------------------

func (p *Portal) handleRoot(req PortalRequest, sess *Session, dst string) PortalResponse {
	if sess != nil {
		vars := p.vars(sess, dst, "", req.Target)
		vars["link-redirect"] = vars["link-status"]
		return PortalResponse{Action: "portal", HTML: p.render("redirect.html", req.Target, vars)}
	}
	vars := p.vars(nil, dst, "", req.Target)
	p.fillClientVars(vars, req.ClientIP)
	vars["link-redirect"] = vars["link-login"]
	if html := p.tryRender("rlogin.html", req.Target, vars); html != "" {
		return PortalResponse{Action: "portal", HTML: html}
	}
	return PortalResponse{Action: "portal", HTML: p.render("redirect.html", req.Target, vars)}
}

func (p *Portal) handleLogin(req PortalRequest, sess *Session, dst string) PortalResponse {
	ip := req.ClientIP
	mac := clientMAC(ip)

	if req.Method == "POST" {
		username := req.Form["username"]
		password := req.Form["password"]
		if formDst := req.Form["dst"]; formDst != "" {
			dst = formDst
		}

		if p.cfg.AllowTrial && strings.HasPrefix(username, "T-") {
			newSess := p.createSession(ip, mac, username, "trial")
			vars := p.vars(newSess, dst, "", req.Target)
			if dst != "" {
				vars["link-redirect"] = dst
			}
			return PortalResponse{
				Action:    "portal",
				HTML:      p.render("alogin.html", req.Target, vars),
				SetCookie: newSess.Cookie,
				TargetURL: dst,
			}
		}

		if !p.userDB.Authenticate(username, password) {
			vars := p.vars(nil, dst, "invalid username or password", req.Target)
			vars["username"] = username
			p.fillClientVars(vars, ip)
			return PortalResponse{Action: "portal", HTML: p.render("login.html", req.Target, vars)}
		}

		newSess := p.createSession(ip, mac, username, "password")
		vars := p.vars(newSess, dst, "", req.Target)
		if dst != "" {
			vars["link-redirect"] = dst
			vars["link-orig"] = dst
		}
		return PortalResponse{
			Action:    "portal",
			HTML:      p.render("alogin.html", req.Target, vars),
			SetCookie: newSess.Cookie,
			TargetURL: dst,
		}
	}

	// GET
	if sess != nil {
		vars := p.vars(sess, dst, "", req.Target)
		return PortalResponse{Action: "portal", HTML: p.render("alogin.html", req.Target, vars)}
	}
	vars := p.vars(nil, dst, "", req.Target)
	p.fillClientVars(vars, ip)
	return PortalResponse{Action: "portal", HTML: p.render("login.html", req.Target, vars)}
}

func (p *Portal) handleLogout(req PortalRequest, sess *Session) PortalResponse {
	if sess == nil {
		vars := p.vars(nil, "", "", req.Target)
		p.fillClientVars(vars, req.ClientIP)
		if html := p.tryRender("flogout.html", req.Target, vars); html != "" {
			return PortalResponse{Action: "portal", HTML: html}
		}
		vars["link-redirect"] = vars["link-login"]
		return PortalResponse{Action: "portal", HTML: p.render("redirect.html", req.Target, vars)}
	}
	snap := *sess
	p.store.Delete(req.ClientIP)
	vars := p.vars(&snap, "", "", req.Target)
	return PortalResponse{Action: "portal", HTML: p.render("logout.html", req.Target, vars)}
}

func (p *Portal) handleStatus(req PortalRequest, sess *Session) PortalResponse {
	if sess == nil {
		vars := p.vars(nil, "", "", req.Target)
		p.fillClientVars(vars, req.ClientIP)
		if html := p.tryRender("fstatus.html", req.Target, vars); html != "" {
			return PortalResponse{Action: "portal", HTML: html}
		}
		vars["link-redirect"] = vars["link-login"]
		return PortalResponse{Action: "portal", HTML: p.render("redirect.html", req.Target, vars)}
	}
	vars := p.vars(sess, "", "", req.Target)
	return PortalResponse{Action: "portal", HTML: p.render("status.html", req.Target, vars)}
}

// ---- Helpers ------------------------------------------------------------

func (p *Portal) isLoggedIn(ip, cookie string) bool {
	return p.resolveSession(ip, cookie) != nil
}

func (p *Portal) resolveSession(ip, cookie string) *Session {
	if sess, ok := p.store.Get(ip); ok && sess.LoggedIn {
		return sess
	}
	if cookie != "" {
		if sess, ok := p.store.GetByCookie(cookie); ok && sess.LoggedIn {
			return sess
		}
	}
	return nil
}

func (p *Portal) createSession(ip, mac, username, loginBy string) *Session {
	sess := &Session{
		ID:        generateSessionID(),
		Username:  username,
		IP:        ip,
		MAC:       mac,
		LoggedIn:  true,
		LoginBy:   loginBy,
		LoginTime: time.Now(),
		Cookie:    generateCookie(),
	}
	p.store.Set(sess)
	return sess
}

func (p *Portal) vars(sess *Session, dst, errMsg, target string) map[string]string {
	return Variables(p.cfg, sess, dst, errMsg, "", "", "true", target)
}

func (p *Portal) fillClientVars(vars map[string]string, ip string) {
	vars["ip"] = ip
	vars["mac"] = clientMAC(ip)
	vars["mac-esc"] = vars["mac"]
	if p.cfg.AllowTrial {
		vars["trial"] = "yes"
	}
}

// readTemplate loads a template file, trying the sub-directory first then root.
func (p *Portal) readTemplate(name, target string) (string, bool) {
	// Sanitise target to prevent path traversal.
	if strings.Contains(target, "..") || strings.ContainsRune(target, '/') {
		target = ""
	}
	if p.fsys != nil {
		base := p.cfg.TemplateDir
		if target != "" {
			data, err := fs.ReadFile(p.fsys, base+"/"+target+"/"+name)
			if err == nil {
				return string(data), true
			}
		}
		data, err := fs.ReadFile(p.fsys, base+"/"+name)
		return string(data), err == nil
	}
	if target != "" {
		data, err := os.ReadFile(filepath.Join(p.cfg.TemplateDir, target, name))
		if err == nil {
			return string(data), true
		}
	}
	data, err := os.ReadFile(filepath.Join(p.cfg.TemplateDir, name))
	return string(data), err == nil
}

func (p *Portal) render(name, target string, vars map[string]string) string {
	content, ok := p.readTemplate(name, target)
	if !ok {
		return "<html><body>Template not found: " + name + "</body></html>"
	}
	return RenderTemplate(content, vars)
}

func (p *Portal) tryRender(name, target string, vars map[string]string) string {
	content, ok := p.readTemplate(name, target)
	if !ok {
		return ""
	}
	return RenderTemplate(content, vars)
}

// get returns the value of a query param, falling back to a form value.
func (req PortalRequest) get(key string) string {
	if req.Query != nil {
		if v, ok := req.Query[key]; ok && v != "" {
			return v
		}
	}
	if req.Form != nil {
		return req.Form[key]
	}
	return ""
}
