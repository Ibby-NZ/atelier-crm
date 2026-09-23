// One house's supplier report on its own page — the sheet jette closes a
// shipment against, live. It used to render under a <select> on the chooser
// (/admin/reserves/report), with no address of its own; the client asked on
// 23 Sep 2026 for every kind of record to open on its own page, and a report
// that can be bookmarked and sent to a colleague is the point of that here.
//
//   GET /admin/reserves/report?supplier=     → { report }      the table
//   GET /admin/reserves/report/export.csv?…  →   text/csv      the attachment
//
// The :supplier segment is the house as the API knows it: the free-text
// snapshot on the line, exact match. React Router hands it back decoded, and
// reportPath / reportExportPath encode it again for the query — never the path
// segment passed through as-is, because a name with `&` in it would end the
// query value early.
//
// The API is the only authority on the rows: open lines (requested +
// confirmed) for ONE house, statuses and CFA spelled out, dates as
// 'YYYY-MM-DD' text. The CSV comes from the same server-side builder as the
// JSON table, so the file sent to the house can never disagree with the table
// read first — the download goes through apiDownload because the session is an
// HttpOnly cookie on another origin, and the disposition filename is not
// CORS-exposed, so the fallback name mirrors the API's own rule.
//
// There is no 404 here: the API answers a house with nothing open — or one it
// has never heard of — with an empty report, and "nothing open for X" is the
// true answer to both. "Could not reach the API" and "there are no rows" are
// opposite answers and get different panels — same rule the Report Library
// states.
//
// Read-only: a line is changed on its docket's page, never from the report.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { apiGet, apiDownload } from '../lib/api.js'
import {
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  messageOf,
  monoText,
  mutedText,
  panel,
  useToast,
} from '../admin/parts.jsx'
import {
  RESERVE_REPORT_ROUTE,
  reportExportPath,
  reportFilename,
  reportPath,
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

const REPORT_COLS = '0.6fr 0.9fr 1.3fr 1fr 1.2fr 0.7fr 0.9fr 0.7fr 0.9fr 1fr 0.9fr 0.8fr'
const REPORT_LABELS = [
  'Type',
  'Range',
  'Customer',
  'Contact',
  'Product · code',
  'Colour',
  'Qty',
  'Cust ref',
  'Reserve #',
  'Until · CFA',
  'Status',
  'Owner',
]

export default function AdminReserveSupplierReport() {
  const { supplier = '' } = useParams()
  const { message: toast, flash } = useToast()
  const [report, setReport] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [busy, setBusy] = useState(false)

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

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={supplier || 'Supplier report'}
        subtitle="Everything still expected from this house — open reserves and cuttings with their references — ready to send when a shipment is being closed."
        right={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={monoText}>{reportFilename(supplier)}</span>
            <GhostButton tone="accent" disabled={busy || !supplier} onClick={download}>
              {busy ? 'Preparing…' : 'Download CSV'}
            </GhostButton>
          </div>
        }
      />

      <div style={{ display: 'grid', gap: 18, marginTop: 30 }}>
        <ErrorLine>{downloadError}</ErrorLine>
        {status === 'loading' && <PanelNote>Loading the report…</PanelNote>}
        {status === 'error' && <PanelNote tone="danger">{loadError}</PanelNote>}

        {status === 'ready' && report && report.rows.length === 0 && (
          <PanelNote>
            Nothing open for {report.supplier} — every line has arrived, been dispatched or been
            cancelled.
          </PanelNote>
        )}

        {status === 'ready' && report && report.rows.length > 0 && (
          <section style={panel}>
            <PanelHead
              label={`${report.supplier} — ${report.total} open line${report.total === 1 ? '' : 's'}`}
            />
            <div style={{ padding: '6px 20px 16px', overflowX: 'auto' }}>
              <HeaderRow columns={REPORT_COLS} labels={REPORT_LABELS} numeric={[6]} />
              {report.rows.map((row, index) => (
                <Row key={index} columns={REPORT_COLS}>
                  <span style={{ fontSize: 12, color: c.muted }}>{row.kind}</span>
                  <span style={{ fontSize: 12 }}>{row.range_name ?? '—'}</span>
                  <span style={{ fontSize: 12.5 }}>
                    {row.account_name}
                    {row.comment && (
                      <span style={{ ...mutedText, display: 'block', fontSize: 11 }}>“{row.comment}”</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12 }}>{row.contact_name ?? '—'}</span>
                  <span style={{ fontSize: 12.5 }}>
                    {row.product_name}
                    <span style={{ ...monoText, display: 'block', fontSize: 11 }}>{row.product_code ?? ''}</span>
                  </span>
                  <span style={{ fontSize: 12 }}>{row.colour ?? '—'}</span>
                  <span style={{ ...monoText, textAlign: 'right' }}>
                    {row.qty ?? ''}
                    {row.multiplier > 1 ? ` × ${row.multiplier}` : ''}
                    {row.qty == null && row.multiplier <= 1 ? '—' : ''}
                  </span>
                  <span style={{ fontSize: 12 }}>{row.customer_reference ?? '—'}</span>
                  <span style={monoText}>{row.reserve_number ?? 'TBA'}</span>
                  <span style={{ fontSize: 12 }}>
                    {row.reserved_until ?? '—'}
                    {row.expired === true && (
                      <span style={{ color: c.clay, fontWeight: 600 }}> · passed</span>
                    )}
                    {row.cfa && (
                      <span style={{ ...mutedText, display: 'block', fontSize: 11 }}>CFA {row.cfa}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12 }}>{row.status}</span>
                  <span style={{ fontSize: 12 }}>{row.owner_name ?? '—'}</span>
                </Row>
              ))}
            </div>
          </section>
        )}
      </div>

      <ToastLine message={toast} />
    </div>
  )
}
