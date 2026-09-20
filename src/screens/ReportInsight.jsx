// The Insight section of the Reporting overview (/reporting) — one subject,
// every angle, live from atelier-api's GET /admin/reports/insight in a single
// round trip. It sits beneath the indicative FY roll-ups on the same page.
//
// Where a live report is one table, this is the page a row of it opens: for a
// house, a collection, a design or a colourway (or the whole platform, when
// nothing is pinned) it draws the headline figures and then every section the
// API composed — the trend, the houses / collections / designs / categories
// under it, every colourway with what sold against what is on the shelf, who
// buys it, which staff member sold it, where the demand sits in the lifecycle,
// what is awaiting an invoice, and the recent orders. Each section IS a report
// envelope, so it renders through the same buildLiveReport pipeline as the
// library and its rows lead onward the same way — a design row here opens the
// design's insight, a month row narrows the window, an order row opens the
// order desk.
//
// THE SUBJECT AND ITS CONTEXT LIVE IN THE URL (utils/insight.js), for the same
// reason the library keeps its filters there: this section is usually already
// mounted when one of its own rows is clicked. A deep link that arrives with a
// subject pinned scrolls the section into view once, so a library row lands on
// the insight and not on the overview above it.
//
// THE SERVER IS THE ONLY AUTHORITY ON WHAT IS SHOWN. Masking ran per section
// before the payload existed; `meta.masked_columns` and
// `meta.withheld_sections` are its own account of what it withheld, printed
// before the tables so a partial page never reads as a complete one.
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { Em, StatusPill, Toast } from '../components/ui.jsx'
import { ReportTable, StatePanel } from '../components/reportTable.jsx'
import { buildLiveReport, exportRows, liveNote } from '../utils/reportBuilders.js'
import {
  INSIGHT_API_PATH,
  breadcrumbs,
  contextOf,
  insightFiltersFromParams,
  insightQuery,
  insightRoute,
  kindOfFilters,
  pinnedColumns,
  pinsOf,
  sectionIntro,
  sectionTitle,
  subjectHeading,
  summaryTiles,
} from '../utils/insight.js'
import { reportSearchParams } from '../utils/reportFilters.js'
import { toCSV, downloadCSVFile, htmlTable, openPrintWindow } from '../utils/exporters.js'
import { apiGet } from '../lib/api.js'
import { useAccess } from '../auth/AuthContext.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { canViewReport, reportDenialReason } from '../auth/reportPolicy.js'
import { categoryLabel } from '../lib/categories.js'

const IDLE = { loading: false, error: '', payload: null }
const LOAD_ERROR = 'We could not reach the platform for this view. Check the API is running and try again.'
const COVERAGE_FOOTNOTE =
  'Live platform orders and live inventory only. Atelier’s historic Dynamics 365 sales are staged ' +
  'header-only, so nothing from before the platform opened is in any figure here. Request lines carry ' +
  'no price until the invoice is typed into Xero and count at nil under “unpriced lines”.'

const eyebrowStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }
const CONTEXT_LABELS = { from: 'From', to: 'To', category: 'Category', brand_code: 'Brand code', range: 'Range' }

// A figure shrinks to fit its tile rather than being cut: "EUR 1,039.50" is a
// number the office reads, "EUR 1,039…" is not.
const tileFontSize = (value) => (value.length > 11 ? 19 : value.length > 8 ? 23 : 27)

function Tile({ tile, first }) {
  return (
    <div style={{ padding: '18px 20px', borderLeft: first ? 'none' : `1px solid ${c.line}`, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>{tile.label}</div>
      <div style={{ marginTop: 11, fontFamily: font.display, fontWeight: 500, fontSize: tileFontSize(tile.value), letterSpacing: '-0.01em', color: c.ink, whiteSpace: 'nowrap' }}>{tile.value}</div>
      <div style={{ marginTop: 7, fontSize: 11.5, lineHeight: 1.45, color: c.muted }}>{tile.sub}</div>
    </div>
  )
}

function Crumbs({ trail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: c.muted }}>
      {trail.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span aria-hidden="true">›</span>}
          {crumb.to
            ? <Link to={crumb.to} className="ab-link" style={{ color: c.accent, textDecoration: 'none' }}>{crumb.label}</Link>
            : <span style={{ color: c.ink }}>{crumb.label}</span>}
        </span>
      ))}
    </div>
  )
}

