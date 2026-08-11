import { useEffect, useState, useCallback } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill, SecondaryButton } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import LegacyImportPanel from '../components/LegacyImportPanel.jsx'
import Pagination from '../admin/Pagination.jsx'
import { GhostButton } from '../admin/parts.jsx'
import { pageCount } from '../admin/list.js'
import { apiFetch, ApiError } from '../lib/api.js'
import DynamicsCorrection from '../components/DynamicsCorrection.jsx'

// Stock — the real Atelier stock ledger, read live from atelier-api's Dynamics-365
// staging window (GET /admin/legacy/stock). Searchable + paginated because there
// are ~7,600 stock rows.
//
// The staging rows themselves stay read-only — Atelier still runs on D365 and the
// import re-runs until cutover, upserting every mapped column, so an edit written
// onto a `legacy_*` row would vanish at the next import with no error. Corrections
// are stored BESIDE the row (`d365_overrides`) and the merged read applies them,
// which is what <DynamicsCorrection> writes. `reserve_note` is the field staff
// most want to correct, so the panel opens INLINE from a row here rather than
// behind a new detail route.
//
// The row badge can only say "Corrected": the list read carries
// `overridden_fields`/`custom_fields`, but `override.stale_fields` — a correction
// Dynamics has since moved underneath — comes from the DETAIL read only, so the
// panel is where the work queue is shown.

const COLS = '1fr 1.8fr 1.2fr 0.7fr 0.7fr 0.9fr 0.9fr 100px'
const LIMIT = 25
const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
const hNum = { ...hCell, textAlign: 'right' }
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const numCell = { fontFamily: font.mono, fontSize: 12, color: c.inkSoft, whiteSpace: 'nowrap', textAlign: 'right' }

// Money: $X,XXX.XX in the sibling's toLocaleString style; null/absent → em dash.
const money = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Both halves count: a record can carry a custom field and no column override.
const corrected = (it) =>
  (it.overridden_fields?.length ?? 0) > 0 || Object.keys(it.custom_fields ?? {}).length > 0

export default function Reserves() {
  const [term, setTerm] = useState('') // committed search term
  const [draft, setDraft] = useState('') // input value
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false) // import panel open?
  const [openGuid, setOpenGuid] = useState(null) // row with the correction panel open

  // `quiet` skips the loading state: the rows only render under status === 'ready',
  // so a post-save reload would otherwise blank the table and unmount the open
  // panel mid-flow (useAdminList's reload avoids this the same way).
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus('loading')
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (term.trim()) params.set('q', term.trim())
    try {
      const body = await apiFetch(`/admin/legacy/stock?${params.toString()}`)
      setData({ items: body.items ?? [], total: body.meta?.total ?? 0 })
      setStatus('ready')
    } catch (err) {
      // Same rule as the price-list mirror: a quiet reload follows a save, so the
      // rows on screen are still true. Blanking them into the error branch would
      // unmount the open panel, and swallowing the failure would let useMutation
      // flash "Correction saved." over a broken table. Rethrow and leave them be.
      if (quiet) throw err
      setError(err instanceof ApiError ? err.message : 'Could not load stock.')
      setStatus('error')
    }
  }, [term, page])

  useEffect(() => { load() }, [load])

  // A reload replaces `items` wholesale, so close the panel if its row is gone
  // (searched away, paged past, or suppressed).
  useEffect(() => {
    if (openGuid && !data.items.some((it) => it.guid === openGuid)) setOpenGuid(null)
  }, [data.items, openGuid])

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
          <div style={hCell} />
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
          <div key={it.guid}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}>
              <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5, color: c.ink }}>{it.item_code || '—'}</span>
              <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {it.name || '—'}
                {corrected(it) && <span style={{ marginLeft: 8, fontFamily: font.ui, fontSize: 10, color: c.accent }}>Corrected</span>}
              </span>
              <span style={cell}>{it.supplier || '—'}</span>
              <span style={numCell}>{it.stock_on_hand ?? '—'}</span>
              <span style={numCell}>{it.stock_available ?? '—'}</span>
              <span style={{ ...numCell, color: c.ink }}>{money(it.trade_price)}</span>
              <span style={{ ...numCell, color: c.ink }}>{money(it.retail_price)}</span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <GhostButton
                  tone={openGuid === it.guid ? 'accent' : 'ink'}
                  onClick={() => setOpenGuid((open) => (open === it.guid ? null : it.guid))}
                >
                  {openGuid === it.guid ? 'Close' : 'Correct'}
                </GhostButton>
              </span>
            </div>
            {openGuid === it.guid && (
              <div style={{ padding: '20px 20px 24px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                {/* The panel fetches the DETAIL read itself — stale_fields, base and
                    the full custom-field map are not on a list row — and reloads this
                    list after a save, since the server computes overridden_fields. */}
                <DynamicsCorrection
                  entity="stock"
                  guid={it.guid}
                  onSaved={() => load({ quiet: true })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: c.muted }}>
          {data.total} item{data.total === 1 ? '' : 's'} · <AttributePill style={{ fontSize: 9.5, padding: '2px 7px' }}>mirrored from Dynamics · correctable</AttributePill>
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
