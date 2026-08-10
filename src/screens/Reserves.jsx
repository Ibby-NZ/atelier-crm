import { useEffect, useState, useCallback } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill, SecondaryButton } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import LegacyImportPanel from '../components/LegacyImportPanel.jsx'
import Pagination from '../admin/Pagination.jsx'
import { pageCount } from '../admin/list.js'
import { apiFetch, ApiError } from '../lib/api.js'

// Stock — the real Atelier stock ledger, read live from atelier-api's Dynamics-365
// staging window (GET /admin/legacy/stock). Read-only by design: Atelier still runs
// on D365, so this mirrors it rather than editing it (see the API's src/legacy/legacy-read.js).
// Searchable + paginated because there are ~7,600 stock rows.

const COLS = '1fr 1.8fr 1.2fr 0.7fr 0.7fr 0.9fr 0.9fr'
const LIMIT = 25
const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
const hNum = { ...hCell, textAlign: 'right' }
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const numCell = { fontFamily: font.mono, fontSize: 12, color: c.inkSoft, whiteSpace: 'nowrap', textAlign: 'right' }

// Money: $X,XXX.XX in the sibling's toLocaleString style; null/absent → em dash.
const money = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Reserves() {
  const [term, setTerm] = useState('') // committed search term
  const [draft, setDraft] = useState('') // input value
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false) // import panel open?

  const load = useCallback(async () => {
    setStatus('loading')
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (term.trim()) params.set('q', term.trim())
    try {
      const body = await apiFetch(`/admin/legacy/stock?${params.toString()}`)
      setData({ items: body.items ?? [], total: body.meta?.total ?? 0 })
      setStatus('ready')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load stock.')
      setStatus('error')
    }
  }, [term, page])

  useEffect(() => { load() }, [load])

  const submitSearch = (e) => {
    e.preventDefault()
    setPage(1)
    setTerm(draft)
  }

  const totalPages = pageCount(data.total, LIMIT)

  return (
    <>
      <PageHeader
        eyebrow="Stock · from Dynamics"
        title="Stock"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Search item code, name, supplier, range"
                style={{ height: 38, width: 300, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 13, outline: 'none' }}
              />
              <button type="submit" className="ab-t" style={{ height: 38, padding: '0 16px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, color: c.ink, fontFamily: font.ui, fontSize: 13, cursor: 'pointer' }}>Search</button>
            </form>
            <SecondaryButton size="sm" onClick={() => setImporting((open) => !open)}>
              {importing ? 'Close import' : 'Import'}
            </SecondaryButton>
          </div>
        }
      />
      <SectionTabs tabs={stockTabs} active="reserves" />

      {/* Renders nothing for non-Directors — the API refuses them anyway. */}
      {importing && (
        <LegacyImportPanel
          entity="stock_items"
          title="Import stock from Dynamics"
          fileHint="stock_items.json.gz"
          onImported={load}
        />
      )}

      <div style={{ marginTop: 24, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '12px 20px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
          <div style={hCell}>Item code</div>
          <div style={hCell}>Name</div>
          <div style={hCell}>Supplier</div>
          <div style={hNum}>On hand</div>
          <div style={hNum}>Available</div>
          <div style={hNum}>Trade price</div>
          <div style={hNum}>Retail price</div>
        </div>

        {status === 'loading' && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading stock…</div>
        )}
        {status === 'error' && (
          <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{error}</div>
        )}
        {status === 'ready' && data.items.length === 0 && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No stock matches “{term}”.</div>
        )}

        {status === 'ready' && data.items.map((it) => (
          <div key={it.guid} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5, color: c.ink }}>{it.item_code || '—'}</span>
            <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name || '—'}</span>
            <span style={cell}>{it.supplier || '—'}</span>
            <span style={numCell}>{it.stock_on_hand ?? '—'}</span>
            <span style={numCell}>{it.stock_available ?? '—'}</span>
            <span style={{ ...numCell, color: c.ink }}>{money(it.trade_price)}</span>
            <span style={{ ...numCell, color: c.ink }}>{money(it.retail_price)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: c.muted }}>
          {data.total} item{data.total === 1 ? '' : 's'} · <AttributePill style={{ fontSize: 9.5, padding: '2px 7px' }}>read-only from Dynamics</AttributePill>
        </span>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={data.total}
          unit="items"
          onPage={setPage}
        />
      </div>
    </>
  )
}