// One section: its title, what the rows are of, the table (or why there is none),
// and only the notes that qualify THIS table. The coverage sentence every
// section repeats is said once, in the footer.
function Section({ section, table }) {
  const intro = sectionIntro(section.key, section.meta)
  const note = liveNote({ ...section.meta, coverage: null })
  const shown = table.empty ? 0 : table.rows.filter((r) => !r.total).length
  return (
    <section style={{ marginTop: 38 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={eyebrowStyle}>{sectionTitle(section.key)}</span>
          <span style={{ fontSize: 11.5, color: c.muted }}>{section.title}</span>
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
          {shown} {shown === 1 ? 'row' : 'rows'}{section.meta.truncated ? ` of ${section.meta.rows_total}` : ''}
        </span>
      </div>
      {intro && <div style={{ marginBottom: 12, fontSize: 12.5, lineHeight: 1.55, color: c.inkSoft }}>{intro}</div>}
      {table.empty
        ? <StatePanel eyebrow="Nothing in this window">{table.emptyReason}</StatePanel>
        : <ReportTable table={table} />}
      {note && <div style={{ marginTop: 10, fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.muted, lineHeight: 1.5 }}>{note}</div>}
    </section>
  )
}

export function InsightSection() {
  const [params] = useSearchParams()
  const access = useAccess()
  const filters = insightFiltersFromParams(params)
  const query = insightQuery(filters)
  const allowed = canViewReport(access, 'insight')
  // One primitive to key the fetch on: applying, widening, narrowing each land
  // as exactly one request.
  const url = allowed ? `${INSIGHT_API_PATH}${query}` : null

  const [live, setLive] = useState(IDLE)
  const [toast, setToast] = useState(null)
  const anchor = useRef(null)

  // Deep link with a subject pinned: scroll to the section once its first
  // payload has drawn. Before that the section is a heading and a loading
  // panel, the page ends just below it, and a scroll lands short. A bare
  // period filter (the overview's own bar) is not a subject and stays put.
  const pinned = Object.keys(pinsOf(filters)).length > 0
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !live.payload || !pinned || !anchor.current) return
    scrolled.current = true
    anchor.current.scrollIntoView({ block: 'start' })
  }, [live.payload]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!url) {
      setLive(IDLE)
      return undefined
    }
    let active = true
    setLive({ loading: true, error: '', payload: null })
    apiGet(url)
      .then((payload) => { if (active) setLive({ loading: false, error: '', payload }) })
      .catch((err) => { if (active) setLive({ loading: false, error: (err && err.message) || LOAD_ERROR, payload: null }) })
    return () => { active = false }
  }, [url])

  const payload = live.payload
  const subject = payload ? payload.subject : { kind: kindOfFilters(filters) }
  const heading = subjectHeading(subject, filters)
  const trail = breadcrumbs(subject, filters)
  const tiles = summaryTiles(payload ? payload.summary : null)
  const context = contextOf(filters)
  const contextEntries = Object.entries(context)
  // A column the pin makes constant is not drawn: under a house every row says
  // the house, so the width goes to the figures instead.
  const hide = pinnedColumns(filters)
  const sections = payload ? payload.sections.map((section) => ({ section, table: buildLiveReport(section, { hide }) })) : []
  const masked = payload ? payload.meta.masked_columns || [] : []
  const withheld = payload ? payload.meta.withheld_sections || [] : []

  // The library, under the same context — the pins have no box in its bar, so
  // only the context travels and the link says so by landing on R-11.
  const libraryHref = `/reporting/library?${new URLSearchParams(reportSearchParams('brandtype', context))}`

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }
  const exportTitle = `Insight — ${heading.title}${contextEntries.length ? ` · ${contextEntries.map(([k, v]) => `${CONTEXT_LABELS[k]} ${v}`).join(', ')}` : ''}`
  const drawn = sections.filter(({ table }) => !table.empty)
  const onExcel = () => {
    if (!drawn.length) { flash('Nothing to export yet.'); return }
    const csv = drawn
      .map(({ section, table }) => {
        const { head, rows } = exportRows(table)
        return `${sectionTitle(section.key)}\r\n${toCSV(head, rows)}`
      })
      .join('\r\n\r\n')
    downloadCSVFile(`atelier-insight-${subject.kind || 'all'}.csv`, `${exportTitle}\r\n\r\n${csv}`)
    flash('Insight exported to Excel (CSV).')
  }
  const onPDF = () => {
    if (!drawn.length) { flash('Nothing to export yet.'); return }
    const html = drawn.map(({ section, table }) => {
      const { head, rows } = exportRows(table)
      return htmlTable(sectionTitle(section.key), head, rows)
    }).join('')
    const ok = openPrintWindow(`Atelier — ${exportTitle}`, html)
    flash(ok ? 'Insight opened for PDF / print.' : 'Allow pop-ups to export the PDF.')
  }
  const exportBtn = (label, onClick) => (
    <button onClick={onClick} className="ab-t" style={{ height: 38, padding: '0 16px', whiteSpace: 'nowrap', background: c.paper, color: c.ink, border: `1px solid ${c.ink}`, borderRadius: 4, fontSize: 12.5, fontWeight: 500, fontFamily: font.ui, cursor: 'pointer' }}>{label}</button>
  )

  return (
    <section ref={anchor} style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${c.line}`, scrollMarginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrowStyle}>
            Insight · {heading.eyebrow}
            {' · '}
            <Link to={libraryHref} className="ab-link" style={{ color: 'inherit', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>Open in report library →</Link>
          </div>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 14, fontFamily: font.display, fontWeight: 500, fontSize: 28, letterSpacing: '-0.01em', color: c.ink }}>
            {heading.hex && <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 4, background: heading.hex, border: `1px solid ${c.line}` }} />}
            <span>{heading.title} <Em>insight</Em></span>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: c.muted, lineHeight: 1.5 }}>
            {heading.detail || 'Sales, stock, colours, clients and orders — every angle of one subject, live.'}
          </div>
        </div>
        {allowed && payload && <div style={{ display: 'flex', gap: 10 }}>{exportBtn('Export to Excel', onExcel)}{exportBtn('Export to PDF', onPDF)}</div>}
      </div>

      {!allowed && (
        <div style={{ marginTop: 24 }}>
          <LockedPanel reason={reportDenialReason('insight')} />
        </div>
      )}

      {allowed && (
        <>
          {/* Where this sits, and what window it is under. */}
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <Crumbs trail={trail} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {contextEntries.map(([key, value]) => (
                <StatusPill key={key} tone="muted">
                  {CONTEXT_LABELS[key]} · {key === 'category' ? categoryLabel(value) : value}
                </StatusPill>
              ))}
              {contextEntries.length > 0 && (
                <Link to={insightRoute(pinsOf(filters))} className="ab-link" style={{ fontSize: 12, color: c.accent, textDecoration: 'none' }}>Clear window</Link>
              )}
            </div>
          </div>

          {live.loading && <StatePanel eyebrow="Reading the platform">Composing every angle of this subject from the live data…</StatePanel>}
          {live.error && <StatePanel eyebrow="Could not load">{live.error}</StatePanel>}

          {payload && (
            <>
              {/* Said before it is read: which figures this login is not being shown. */}
              {(masked.length > 0 || withheld.length > 0) && (
                <div style={{ marginTop: 16, fontSize: 12, color: c.muted, lineHeight: 1.6 }}>
                  {masked.length > 0 && `${masked.join(' and ')} ${masked.length > 1 ? 'are' : 'is'} not shown on your access. `}
                  {withheld.length > 0 && `Withheld on your access: ${withheld.map(sectionTitle).join(', ')}.`}
                </div>
              )}

              <div style={{ marginTop: 22, border: `1px solid ${c.line}`, borderRadius: 4, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))' }}>
                {tiles.map((tile, i) => <Tile key={tile.label} tile={tile} first={i === 0} />)}
              </div>

              {sections.map(({ section, table }) => <Section key={section.key} section={section} table={table} />)}

              {sections.length === 0 && (
                <StatePanel eyebrow="Nothing to show">The platform composed no sections for this subject.</StatePanel>
              )}

              <div style={{ marginTop: 30, paddingTop: 16, borderTop: `1px solid ${c.line}`, display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', fontSize: 12, color: c.muted, lineHeight: 1.6 }}>
                <span style={{ maxWidth: 760, fontFamily: font.display, fontStyle: 'italic', fontSize: 13 }}>{COVERAGE_FOOTNOTE}</span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: font.mono, color: c.inkSoft }}>{sections.length}</span> sections · Live from the platform · Open a row to go deeper
                </span>
              </div>
            </>
          )}
        </>
      )}

      {toast && <Toast>{toast}</Toast>}
    </section>
  )
}
