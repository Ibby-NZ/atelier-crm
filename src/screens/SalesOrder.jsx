import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill } from '../components/ui.jsx'
import { apiFetch, ApiError } from '../lib/api.js'

// Sales Order detail — one real Atelier sales order, read live from atelier-api's
// Dynamics-365 staging window (GET /admin/legacy/sales-orders/:guid). Read-only by
// design: Atelier still runs on D365, so this mirrors the record rather than editing
// it (see the API's src/legacy/legacy-read.js).
//
// IMPORTANT: this legacy export is HEADER-ONLY — there are no line items (no SKU / qty
// / unit price) in the source, so we deliberately render no line-items table.

// format a dollar amount (e.g. 11715.4) → "$11,715.40"; null/blank → "—"
function money(n) {
  return n == null
    ? '—'
    : '$' + Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// YYYY-MM-DD from an ISO/date string; null/blank → '' (defensive against Date objects)
function ymd(x) {
  return x == null || x === '' ? '' : String(x).slice(0, 10)
}

// stringify a raw D365 cell for display; objects → JSON, null/blank → "—"
function rawValue(v) {
  if (v == null || v === '') return '—'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

const label = { fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }

export default function SalesOrder() {
  const { id } = useParams()
  const [record, setRecord] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | error
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setStatus('loading')
    apiFetch(`/admin/legacy/sales-orders/${encodeURIComponent(id)}`)
      .then((body) => {
        if (!live) return
        setRecord(body?.record ?? null)
        setStatus('ready')
      })
      .catch((err) => {
        if (!live) return
        if (err instanceof ApiError && err.status === 404) {
          setStatus('notfound')
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not load this sales order.')
          setStatus('error')
        }
      })
    return () => { live = false }
  }, [id])

  const back = (
    <Link to="/sales-orders" className="ab-t" style={{ fontSize: 12.5, color: c.accent, textDecoration: 'none' }}>← Back to sales orders</Link>
  )

  if (status === 'loading') {
    return (
      <>
        {back}
        <div style={{ marginTop: 40, fontSize: 13, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading sales order…</div>
      </>
    )
  }

  if (status === 'notfound' || (status === 'ready' && !record)) {
    return (
      <>
        {back}
        <div style={{ maxWidth: 560, margin: '40px auto 0', border: `1px solid ${c.line}`, borderRadius: 8, background: c.surface, padding: '40px 36px', textAlign: 'center' }}>
          <div style={{ fontFamily: font.display, fontSize: 24, color: c.ink }}>Sales order not found</div>
          <div style={{ marginTop: 12, fontSize: 13.5, color: c.muted, lineHeight: 1.6 }}>
            No sales order matches this reference in the Dynamics export — it may have been removed, or the link is out of date.
          </div>
          <Link to="/sales-orders" className="ab-t" style={{ display: 'inline-block', marginTop: 22, fontSize: 13, color: c.accent, textDecoration: 'none', borderBottom: `1px solid ${c.accent}`, paddingBottom: 2 }}>Back to sales orders →</Link>
        </div>
      </>
    )
  }

  if (status === 'error') {
    return (
      <>
        {back}
        <div role="alert" style={{ marginTop: 40, maxWidth: 560, marginInline: 'auto', border: `1px solid ${c.line}`, borderRadius: 8, background: c.surface, padding: '32px 30px', textAlign: 'center' }}>
          <div style={{ fontFamily: font.display, fontSize: 20, color: c.ink }}>Could not load this sales order</div>
          <div style={{ marginTop: 10, fontSize: 13, color: c.clay, lineHeight: 1.6 }}>{error}</div>
        </div>
      </>
    )
  }

  // ready + record
  const detailRows = [
    ['Customer', record.customer],
    ['Reference', record.reference],
    ['Order date', ymd(record.order_date)],
    ['Expected delivery', ymd(record.expected_delivery_date)],
    ['Owner', record.owner],
    ['Contact', record.contact],
    ['Deliver to', record.deliver_to],
    ['Pricing type', record.pricing_type],
    ['Status', record.status_reason],
  ].filter(([, v]) => v != null && String(v).trim() !== '')

  const rawEntries = Object.entries(record.raw || {})

  return (
    <>
      {back}

      <div style={{ marginTop: 14 }}>
        <PageHeader
          eyebrow="Sales Order · from Dynamics"
          title={record.number || '—'}
          right={<AttributePill style={{ fontSize: 10.5, letterSpacing: '0.04em' }}>read-only from Dynamics</AttributePill>}
        />
      </div>

      {/* Totals panel */}
      <div style={{ marginTop: 26, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '22px 24px' }}>
        <div style={{ ...label, marginBottom: 16 }}>Order totals</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '18px 24px' }}>
          <Stat title="Total ex GST" value={money(record.total_ex_gst)} />
          <Stat title="GST" value={money(record.gst)} />
          <Stat title="Total incl GST" value={money(record.total_incl_gst)} hero />
          <Stat title="Currency" value={record.currency || '—'} />
          <Stat
            title="Discount"
            value={record.sales_order_discount_pct == null ? '—' : `${record.sales_order_discount_pct}%`}
          />
        </div>
      </div>

      {/* Header detail — definition list */}
      {detailRows.length > 0 && (
        <div style={{ marginTop: 20, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
          {detailRows.map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px minmax(0,1fr)',
                gap: 16,
                alignItems: 'baseline',
                padding: '13px 20px',
                borderTop: i === 0 ? 'none' : `1px solid ${c.line}`,
              }}
            >
              <div style={label}>{k}</div>
              <div style={{ fontSize: 13.5, color: c.ink, lineHeight: 1.5, wordBreak: 'break-word' }}>{String(v)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Header-only export note (no line items in the source) */}
      <div style={{ marginTop: 18, fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
        Line items are not in this export (header only).
      </div>

      {/* All Dynamics fields — collapsible raw dump */}
      {rawEntries.length > 0 && (
        <details style={{ marginTop: 24, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface }}>
          <summary style={{ ...label, cursor: 'pointer', padding: '14px 20px', userSelect: 'none' }}>
            All Dynamics fields ({rawEntries.length})
          </summary>
          <div style={{ maxHeight: 420, overflow: 'auto', borderTop: `1px solid ${c.line}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <tbody>
                {rawEntries.map(([k, v], i) => (
                  <tr key={k} style={{ borderTop: i === 0 ? 'none' : `1px solid ${c.line}` }}>
                    <td style={{ width: '38%', padding: '9px 20px', verticalAlign: 'top', fontSize: 11.5, color: c.muted, wordBreak: 'break-word' }}>{k}</td>
                    <td style={{ padding: '9px 20px', verticalAlign: 'top', fontFamily: font.mono, fontSize: 11.5, color: c.inkSoft, wordBreak: 'break-word' }}>{rawValue(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Import provenance */}
      {(record.imported_at || record.source_file) && (
        <div style={{ marginTop: 20, fontSize: 11, color: c.muted, fontFamily: font.mono }}>
          Imported {record.imported_at || '—'} from {record.source_file || '—'}
        </div>
      )}
    </>
  )
}

// Stat — one labelled figure in the totals panel. The incl-GST total is the single key figure.
function Stat({ title, value, hero = false }) {
  return (
    <div>
      <div style={label}>{title}</div>
      <div
        style={{
          marginTop: 6,
          fontFamily: hero ? font.display : font.mono,
          fontWeight: hero ? 500 : 400,
          fontSize: hero ? 26 : 15,
          letterSpacing: hero ? '-0.01em' : 0,
          color: hero ? c.accent : c.ink,
        }}
      >
        {value}
      </div>
    </div>
  )
}
