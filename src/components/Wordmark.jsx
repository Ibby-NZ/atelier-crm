// The ATELIER TEXTILES wordmark — the client's horizontal lockup. The geometry
// lives in ./wordmarkPaths.js (shared with the printed packing slip, and the same
// shapes the storefront inlines). Two-tone through `--wordmark-accent` /
// `--wordmark-ink` (index.css), so a dark surface reverses it by re-declaring the
// pair on the surface, never on the mark. 636 × 141; height follows width.
import { Link } from 'react-router-dom'
import { WORDMARK_PATHS, WORDMARK_VIEWBOX } from './wordmarkPaths.js'

export default function Wordmark({ width = 160, to = '/dashboard', label = 'Atelier Textiles', style }) {
  const svg = (
    <svg viewBox={WORDMARK_VIEWBOX} role="img" aria-label={label} fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width, height: 'auto', display: 'block', ...style }}>
      {WORDMARK_PATHS.map((path, index) => (
        <path key={index} fill={`var(--wordmark-${path.tone})`} d={path.d} />
      ))}
    </svg>
  )
  return to ? <Link to={to} style={{ display: 'inline-block', lineHeight: 0 }}>{svg}</Link> : svg
}
