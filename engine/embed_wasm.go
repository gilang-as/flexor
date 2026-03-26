//go:build js && wasm

package mikrotikhotspot

import "embed"

// DefaultTemplates contains all built-in hotspot templates embedded at
// compile time so the WASM binary is self-contained.
//
// Requires engine/templates to exist (symlink or real directory):
//
//	ln -sf ../templates engine/templates
//
//go:embed templates
var DefaultTemplates embed.FS
