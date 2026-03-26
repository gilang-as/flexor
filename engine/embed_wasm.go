//go:build js && wasm

package mikrotikhotspot

import "io/fs"

// DefaultTemplates is nil for WASM builds.
// Templates are injected at runtime from the browser via hotspot.init({ templates: {...} }).
var DefaultTemplates fs.FS
