import { useEffect, useState, useCallback } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill, SecondaryButton } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import LegacyImportPanel from '../components/LegacyImportPanel.jsx'
import DynamicsCorrection from '../components/DynamicsCorrection.jsx'
import Pagination from '../admin/Pagination.jsx'
import { GhostButton } from '../admin/parts.jsx'
import { pageCount } from '../admin/list.js'
import { apiFetch, ApiError, safeFetch } from '../lib/api.js'
import {
  DASH,
  fxText,
  indexByRange,
  markupText,
  parameterFor,
  rangeDiscountText,
  rangeMarkupText,
} from './priceLists.js'
import { PARAMETERS_PATH } from './pricingParameters.js'

// Price Lists — the real supplier price-list corpus, read live from atelier-api's
// Dynamics-365 staging window (GET /admin/legacy/prices). Searchable + paginated
// because there are ~19,300 price rows. Wholesale stays in the supplier's own
// currency; the NZ columns are the landed/trade/retail figures already resolved
// to NZD.
//
// The Dynamics rows themselves are still read-only — Atelier runs live on D365
// and the import re-runs until cutover — but a CORRECTION stored beside a row
// survives every re-import, and `Correct` opens that panel inline on the row
// (there is no /price-lists/:guid detail route to send anyone to). Six of this
// entity's fifteen editable columns are commercial, so most of the panel is
// drawn read-only for a login without can_view_finance; the API answers 403
// either way. All the rules live in ../components/DynamicsCorrection.jsx and
// ./dynamicsCorrections.js.
//
// NOTE the two entity vocabularies now sitting in one file: the correction panel
// takes the READ name (`prices`) and LegacyImportPanel the IMPORT one
// (`product_prices`). They are not interchangeable.
//
// A row is TWO lines, not eleven columns: the cloth attributes and the FX rate
// the office asked to see cannot be squeezed into the money grid at 1280px
// without shrinking every column into illegibility. The attribute line carries
// its own labels rather than a second header strip, so it stays readable on its
// own and needs no alignment with the columns above it. `Markup` is DERIVED in
// ./priceLists.js from figures already on the payload — nothing stores it, and
// this screen writes nothing.
//
// The two cells after it — the supplier discount and the trade markup the range
// is PRICED with — are Dynamics range parameters (GET /admin/freight/parameters),
// joined once per visit by range name. That endpoint is finance-gated, and a
// 403 there is not this screen's error: the two cells are simply absent for
// that login, never a column of dashes.

const COLS = '0.9fr 1.9fr 1.2fr 1fr 0.9fr 0.9fr 96px'
const ATTR_COLS = '1.8fr 0.8fr 0.9fr 1.1fr 0.8fr 0.8fr'
const ATTR_COLS_WITH_RANGE = `${ATTR_COLS} 1fr 1fr`
const LIMIT = 25
const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
// The label states its own family: the FX and markup cells are mono, and a
// label inheriting that reads as a value rather than as a heading.
const attrLabel = { fontFamily: font.ui, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, marginRight: 6 }
const attrCell = { fontSize: 11.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

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
  const [openGuid, setOpenGuid] = useState(null) // row with the correction panel open
  // range key -> Dynamics parameter row; null until loaded, and null for a login
  // the finance gate refuses (the two range cells then stay off the screen).
  const [rangeParams, setRangeParams] = useState(null)

  // `quiet` skips the loading state: the rows only render under status 'ready',
  // so a post-save reload would otherwise blank the table and unmount the open
  // correction panel mid-flow. (This is what useAdminList's reload does.)
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus('loading')
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (term.trim()) params.set('q', term.trim())
    try {
      const body = await apiFetch(`/admin/legacy/prices?${params.toString()}`)
      setData({ items: body.items ?? [], total: body.meta?.total ?? 0 })
      setStatus('ready')
    } catch (err) {
      // A quiet reload is a post-save refresh, so the rows already on screen are
      // still a true list — blanking them into the error branch would unmount the
      // open panel, and swallowing the failure would let useMutation flash
      // "Correction saved." over a broken table. Rethrow: the caller (the panel's
      // useMutation) owns the message and leaves these rows alone.
      if (quiet) throw err
      setError(err instanceof ApiError ? err.message : 'Could not load price lists.')
      setStatus('error')
    }
  }, [term, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let cancelled = false
    safeFetch(PARAMETERS_PATH).then(({ data }) => {
      if (!cancelled && data) setRangeParams(indexByRange(data.parameters ?? []))
    })
    return () => { cancelled = true }
  }, [])

  // Close the panel if its row left the page — a search, a page turn, or a
  // suppression can all take it away, and an editor over a row nobody can see
  // edits a record the screen is no longer showing.
  useEffect(() => {
    if (openGuid && !data.items.some((i) => i.guid === openGuid)) setOpenGuid(null)
  }, [openGuid, data.items])

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
          <div style={hCell} />
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
          <div key={i.guid}>
            {/* No dimming for a suppressed row: this list sends no
                include_archived, so the merged read can never return one. */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '14px 20px 6px' }}>
              <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5, color: c.ink }}>{i.code || '—'}</span>
              <span style={{ ...cell, color: c.ink }}>
                {i.description || '—'}
                {/* The list read carries overridden_fields; stale_fields does not
                    reach it, so the panel is where drift is adjudicated. */}
                {i.overridden_fields?.length > 0 && (
                  <span style={{ color: c.accent, marginLeft: 8, fontSize: 10.5 }}>corrected</span>
                )}
              </span>
              <span style={cell}>{i.range_name || '—'}</span>
              <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{wholesale(i)}</span>
              <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{money(i.trade_sell_price_nz)}</span>
              <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{money(i.retail_sell_price_nz)}</span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <GhostButton onClick={() => setOpenGuid((open) => (open === i.guid ? null : i.guid))}>
                  {openGuid === i.guid ? 'Close' : 'Correct'}
                </GhostButton>
              </span>
            </div>
            {/* An absent key is what a CRM deployed ahead of the API's projection
                sees; it has to read as a blank cell, not as a broken row. */}
            <div style={{ display: 'grid', gridTemplateColumns: rangeParams ? ATTR_COLS_WITH_RANGE : ATTR_COLS, gap: 16, alignItems: 'center', padding: '0 20px 12px', borderBottom: `1px solid ${c.line}` }}>
              <Attr label="Contents" value={i.contents || DASH} />
              <Attr label="Width" value={i.width || DASH} />
              <Attr label="Repeat" value={i.repeat || DASH} />
              <Attr label="Vert repeat" value={i.vertical_repeat || DASH} />
              <Attr label="FX" value={fxText(i)} mono />
              <Attr label="Markup" value={markupText(i)} mono />
              {rangeParams && (
                <>
                  <Attr label="Supplier disc." value={rangeDiscountText(parameterFor(rangeParams, i))} mono />
                  <Attr label="Range markup" value={rangeMarkupText(parameterFor(rangeParams, i))} mono />
                </>
              )}
            </div>
            {openGuid === i.guid && (
              <div style={{ padding: '4px 20px 20px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                <DynamicsCorrection
                  entity="prices"
                  guid={i.guid}
                  onSaved={() => load({ quiet: true })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: c.muted }}>
          {data.total} price line{data.total === 1 ? '' : 's'} · <AttributePill style={{ fontSize: 9.5, padding: '2px 7px' }}>mirrored from Dynamics · correctable</AttributePill>
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

function Attr({ label, value, mono = false }) {
  return (
    <span style={mono ? { ...attrCell, fontFamily: font.mono } : attrCell}>
      <span style={attrLabel}>{label}</span>
      {value}
    </span>
  )
}
