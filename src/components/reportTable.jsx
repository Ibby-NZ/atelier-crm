// The report table's rendering pieces, shared by the Report Library and the
// Insight view. Both draw the SAME descriptor (utils/reportBuilders.js:
// { cols, rows, minW } with plain cell descriptors), so one Cell, one row and
// one table live here rather than once per screen.
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { Eyebrow, StatusPill } from './ui.jsx'

const FONT_MAP = { serif: font.display, mono: font.mono, ui: font.ui }
const DEFAULT_SIZE = { serif: 15, mono: 12.5, ui: 13 }

export function Cell({ cell }) {
  if (cell.kind === 'pill') return <StatusPill tone={cell.tone}>{cell.t}</StatusPill>
  return (
    <div style={{ textAlign: cell.align, minWidth: 0 }}>
      <div style={{
        fontFamily: FONT_MAP[cell.font], fontSize: cell.size || DEFAULT_SIZE[cell.font],
        color: c[cell.color] || c.inkSoft, fontWeight: cell.weight, lineHeight: 1.45,
        whiteSpace: cell.wrap ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        display: cell.hex ? 'flex' : undefined, alignItems: cell.hex ? 'center' : undefined, gap: cell.hex ? 9 : undefined,
      }}>
        {/* The swatch is decoration on a cell that already carries the colourway's
            name, so nothing is lost in the CSV or the print sheet. */}
        {cell.hex && <span aria-hidden="true" style={{ flex: 'none', width: 11, height: 11, background: cell.hex, border: `1px solid ${c.line}`, borderRadius: 2 }} />}
        {cell.t}
      </div>
      {cell.sub && (
        <div style={{ marginTop: 2, fontSize: 10.5, color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.sub}</div>
      )}
    </div>
  )
}

// One row of a report table. A row the API gave something to lead to is a
// real <Link> rather than a div with an onClick — it is a navigation, so it
// should middle-click, copy and hover like one. A row with no link draws plain.
export function ReportRow({ row, gridCols }) {
  const style = {
    display: 'grid', gridTemplateColumns: gridCols, gap: 14, alignItems: 'center',
    padding: '14px 18px', borderBottom: `1px solid ${c.line}`,
    background: row.total ? c.surface : 'transparent',
  }
  const cells = row.cells.map((cell, j) => <Cell key={j} cell={cell} />)
  if (!row.link) {
    return <div className={row.total ? '' : 'ab-rowhover'} style={style}>{cells}</div>
  }
  return (
    <Link to={row.link} className="ab-rowhover ab-t" style={{ ...style, textDecoration: 'none' }}>
      {cells}
    </Link>
  )
}

// Header plus rows, scrolling inside its own box so a wide table never scrolls
// the page.
export function ReportTable({ table }) {
  const gridCols = table.cols.map((cl) => cl.w).join(' ')
  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflowX: 'auto' }}>
      <div style={{ minWidth: table.minW }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, padding: '11px 18px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
          {table.cols.map((cl) => (
            <div key={cl.t} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, textAlign: cl.align, whiteSpace: 'nowrap' }}>{cl.t}</div>
          ))}
        </div>
        {table.rows.map((r, i) => <ReportRow key={i} row={r} gridCols={gridCols} />)}
      </div>
    </div>
  )
}

// Stands where a table would be. Deliberately not a LockedPanel: nothing is
// being withheld in the cases it covers — a report in flight, an API that
// refused, a window with no rows — and reading as "restricted" would blame the
// role for none of them.
export function StatePanel({ eyebrow, children }) {
  return (
    <div style={{ marginTop: 16, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '28px 30px' }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <div style={{ marginTop: 10, maxWidth: 620, fontFamily: font.display, fontStyle: 'italic', fontSize: 14, lineHeight: 1.6, color: c.inkSoft }}>{children}</div>
    </div>
  )
}
