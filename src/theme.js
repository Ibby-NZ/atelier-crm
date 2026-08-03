// Atelier design tokens — the single source of truth for the design system.
// Mirrors the Figma "Design System" page (Atelier file, node 3347-3314):
// ochre / oat / umber ramps with light-mode semantic tokens, the radius scale,
// and the elevation set. Fonts are Switzer (primary) with Zodiak reserved for
// accent words, per the Foundations typography note.

export const c = {
  paper: '#F2F0E9',        // bg/canvas (oat 100) — primary background
  surface: '#EBE9DF',      // bg/subtle (oat 200) — cards / panels / nav
  surfaceDeep: '#E5E1D4',  // bg/surface (oat 300) — table headers / recessed / chips
  ink: '#33312B',          // text/primary (oat 900) — primary text & headlines
  inkSoft: '#605D4F',      // text/secondary (oat 800)
  muted: '#898472',        // oat 700 — eyebrows / labels / meta
  line: '#D4CFB9',         // oat 500 — ALL 1px hairlines
  accent: '#B5985B',       // brand/primary (ochre 500) — SPARINGLY: primary CTA, active
  accentSoft: '#735F33',   // brand/primary-hover (ochre 700)
  accentSubtle: '#C7AD77', // brand/primary-subtle (ochre 400) — ghost hover, outline pills
  onAccent: '#FFFFFF',     // brand/on-primary
  brass: '#937942',        // ochre 600 — metallic detail, fine strokes, never fills
  sage: '#6F7A5A',         // positive / in-stock (no DS success token; kept)
  clay: '#B06A4F',         // warning / low / overdue (no DS warning token; kept)
  danger: '#D8281F',       // status/danger — errors, destructive verbs
  dangerSoft: '#FF7B74',   // status/danger-subtle
  inverse: '#33312B',      // bg/inverse — dark panels
  onInverse: '#F2F0E9',    // text/on-inverse
}

export const font = {
  display: "'Switzer', 'Inter', system-ui, sans-serif", // headlines, design & product names, big figures
  ui: "'Switzer', 'Inter', system-ui, sans-serif",       // labels, tables, controls
  accent: "'Zodiak', Georgia, serif",                    // highlighted / accent words only
  mono: "'IBM Plex Mono', ui-monospace, monospace",      // SKUs, currencies, tabular figures
}

// radius/* — xs..2xl plus the pill used by every button and badge.
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 42,
  pill: 9999,
}

// elevation/* — sm / card / lg from the Foundations sheet.
export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,.08)',
  lift: '0 8px 24px -4px rgba(17,27,79,.13)',
  modal: '0 16px 40px -8px rgba(17,27,79,.18)',
  toast: '0 16px 40px -8px rgba(17,27,79,.18)',
}

// Eyebrow label style (label/xs: 12/600 uppercase) — used everywhere.
export const eyebrow = {
  fontFamily: font.ui,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: c.muted,
}

// CSS duotone "weave" gradient — fallback when no real photo, and the texture base for imagery.
export function weave(lightTone, darkTone) {
  return `repeating-linear-gradient(48deg, rgba(255,255,255,.05) 0 2px, rgba(0,0,0,.05) 2px 4px), linear-gradient(135deg, ${lightTone}, ${darkTone})`
}
