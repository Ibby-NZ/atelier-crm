// Atelier design tokens — the single source of truth for the luxury system.
// Mirrors the .dc.html design references exactly (see design_handoff README).

export const c = {
  paper: '#F7F2E9',        // raw-silk ivory — primary background
  surface: '#EFE8DA',      // linen — cards / panels / nav
  surfaceDeep: '#E5DBC8',  // oat — table headers / recessed / chips
  ink: '#211C17',          // warm near-black — primary text & headlines
  inkSoft: '#4A4138',      // bark — secondary text
  muted: '#877C6B',        // stone — eyebrows / labels / meta
  line: '#D8CDB8',         // greige — ALL 1px hairlines
  accent: '#7A2E2E',       // claret — SPARINGLY: primary CTA, active, single key figure
  accentSoft: '#9C4A43',   // claret hover
  brass: '#A98B5D',        // metallic detail — fine strokes, never fills
  sage: '#6F7A5A',         // positive / in-stock
  clay: '#B06A4F',         // warning / low / overdue
}

export const font = {
  display: "'Fraunces', Georgia, serif",      // headlines, design & product names, big figures
  ui: "'Inter', system-ui, sans-serif",        // labels, tables, controls
  mono: "'IBM Plex Mono', ui-monospace, monospace", // SKUs, currencies, tabular figures
}

export const shadow = {
  none: 'none',
  lift: '0 16px 36px rgba(33,28,23,.13)',
  modal: '0 24px 60px rgba(33,28,23,.3)',
  toast: '0 12px 32px rgba(33,28,23,.28)',
}

// Eyebrow label style (UPPERCASE, letter-spaced, muted) — used everywhere.
export const eyebrow = {
  fontFamily: font.ui,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: c.muted,
}

// CSS duotone "weave" gradient — fallback when no real photo, and the texture base for imagery.
export function weave(lightTone, darkTone) {
  return `repeating-linear-gradient(48deg, rgba(255,255,255,.05) 0 2px, rgba(0,0,0,.05) 2px 4px), linear-gradient(135deg, ${lightTone}, ${darkTone})`
}
