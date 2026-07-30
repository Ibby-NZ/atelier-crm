import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, ApiError } from '../lib/api.js'

// Sales Orders — the real Atelier order book, read live from atelier-api's
// Dynamics-365 staging window (GET /admin/legacy/sales-orders). Read-only by
// design: Atelier still runs on D365, so this mirrors it rather than editing it
// (see the API's src/legacy/legacy-read.js). Searchable + paginated for
// consistency with Clients, though there are only ~48 orders.

const COLS = '150px 1.6fr 1fr 1.1fr 0.9fr 1.1fr 0.9fr'
const LIMIT = 25
const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

// money in dollars → NZ-formatted currency; null/undefined → em dash
const money = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// order_date is an ISO datetime string — show just the date part
const dateOnly = (d) => d ? String(d).slice(0, 10) : '—'

export default function SalesOrdersList() {
  const [term, setTerm] = useState('') // committed search term
  const [draft, setDraft] = useState('') // input value
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setStatus('loading')
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (term.trim()) params.set('q', term.trim())
    try {
      const body = await apiFetch(`/admin/legacy/sales-orders?${params.toString()}`)
      setData({ items: body.items ?? [], total: body.meta?.total ?? 0 })
      setStatus('ready')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load sales orders.')
      setStatus('error')
    }
  }, [term, page])

  useEffect(() => { load() }, [load])

  const submitSearch = (e) => {
    e.preventDefault()
    setPage(1)
    setTerm(draft)
  }

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT))

  return (
    <>
      <PageHeader
        eyebrow="Sales Orders · from Dynamics"
        title="Orders"
        right={
          <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search order #, customer, reference"
              style={{ height: 38, width: 300, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 3, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 13, outline: 'none' }}
            />
            <button type="submit" className="ab-t" style={{ height: 38, padding: '0 16px', border: `1px solid ${c.line}`, borderRadius: 3, background: c.surface, color: c.ink, fontFamily: font.ui, fontSize: 13, cursor: 'pointer' }}>Search</button>
          </form>
        }
      />
      <SectionTabs tabs={ordersTabs} active="sales" />

      <div style={{ marginTop: 24, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '12px 20px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
          <div style={hCell}>Number</div>
          <div style={hCell}>Customer</div>
          <div style={hCell}>Order date</div>
          <div style={hCell}>Owner</div>
          <div style={hCell}>Type</div>
          <div style={hCell}>Status</div>
          <div style={{ ...hCell, textAlign: 'right' }}>Total</div>
        </div>

        {status === 'loading' && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading sales orders…</div>
        )}
        {status === 'error' && (
          <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{error}</div>
        )}
        {status === 'ready' && data.items.length === 0 && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No sales orders match “{term}”.</div>
        )}

        {status === 'ready' && data.items.map((o) => (
          <Link key={o.guid} to={`/sales-orders/${o.guid}`} className="ab-rowhover ab-t" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}`, textDecoration: 'none' }}>
            <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.number || '—'}</span>
            <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer || '—'}</span>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{dateOnly(o.order_date)}</span>
            <span style={cell}>{o.owner || '—'}</span>
            <span style={cell}>{o.pricing_type || '—'}</span>
            <span style={cell}>{o.status_reason || '—'}</span>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{money(o.total_incl_gst)}</span>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: c.muted }}>
          {data.total} order{data.total === 1 ? '' : 's'} · <AttributePill style={{ fontSize: 9.5, padding: '2px 7px' }}>read-only from Dynamics</AttributePill>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="ab-t" style={{ height: 32, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 3, background: c.surface, color: page <= 1 ? c.muted : c.ink, fontSize: 12, cursor: page <= 1 ? 'default' : 'pointer' }}>Previous</button>
          <span style={{ fontSize: 12, color: c.muted, fontFamily: font.mono }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="ab-t" style={{ height: 32, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 3, background: c.surface, color: page >= totalPages ? c.muted : c.ink, fontSize: 12, cursor: page >= totalPages ? 'default' : 'pointer' }}>Next</button>
        </span>
      </div>
    </>
  )
}
