//go:build !js

package flexor

import "embed"

// DefaultTemplates is empty for non-WASM builds.
// The CLI reads templates from disk via ServerConfig.TemplateDir.
// WASM builds use embed_wasm.go which embeds the actual templates.
var DefaultTemplates embed.FS
