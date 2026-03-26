package flexor

import (
	"strings"
)

// RenderTemplate processes a MikroTik hotspot HTML template, substituting
// $(var) variables and evaluating $(if)…$(elif)…$(else)…$(endif) blocks.
//
// The variable map is expected to be produced by Variables().
func RenderTemplate(src string, vars map[string]string) string {
	// Process conditionals first, then do variable substitution on the result.
	rendered := evalConditionals(src, vars)
	rendered = substituteVars(rendered, vars)
	return rendered
}

// substituteVars replaces all $(varname) occurrences with their values.
// Unknown variables are substituted with an empty string.
func substituteVars(src string, vars map[string]string) string {
	var b strings.Builder
	b.Grow(len(src))
	i := 0
	for i < len(src) {
		idx := strings.Index(src[i:], "$(")
		if idx == -1 {
			b.WriteString(src[i:])
			break
		}
		b.WriteString(src[i : i+idx])
		i += idx + 2 // skip "$("

		end := strings.Index(src[i:], ")")
		if end == -1 {
			// Unclosed $(, emit as-is and stop.
			b.WriteString("$(")
			b.WriteString(src[i:])
			break
		}
		name := src[i : i+end]
		i += end + 1 // skip past ")"

		// Skip control keywords — they should already be stripped by evalConditionals.
		if isControlKeyword(name) {
			continue
		}
		val, ok := vars[name]
		if !ok {
			val = ""
		}
		b.WriteString(val)
	}
	return b.String()
}

// isControlKeyword returns true for $(if …), $(elif …), $(else), $(endif).
func isControlKeyword(name string) bool {
	trimmed := strings.TrimSpace(name)
	return strings.HasPrefix(trimmed, "if ") ||
		strings.HasPrefix(trimmed, "elif ") ||
		trimmed == "else" ||
		trimmed == "endif"
}

// tokenize splits src into a flat list of tokens: plain text and $(...) directives.
type token struct {
	kind  string // "text", "var", "if", "elif", "else", "endif"
	raw   string // original text including $()
	inner string // content inside $()
}

func tokenize(src string) []token {
	var tokens []token
	i := 0
	for i < len(src) {
		idx := strings.Index(src[i:], "$(")
		if idx == -1 {
			if i < len(src) {
				tokens = append(tokens, token{kind: "text", raw: src[i:]})
			}
			break
		}
		if idx > 0 {
			tokens = append(tokens, token{kind: "text", raw: src[i : i+idx]})
		}
		i += idx + 2 // skip "$("

		end := strings.Index(src[i:], ")")
		if end == -1 {
			// Unclosed — treat the rest as text.
			tokens = append(tokens, token{kind: "text", raw: "$(" + src[i:]})
			break
		}
		inner := src[i : i+end]
		i += end + 1

		trimmed := strings.TrimSpace(inner)
		kind := "var"
		switch {
		case strings.HasPrefix(trimmed, "if "):
			kind = "if"
		case strings.HasPrefix(trimmed, "elif "):
			kind = "elif"
		case trimmed == "else":
			kind = "else"
		case trimmed == "endif":
			kind = "endif"
		}
		tokens = append(tokens, token{kind: kind, raw: "$(" + inner + ")", inner: trimmed})
	}
	return tokens
}

// evalConditionals walks the token stream, evaluating if/elif/else/endif
// blocks and returning only the content of branches that are taken.
func evalConditionals(src string, vars map[string]string) string {
	tokens := tokenize(src)
	result, _ := evalBlock(tokens, 0, vars)
	return result
}

// evalBlock processes tokens starting at position pos until it hits an
// elif/else/endif that belongs to the current if-block (or end of tokens).
// Returns (rendered output, next token index after the closing endif).
func evalBlock(tokens []token, pos int, vars map[string]string) (string, int) {
	var b strings.Builder
	for pos < len(tokens) {
		t := tokens[pos]
		switch t.kind {
		case "text", "var":
			b.WriteString(t.raw)
			pos++
		case "if":
			cond := strings.TrimPrefix(t.inner, "if ")
			pos++
			// Collect branches: list of (condition, body-tokens).
			// condition "" means "else".
			type branch struct {
				cond   string // "" for else
				tokens []token
			}
			var branches []branch
			currentCond := cond
			var current []token
			depth := 1
			for pos < len(tokens) && depth > 0 {
				tt := tokens[pos]
				if tt.kind == "if" {
					depth++
					current = append(current, tt)
					pos++
				} else if depth == 1 && tt.kind == "elif" {
					branches = append(branches, branch{cond: currentCond, tokens: current})
					currentCond = strings.TrimPrefix(tt.inner, "elif ")
					current = nil
					pos++
				} else if depth == 1 && tt.kind == "else" {
					branches = append(branches, branch{cond: currentCond, tokens: current})
					currentCond = ""
					current = nil
					pos++
				} else if tt.kind == "endif" {
					depth--
					if depth == 0 {
						branches = append(branches, branch{cond: currentCond, tokens: current})
						pos++
					} else {
						current = append(current, tt)
						pos++
					}
				} else {
					current = append(current, tt)
					pos++
				}
			}
			// Evaluate branches.
			for _, br := range branches {
				if br.cond == "" || evalCondition(br.cond, vars) {
					out, _ := evalBlock(br.tokens, 0, vars)
					b.WriteString(out)
					break
				}
			}
		case "elif", "else", "endif":
			// These are terminators handled by the parent evalBlock call.
			return b.String(), pos
		}
	}
	return b.String(), pos
}

// evalCondition evaluates a MikroTik condition string against the vars map.
// Supported forms:
//
//	varname              → true if value is non-empty
//	varname == value     → equality
//	varname != value     → inequality
func evalCondition(cond string, vars map[string]string) bool {
	cond = strings.TrimSpace(cond)

	if idx := strings.Index(cond, " != "); idx != -1 {
		varName := strings.TrimSpace(cond[:idx])
		rhs := strings.Trim(strings.TrimSpace(cond[idx+4:]), "'\"")
		return vars[varName] != rhs
	}
	if idx := strings.Index(cond, " == "); idx != -1 {
		varName := strings.TrimSpace(cond[:idx])
		rhs := strings.Trim(strings.TrimSpace(cond[idx+4:]), "'\"")
		return vars[varName] == rhs
	}
	// Plain variable truthiness
	return vars[cond] != ""
}
