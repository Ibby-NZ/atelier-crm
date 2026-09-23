// One house's supplier report on its own page — the sheet jette closes a
// shipment against, live. It used to render under a <select> on the chooser
// (/admin/reserves/report), with no address of its own; the client asked on
// 23 Sep 2026 for every kind of record to open on its own page, and a report
// that can be bookmarked and sent to a colleague is the point of that here.
//
//   GET /admin/reserves/report?supplier=     → { report }      the lines
//   GET /admin/reserves/report/export.csv?…  →   text/csv      the attachment
//
// READ AS CARDS, NOT A TABLE (23 Sep 2026, client asked: "untidy as a table
// menu style … more user friendly and responsive"). Twelve columns never fit:
// at 1280px every cell wrapped to three lines and the comment ran down the
// customer column. Each open line is now a card — the design, its colour and
// the quantity first (what the house has to find), then who it is for, then
// the house's reply (reserve #, hold date, CFA) — in a grid that reflows to one
// column on a phone. A summary strip counts what is still to chase, and a
// switch plus a filter box narrow the loaded lines. The CSV is unchanged: it is
// the sheet the HOUSE reads, and it keeps the office's column order.
//
// The :supplier segment is the house as the API knows it: the free-text
// snapshot on the line, exact match. React Router hands it back decoded, and
// reportPath / reportExportPath encode it again for the query — never the path
// segment passed through as-is, because a name with `&` in it would end the
// query value early.
//
// The API is the only authority on the rows: open lines (requested +
// confirmed) for ONE house, statuses, kinds and CFA spelled out, dates as
// 'YYYY-MM-DD' text, and `expired` decided server-side. The counting, filtering
// and formatting are in ./reserveFlow.js (tested) and none of it reads the
// browser clock. The CSV comes from the same server-side builder as the JSON,
// so the file sent to the house can never disagree with the cards read first —
// the download goes through apiDownload because the session is an HttpOnly
// cookie on another origin, and the disposition filename is not CORS-exposed,
// so the fallback name mirrors the API's own rule.
//
// There is no 404 here: the API answers a house with nothing open — or one it
// has never heard of — with an empty report, and "nothing open for X" is the
// true answer to both. "Could not reach the API" and "there are no rows" are
// opposite answers and get different panels — same rule the Report Library
// states.
//
// Read-only: a line is changed on its docket's page, never from the report.
// (The report rows carry no docket id, so a card cannot link to its docket
// until the API's report query selects `request_id`.)

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { apiGet, apiDownload } from '../lib/api.js'
import {
  ErrorLine,
  GhostButton,
  PanelNote,
  ToastLine,
  inputStyle,
  messageOf,
  mutedText,
  useToast,
} from '../admin/parts.jsx'
import {
  REPORT_KINDS,
  RESERVE_REPORT_ROUTE,
  awaitingReserveNumber,
  filterReportRows,
  groupReportRows,
  rangeWorthShowing,
  reportDateText,
  reportExportPath,
  reportFilename,
  reportPath,
  reportQuantity,
  reportSummary,
  statusTone,
} from './reserveFlow.js'

