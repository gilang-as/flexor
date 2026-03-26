// Document base shape: a file with folded top-right corner
// Colored label badge in the lower half

type IconDef = {
  bg: string    // document body color
  label?: string // short text label (max 3 chars)
  labelColor?: string
}

const EXT_MAP: Record<string, IconDef> = {
  // Web
  html:  { bg: '#e44d26', label: 'HTML', labelColor: '#fff' },
  htm:   { bg: '#e44d26', label: 'HTML', labelColor: '#fff' },
  css:   { bg: '#264de4', label: 'CSS',  labelColor: '#fff' },
  scss:  { bg: '#c76495', label: 'SCSS', labelColor: '#fff' },
  less:  { bg: '#1d365d', label: 'LESS', labelColor: '#8ec3e6' },
  // JavaScript / TypeScript
  js:    { bg: '#f0db4f', label: 'JS',   labelColor: '#323330' },
  mjs:   { bg: '#f0db4f', label: 'JS',   labelColor: '#323330' },
  cjs:   { bg: '#f0db4f', label: 'JS',   labelColor: '#323330' },
  jsx:   { bg: '#61dafb', label: 'JSX',  labelColor: '#20232a' },
  ts:    { bg: '#3178c6', label: 'TS',   labelColor: '#fff' },
  tsx:   { bg: '#61dafb', label: 'TSX',  labelColor: '#20232a' },
  // Data / Config
  json:  { bg: '#cbcb41', label: 'JSON', labelColor: '#3b3b00' },
  jsonc: { bg: '#cbcb41', label: 'JSON', labelColor: '#3b3b00' },
  yaml:  { bg: '#cb171e', label: 'YAML', labelColor: '#fff' },
  yml:   { bg: '#cb171e', label: 'YAML', labelColor: '#fff' },
  toml:  { bg: '#9c4221', label: 'TOML', labelColor: '#fff' },
  xml:   { bg: '#e37933', label: 'XML',  labelColor: '#fff' },
  // Markup
  md:    { bg: '#519aba', label: 'MD',   labelColor: '#fff' },
  mdx:   { bg: '#519aba', label: 'MDX',  labelColor: '#fff' },
  // Images — photo icon (no label)
  png:   { bg: '#4ec994' },
  jpg:   { bg: '#4ec994' },
  jpeg:  { bg: '#4ec994' },
  gif:   { bg: '#4ec994' },
  webp:  { bg: '#4ec994' },
  ico:   { bg: '#4ec994' },
  bmp:   { bg: '#4ec994' },
  tiff:  { bg: '#4ec994' },
  tif:   { bg: '#4ec994' },
  avif:  { bg: '#4ec994' },
  svg:   { bg: '#ffb13b', label: 'SVG',  labelColor: '#3b2a00' },
  // Go
  go:    { bg: '#00acd7', label: 'GO',   labelColor: '#fff' },
  mod:   { bg: '#00acd7', label: 'MOD',  labelColor: '#fff' },
  sum:   { bg: '#00acd7', label: 'SUM',  labelColor: '#fff' },
  // Python
  py:    { bg: '#3572a5', label: 'PY',   labelColor: '#fff' },
  // Ruby
  rb:    { bg: '#cc342d', label: 'RB',   labelColor: '#fff' },
  // Systems
  rs:    { bg: '#dea584', label: 'RS',   labelColor: '#3b1a00' },
  c:     { bg: '#555599', label: 'C',    labelColor: '#fff' },
  cpp:   { bg: '#f34b7d', label: 'C++',  labelColor: '#fff' },
  h:     { bg: '#a074c4', label: 'H',    labelColor: '#fff' },
  // Other langs
  java:  { bg: '#b07219', label: 'JAVA', labelColor: '#fff' },
  kt:    { bg: '#a97bff', label: 'KT',   labelColor: '#fff' },
  swift: { bg: '#f05138', label: 'SWIFT',labelColor: '#fff' },
  // Shell
  sh:    { bg: '#4eaa25', label: 'SH',   labelColor: '#fff' },
  bash:  { bg: '#4eaa25', label: 'SH',   labelColor: '#fff' },
  zsh:   { bg: '#4eaa25', label: 'ZSH',  labelColor: '#fff' },
  // Misc
  txt:   { bg: '#787878', label: 'TXT',  labelColor: '#fff' },
  env:   { bg: '#ecd53f', label: 'ENV',  labelColor: '#3b3300' },
}

const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','webp','ico','bmp','tiff','tif','avif'])

function ImageFileIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* document outline */}
      <path
        d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
        fill="#2d2d2d" stroke={color} strokeWidth="0.8"
      />
      {/* fold */}
      <path d="M10 2l3 3h-3V2z" fill={color} opacity="0.8" />
      {/* mountain + sun image icon */}
      <rect x="3.5" y="7" width="9" height="6" rx="0.5" fill={color} opacity="0.2" />
      <circle cx="7" cy="9" r="1" fill={color} opacity="0.9" />
      <polyline points="3.5,13 6,10 8,12 10,10.5 13,13" stroke={color} strokeWidth="0.9" fill="none" opacity="0.9" />
    </svg>
  )
}

function LabelFileIcon({ bg, label, labelColor }: { bg: string; label: string; labelColor: string }) {
  // Constrain label to 4 chars max for display
  const text = label.length > 4 ? label.slice(0, 4) : label
  const fontSize = text.length <= 2 ? 4.5 : text.length === 3 ? 3.8 : 3.2

  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* document body */}
      <path
        d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
        fill="#2d2d2d" stroke={bg} strokeWidth="0.8"
      />
      {/* fold corner */}
      <path d="M10 2l3 3h-3V2z" fill={bg} opacity="0.8" />
      {/* colored label badge */}
      <rect x="2" y="9" width="12" height="5.5" rx="0.8" fill={bg} />
      <text
        x="8" y="13.2"
        textAnchor="middle"
        fontSize={fontSize}
        fontFamily="'Segoe UI', system-ui, sans-serif"
        fontWeight="700"
        fill={labelColor}
        letterSpacing="-0.2"
      >
        {text}
      </text>
    </svg>
  )
}

function DefaultFileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
        fill="#2d2d2d" stroke="#75beff" strokeWidth="0.8"
      />
      <path d="M10 2l3 3h-3V2z" fill="#75beff" opacity="0.8" />
      <line x1="4.5" y1="7" x2="11.5" y2="7" stroke="#75beff" strokeWidth="0.8" opacity="0.6" />
      <line x1="4.5" y1="9" x2="11.5" y2="9" stroke="#75beff" strokeWidth="0.8" opacity="0.6" />
      <line x1="4.5" y1="11" x2="9"    y2="11" stroke="#75beff" strokeWidth="0.8" opacity="0.6" />
    </svg>
  )
}

export default function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const def = EXT_MAP[ext]

  if (!def) return <DefaultFileIcon />
  if (IMAGE_EXTS.has(ext)) return <ImageFileIcon color={def.bg} />
  if (def.label) return <LabelFileIcon bg={def.bg} label={def.label} labelColor={def.labelColor ?? '#fff'} />
  return <DefaultFileIcon />
}
