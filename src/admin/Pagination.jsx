// The one paginator. Renders nothing at all when there is only one page, so a
// screen can drop it in unconditionally and short lists stay uncluttered.
//
// Deliberately hook-free: with no jsdom in this repo a component can only be
// tested by calling it as the plain function it is, and a hook would make that
// throw. Every rule it has (which page Next goes to, when a button is dead) is
// therefore covered by Pagination.test.js.

import { c, font } from '../theme.js'
import { GhostButton } from './parts.jsx'
import { clampPage } from './list.js'

const bar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 0 2px',
}

const meta = { fontSize: 12, color: c.muted, fontFamily: font.mono }

/**
 * @param {{ page: number, totalPages: number, total?: number, unit?: string,
 *   onPage: (page: number) => void, busy?: boolean }} props
 */
export default function Pagination({
  page,
  totalPages,
  total,
  unit = 'rows',
  onPage,
  busy = false,
}) {
  const pages = Number(totalPages)
  if (!Number.isFinite(pages) || pages <= 1) return null

  // Guard against a caller whose page state has drifted past the end mid-reload,
  // so Previous/Next never offer a page that does not exist.
  const at = clampPage(page, pages)

  return (
    <div style={bar}>
      <span style={meta}>
        {Number(total ?? 0).toLocaleString('en-NZ')} {unit} · page {at} of {pages}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <GhostButton disabled={busy || at <= 1} onClick={() => onPage(at - 1)}>
          Previous
        </GhostButton>
        <GhostButton disabled={busy || at >= pages} onClick={() => onPage(at + 1)}>
          Next
        </GhostButton>
      </div>
    </div>
  )
}