// The blob path rather than a link: src/lib/api.js is what carries the
// credentials, and a refusal comes back as JSON the office can read rather
// than as a saved file containing an error message.
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking in the same tick cancels the save in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function AdminReserveSupplierReport() {
  const { supplier = '' } = useParams()
  const { message: toast, flash } = useToast()
  const [report, setReport] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('')
  const [query, setQuery] = useState('')

  // Keyed on the PATH, a primitive — an effect keyed on an object literal
  // refetches forever — with the active flag every load effect here carries.
  const path = reportPath(supplier)
  useEffect(() => {
    let active = true
    setStatus('loading')
    setLoadError('')
    apiGet(path)
      .then((body) => {
        if (!active) return
        setReport(body.report)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setStatus('error')
        setLoadError(messageOf(err, 'Could not load the report.'))
      })
    return () => {
      active = false
    }
  }, [path])

  const download = async () => {
    setBusy(true)
    setDownloadError('')
    try {
      const { blob } = await apiDownload(reportExportPath(supplier))
      saveBlob(blob, reportFilename(supplier))
      flash('Report downloaded — ready to send to the house.')
    } catch (err) {
      setDownloadError(messageOf(err, 'That report could not be downloaded.'))
    } finally {
      setBusy(false)
    }
  }

  const backLink = (
    <>
      <Link to={RESERVE_REPORT_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to supplier report
      </Link>
      {' · live'}
    </>
  )

  const rows = report?.rows ?? []
  const summary = reportSummary(rows)
  const shown = filterReportRows(rows, { kind, q: query })
  const groups = groupReportRows(shown)
  const narrowed = Boolean(kind || query.trim())
  const clearFilters = () => {
    setKind('')
    setQuery('')
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={supplier || 'Supplier report'}
        subtitle="Everything still expected from this house — open reserves and cuttings with their references — ready to send when a shipment is being closed."
        right={
          // The file's name rides on the tooltip: printed under the button it
          // knocked the button off its edge once the header wrapped on a phone.
          <GhostButton tone="accent" disabled={busy || !supplier} onClick={download} title={`Saves as ${reportFilename(supplier)}`}>
            {busy ? 'Preparing…' : 'Download CSV'}
          </GhostButton>
        }
      />

      <div style={{ display: 'grid', gap: 22, marginTop: 26 }}>
        <ErrorLine>{downloadError}</ErrorLine>
        {status === 'loading' && <PanelNote>Loading the report…</PanelNote>}
        {status === 'error' && <PanelNote tone="danger">{loadError}</PanelNote>}

        {status === 'ready' && report && rows.length === 0 && (
          <PanelNote>
            Nothing open for {report.supplier} — every line has arrived, been dispatched or been
            cancelled.
          </PanelNote>
        )}

        {status === 'ready' && report && rows.length > 0 && (
          <>
            <SummaryStrip summary={summary} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div role="group" aria-label="Show lines" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <KindButton active={kind === ''} onClick={() => setKind('')} label="All" count={summary.total} />
                {REPORT_KINDS.map(({ key, label }) => (
                  <KindButton
                    key={key}
                    active={kind === key}
                    onClick={() => setKind(key)}
                    label={label}
                    count={key === 'Reserve' ? summary.reserves : summary.cuttings}
                  />
                ))}
              </div>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by customer, design, colour or reference"
                aria-label="Filter lines"
                style={{ ...inputStyle, height: 40, width: 'min(100%, 360px)' }}
              />
            </div>

            {shown.length === 0 && (
              <PanelNote>
                No line matches that filter.{' '}
                <button type="button" className="ab-link" onClick={clearFilters}
                  style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: c.accentDeep }}>
                  Show every line
                </button>
              </PanelNote>
            )}

            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`report-${group.key}`} style={{ display: 'grid', gap: 12 }}>
                <h2 id={`report-${group.key}`} style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.ink }}>
                  {group.label}
                  <span style={{ marginLeft: 8, fontWeight: 400, color: c.muted }}>
                    {group.rows.length}
                    {narrowed ? ' shown' : ''}
                  </span>
                </h2>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
                  {group.rows.map((row, index) => (
                    <LineCard key={`${group.key}-${index}`} row={row} supplier={report.supplier} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// What is still to chase, at a glance. The two figures that need someone to
// act — a house that has not yet sent a reserve number, and a hold date that
// has passed — turn clay when they are not zero.
function SummaryStrip({ summary }) {
  const tiles = [
    { label: 'Open lines', value: summary.total },
    { label: 'Reserves', value: summary.reserves },
    { label: 'Cuttings', value: summary.cuttings },
    { label: 'Awaiting reserve #', value: summary.awaitingNumber, warn: summary.awaitingNumber > 0 },
    { label: 'Hold date passed', value: summary.passed, warn: summary.passed > 0 },
  ]
  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {tiles.map((tile) => (
        <div key={tile.label} style={{ background: c.panel, padding: '14px 18px 16px', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.inkSoft }}>{tile.label}</div>
          <div style={{ marginTop: 8, fontFamily: font.display, fontSize: 28, lineHeight: 1, color: tile.warn ? c.clay : c.ink }}>
            {tile.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function KindButton({ active, onClick, label, count }) {
  return (
    <GhostButton tone={active ? 'accent' : undefined} aria-pressed={active} onClick={onClick}>
      {`${label} · ${count}`}
    </GhostButton>
  )
}

// One open line. Design, colour and quantity lead — that is what the house has
// to find on its shelves — then who it is for, then the house's own reply.
function LineCard({ row, supplier }) {
  const tone = statusTone(String(row.status ?? '').toLowerCase())
  const awaiting = awaitingReserveNumber(row)
  const reserveNumber = String(row.reserve_number ?? '').trim()
  return (
    <article style={{ background: c.panel, padding: '18px 20px 20px', display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3, color: c.ink, overflowWrap: 'anywhere' }}>
            {row.product_name || 'Unnamed design'}
          </h3>
          <div style={{ marginTop: 4, fontSize: 13.5, color: c.inkSoft, overflowWrap: 'anywhere' }}>
            {row.colour || 'No colour given'}
            {row.product_code && (
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}> · {row.product_code}</span>
            )}
          </div>
        </div>
        <div style={{ flex: 'none', textAlign: 'right' }}>
          <div style={{ fontFamily: font.display, fontSize: 26, lineHeight: 1, color: c.ink }}>{reportQuantity(row)}</div>
          <div style={{ marginTop: 5, fontSize: 12, color: c.muted }}>{row.kind === 'Cutting' ? 'to cut' : 'to hold'}</div>
        </div>
      </header>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 12, borderTop: `1px solid ${c.line}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>{row.account_name || '—'}</div>
          {row.contact_name && <div style={{ ...mutedText, marginTop: 2 }}>attn {row.contact_name}</div>}
        </div>
        <StatusPill tone={tone === 'accent' ? 'sage' : tone}>{row.status}</StatusPill>
      </div>

      <dl style={{ margin: 0, display: 'grid', gap: '12px 16px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <Detail label="Customer ref">{row.customer_reference || '—'}</Detail>
        <Detail label="Reserve #" mono={!awaiting} tone={awaiting ? c.clay : undefined}>
          {awaiting ? 'TBA' : reserveNumber}
        </Detail>
        <Detail label="Hold until" tone={row.expired === true ? c.clay : undefined}>
          {row.reserved_until ? reportDateText(row.reserved_until) : '—'}
          {row.expired === true && ' · passed'}
        </Detail>
        <Detail label="CFA">{row.cfa || '—'}</Detail>
        <Detail label="Owner">{row.owner_name || '—'}</Detail>
        <Detail label="Requested">{row.requested_on ? reportDateText(row.requested_on) : '—'}</Detail>
        {rangeWorthShowing(row, supplier) && <Detail label="Range">{row.range_name}</Detail>}
      </dl>

      {row.comment && (
        <p style={{ margin: 0, padding: '10px 12px', background: c.panelHead, fontSize: 13, lineHeight: 1.5, color: c.inkSoft, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {row.comment}
        </p>
      )}
    </article>
  )
}

function Detail({ label, children, mono = false, tone }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: 12, fontWeight: 600, color: c.muted }}>{label}</dt>
      <dd style={{ margin: '3px 0 0', fontSize: 13.5, color: tone ?? c.ink, fontFamily: mono ? font.mono : undefined, overflowWrap: 'anywhere' }}>
        {children}
      </dd>
    </div>
  )
}
