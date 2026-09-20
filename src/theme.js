// Atelier design tokens — the storefront's Figma variables (Atelier file
// 6iMAmsNk2HkmhfuqAimM5P, "Design System" 3347:3314), shared with the CRM so the
// two products are one design system (client, Sept 2026: "everything in the
// CRM should look and match the storefront — variables, colours, layouts").
//
// Every value here is a CSS custom property declared in src/index.css, which
// carries the Figma block VERBATIM from atelier-storefront/src/styles/tokens.css.
// Inline styles resolve `var()` like any stylesheet does, so a token change in
// index.css reaches every screen without a JS edit — and the two files can be
// diffed against the storefront's. Never put a hex here.
//
// Type is Inter throughout (the storefront's `--font-family-ui`; its display
// stack leads with the licensed Helvena and falls to Inter). No serif anywhere:
// the client removed Zodiak/Fraunces from the brand in Sept 2026.

export const c = {
  paper: 'var(--color-bg-canvas)',           // the page ground
  surface: 'var(--color-bg-surface)',        // panels, the sidebar
  surfaceDeep: 'var(--color-bg-subtle)',     // recessed: table heads, chips, the frame outside the window
  ink: 'var(--color-text-primary)',
  inkSoft: 'var(--color-text-secondary)',
  muted: 'var(--color-neutral-800)',         // labels / meta — neutral/800, readable on a data screen
  line: 'var(--row-line)',                   // the ONE rule left: between rows in a table
  panel: 'var(--panel)',                     // a block on the window — a shade, never a border
  panelHead: 'var(--panel-head)',            // its head, and a table's head row
  rail: 'var(--rail)',                       // the sidebar and the top bar
  hover: 'var(--hover)',                     // a hovered row
  accentDeep: 'var(--accent-deep)',          // pink/600 — badges, eyebrows, the current page
  accentDark: 'var(--accent-dark)',          // pink/700 — a hovered link
  lineStrong: 'var(--color-border-default)', // an input's rested border
  accent: 'var(--color-brand-primary)',      // ochre — badges, active, links on hover
  accentSoft: 'var(--color-brand-primary-hover)',
  accentSubtle: 'var(--color-brand-primary-subtle)',
  onAccent: 'var(--color-brand-on-primary)',
  brass: 'var(--color-pink-400)',            // fine strokes, hovered borders — never a text colour
  latte: 'var(--color-pink-300)',            // the primary button's ground
  sage: '#6f7a5a',                           // positive / in stock (no DS token; the storefront's own gap)
  clay: '#b06a4f',                           // warning / low / overdue (same)
  danger: 'var(--color-status-danger)',
  dangerSoft: 'var(--color-status-danger-subtle)',
  inverse: 'var(--color-bg-inverse)',
  onInverse: 'var(--color-text-on-inverse)',
}

export const font = {
  display: 'var(--font-family-display)', // headlines, names, big figures
  ui: 'var(--font-family-ui)',           // labels, tables, controls
  accent: 'var(--font-family-display)',  // kept as a name for its call sites; the serif it named is gone
  mono: 'var(--font-family-mono)',       // SKUs and tabular figures
}

// Squared, like the storefront: every radius resolves to 0. The names survive
// for their call sites; the pill is 0 too (buttons are rectangles).
export const radius = { xs: 0, sm: 0, md: 0, lg: 0, xl: 0, xxl: 0, pill: 0 }

export const shadow = {
  none: 'none',
  sm: 'var(--elevation-sm)',
  lift: 'var(--elevation-card)',
  modal: 'var(--elevation-lg)',
  toast: 'var(--elevation-lg)',
}

// The eyebrow is the storefront's `.badge-ochre`: 12px semibold, sentence case,
// ochre — not the tracked uppercase it was.
export const eyebrow = {
  fontFamily: font.ui,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0,
  textTransform: 'none',
  color: c.accentDeep,
}

// CSS duotone "weave" gradient — fallback when no real photo, and the texture base for imagery.
export function weave(lightTone, darkTone) {
  return `repeating-linear-gradient(48deg, rgba(255,255,255,.05) 0 2px, rgba(0,0,0,.05) 2px 4px), linear-gradient(135deg, ${lightTone}, ${darkTone})`
}
