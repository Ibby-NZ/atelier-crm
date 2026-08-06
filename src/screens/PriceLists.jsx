import { useEffect, useState, useCallback } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill, SecondaryButton } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import LegacyImportPanel from '../components/LegacyImportPanel.jsx'
import Pagination from '../admin/Pagination.jsx'
import { pageCount } from '../admin/list.js'
import { apiFetch, ApiError } from '../lib/api.js'

// Price Lists — the real supplier price-list corpus, read live from atelier-api's
// Dynamics-365 staging window (GET /admin/legacy/prices). Read-only by design:
// Atelier still runs on D365, so this mirrors it rather than editing it (see the
// API's src/legacy/legacy-read.js). Searchable + paginated because there are
// ~19,300 price rows. Wholesale stays in the supplier's own currency; the NZ
// columns are the landed/trade/retail figures already resolved to NZD.

const COLS = '0.9fr 1.9fr 1.2fr 1fr 0.9fr 0.9fr'
const LIMIT = 25
const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

// NZ money columns are dollars → '$X,XXX.XX'; null/absent → '—'.
const money = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Wholesale is the raw rate in the supplier's currency, NOT NZD — show the code.
const wholesale = (i) => String(i.wholesale_rate ?? '—') + (i.currency ? ' ' + i.currency : '')

export default function PriceLists() {
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
      const body = await apiFetch(`/admin/legacy/prices?${params.toString()}`)
      setData({ items: body.items ?? [], total: body.meta?.total ?? 0 })
      setStatus('ready')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load price lists.')
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
        eyebrow="Price Lists · from Dynamics"
        title="Price Lists"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Search code, description, range"
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
      <SectionTabs tabs={priceListTabs} active="lists" />

      {/* Renders nothing for non-Directors — the API refuses them anyway. */}
      {importing && (
        <LegacyImportPanel
          entity="product_prices"
          title="Import price lists from Dynamics"
          fileHint="product_prices.json.gz"
          onImported={load}
        />
      )}

      <div style={{ marginTop: 24, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '12px 20px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
          <div style={hCell}>Code</div>
          <div style={hCell}>Description</div>
          <div style={hCell}>Range</div>
          <div style={hCell}>Wholesale</div>
          <div style={hCell}>Trade NZ</div>
          <div style={hCell}>Retail NZ</div>
        </div>

        {status === 'loading' && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading price lines…</div>
        )}
        {status === 'error' && (
          <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{error}</div>
        )}
        {status === 'ready' && data.items.length === 0 && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No price lines match “{term}”.</div>
        )}

        {status === 'ready' && data.items.map((i) => (
          <div key={i.guid} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5, color: c.ink }}>{i.code || '—'}</span>
            <span style={{ ...cell, color: c.ink }}>{i.description || '—'}</span>
            <span style={cell}>{i.range_name || '—'}</span>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{wholesale(i)}</span>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{money(i.trade_sell_price_nz)}</span>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{money(i.retail_sell_price_nz)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: c.muted }}>
          {data.total} price line{data.total === 1 ? '' : 's'} · <AttributePill style={{ fontSize: 9.5, padding: '2px 7px' }}>read-only from Dynamics</AttributePill>
        </span>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={data.total}
          unit="price lines"
          onPage={setPage}
        />
      </div>
    </>
  )
}
