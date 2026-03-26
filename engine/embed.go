package mikrotikhotspot

import "embed"

// DefaultTemplates contains all built-in hotspot templates.
// It is embedded at compile time so the WASM binary is self-contained
// and the CLI binary works without needing the templates directory on disk.
//
//go:embed templates
var DefaultTemplates embed.FS
