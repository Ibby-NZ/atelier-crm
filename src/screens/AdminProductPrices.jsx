// Product prices — the Dynamics "Active Product Prices" export, re-imported
// (25 Sep 2026, client asked: "the price calculation … shown on products in the
// CRM"), each row priced through its house's range figures by atelier-api.
//
//   GET  /admin/product-prices?q&range&currency&include_previous&page&limit
//   GET  /admin/product-prices/ranges
//   POST /admin/product-prices/import/validate|apply   (ProductPricesImport)
//
// The list is the list: search, the range and currency filters, and a row per
// product with the platform's trade sell beside Dynamics' own. A product OPENS
// ON ITS OWN PAGE (AdminProductPrice) with the whole calculation. The search
// lives in the URL so Back from a product lands on the same search over
// twenty thousand rows.
//
// The upload is behind "Upload export" on the header — it is about the whole
// list (the house import's reasoning), so it is a panel here, not a page.
//
// Finance-gated by the API, reads included. The ranges read decides it: a 403
// there is the LockedPanel with the API's sentence, and the list is not drawn.
// Rules in ./productPrices.js; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { apiFetch } from '../lib/api.js'
import Pagination from '../admin/Pagination.jsx'
import LinkRow from '../admin/LinkRow.jsx'
import { useAdminList } from '../admin/useAdminList.js'
import {
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Select,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  useToast,
} from '../admin/parts.jsx'
import ProductPricesImport from './ProductPricesImport.jsx'
import {
  CURRENCY_OPTIONS,
  PRODUCT_PRICES_PATH,
  PRODUCT_PRICE_LIST_LIMIT,
  PRODUCT_PRICE_RANGES_PATH,
  differenceText,
  differenceTone,
  foreign,
  houseLink,
  isFinanceRefusal,
  nzd,
  productPriceFilters,
  productPriceRoute,
  productPriceSearchFromParams,
  productPriceSearchParams,
  productPricesListRoute,
  rangeOptions,
  unpricedText,
} from './productPrices.js'

const COLUMNS = '1.6fr 1.1fr 110px 90px 100px 110px 110px 100px'
const NUMERIC = [2, 3, 4, 5, 6, 7]
const TONES = { positive: c.sage, warning: c.clay, muted: c.muted }
const cell = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }
const number = { ...monoText, textAlign: 'right' }

export default function AdminProductPrices() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = productPriceSearchFromParams(searchParams)
  const [draftQ, setDraftQ] = useState(search.q)
  const [ranges, setRanges] = useState({ status: 'loading', rows: [], error: null })
  const [importOpen, setImportOpen] = useState(false)
  const { message: toast, flash } = useToast()

  // A link arriving with a search refills the box as well as moving the list.
  useEffect(() => {
    setDraftQ(search.q)
  }, [search.q])

  const loadRanges = useCallback(async () => {
    try {
      const body = await apiFetch(PRODUCT_PRICE_RANGES_PATH)
      setRanges({ status: 'ready', rows: body?.ranges ?? [], error: null })
    } catch (err) {
      setRanges({ status: isFinanceRefusal(err) ? 'locked' : 'error', rows: [], error: err })
    }
  }, [])

  useEffect(() => {
    loadRanges()
  }, [loadRanges])

  const list = useAdminList({
    path: PRODUCT_PRICES_PATH,
    key: 'product_prices',
    limit: PRODUCT_PRICE_LIST_LIMIT,
    filters: productPriceFilters(search),
  })

  const setSearch = (next) => setSearchParams(productPriceSearchParams({ ...search, ...next }))
  const listRoute = productPricesListRoute(search)
  const latest = list.meta?.latest_import ?? null

  const applied = () => {
    loadRanges()
    list.reload().catch(() => {})
  }

  const header = (
    <PageHeader
      eyebrow="Pricing · from the Dynamics export"
      title="Product prices"
      subtitle="Every product in the Dynamics product prices export, priced through its house: wholesale ÷ exchange rate, plus the range's duty and freight, clearance on top for the landed cost, then the trade markup. Dynamics' own trade sell is shown beside it."
      right={
        ranges.status !== 'locked' && (
          <GhostButton tone="accent" onClick={() => setImportOpen((open) => !open)}>
            {importOpen ? 'Close upload' : 'Upload export'}
          </GhostButton>
        )
      }
    />
  )

  if (ranges.status === 'locked') {
    return (
      <div>
        {header}
        <div style={{ marginTop: 28 }}>
          <LockedPanel
            title="Product prices are finance"
            reason={ranges.error?.message}
            hint="Wholesale rates and landed costs are cost figures. Director and Finance only."
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {header}

      {latest && (
        <p style={{ ...mutedText, margin: '14px 0 0' }}>
          Last import: <span style={monoText}>{latest.filename}</span>
          {latest.exported_at ? ` · export of ${latest.exported_at.replace('T', ' ')}` : ''}
          {latest.imported_by ? ` · by ${latest.imported_by.name || latest.imported_by.email}` : ''}
        </p>
      )}

      {importOpen && (
        <div style={{ ...panel, marginTop: 20 }}>
          <PanelHead label="Upload the product prices export" />
          <ProductPricesImport onApplied={applied} flash={flash} />
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          setSearch({ q: draftQ })
        }}
        style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 22 }}
      >
        <label style={{ flex: '1 1 260px', minWidth: 0 }}>
          <span style={{ ...mutedText, display: 'block', marginBottom: 6 }}>Search code, description or range</span>
          <input value={draftQ} onChange={(event) => setDraftQ(event.target.value)} style={inputStyle} placeholder="ELLA STRIPE" />
        </label>
        <label style={{ flex: '0 1 280px' }}>
          <span style={{ ...mutedText, display: 'block', marginBottom: 6 }}>Range</span>
          <Select value={search.range} onChange={(event) => setSearch({ range: event.target.value })}>
            <option value="">All ranges</option>
            {rangeOptions(ranges.rows).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label style={{ flex: '0 0 130px' }}>
          <span style={{ ...mutedText, display: 'block', marginBottom: 6 }}>Currency</span>
          <Select value={search.currency} onChange={(event) => setSearch({ currency: event.target.value })}>
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code || 'all'} value={code}>
                {code || 'All'}
              </option>
            ))}
          </Select>
        </label>
        <GhostButton type="submit">Search</GhostButton>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, height: 40 }}>
          <input type="checkbox" checked={search.all} onChange={(event) => setSearch({ all: event.target.checked })} />
          Include products no longer in the export
        </label>
      </form>

      <ErrorLine style={{ marginTop: 12 }}>{ranges.status === 'error' ? messageOf(ranges.error, 'Could not load the ranges.') : ''}</ErrorLine>

      <div style={{ ...panel, marginTop: 16, overflow: 'clip' }}>
        <PanelHead
          label={list.status === 'ready' ? `${list.total.toLocaleString('en-NZ')} product${list.total === 1 ? '' : 's'}` : 'Products'}
        />
        <HeaderRow
          columns={COLUMNS}
          labels={['Product', 'Range', 'Wholesale', 'Freight', 'Landed', 'Trade sell', 'Dynamics', 'Difference']}
          numeric={NUMERIC}
          sticky
        />
        {list.status === 'loading' && <PanelNote>Loading product prices…</PanelNote>}
        {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
        {list.status === 'ready' && list.rows.length === 0 && (
          <PanelNote>
            {latest ? 'No product matches that search.' : 'No export has been imported yet — upload the product prices export to begin.'}
          </PanelNote>
        )}
        {list.rows.map((row) => {
          const pricing = row.pricing ?? {}
          const unpriced = unpricedText(pricing)
          const house = pricing.house
          return (
            <LinkRow key={row.id} to={productPriceRoute(row.id)} columns={COLUMNS} style={{ fontSize: 13 }}>
              <span style={cell}>
                <Link
                  to={productPriceRoute(row.id)}
                  state={{ from: listRoute }}
                  className="ab-link"
                  style={{ color: c.ink, textDecoration: 'none', fontWeight: 500 }}
                >
                  {row.code}
                </Link>
                <span style={{ ...mutedText, display: 'block' }}>
                  {[row.description !== row.code ? row.description : null, row.item_type].filter(Boolean).join(' · ')}
                  {!row.in_latest_export && <span style={{ color: c.clay }}> · no longer in the export</span>}
                </span>
              </span>
              <span style={cell}>
                {house ? (
                  <Link to={houseLink(house)} className="ab-link" style={{ color: c.inkSoft }}>
                    {row.range_name}
                  </Link>
                ) : (
                  <span style={{ color: c.clay }}>{row.range_name} · no house</span>
                )}
              </span>
              <span style={number}>{foreign(row.wholesale_rate, row.currency)}</span>
              <span style={number}>{nzd(pricing.freight)}</span>
              <span style={number}>{nzd(pricing.landed)}</span>
              <span style={{ ...number, color: c.ink, fontWeight: 600 }}>
                {unpriced ? <span style={{ ...mutedText, fontFamily: font.ui, fontWeight: 400, color: c.clay }}>{unpriced}</span> : nzd(pricing.trade_sell)}
              </span>
              <span style={number}>{nzd(row.dynamics_trade_sell)}</span>
              <span style={{ ...number, color: TONES[differenceTone(pricing)] }}>{differenceText(pricing)}</span>
            </LinkRow>
          )
        })}
        <Pagination page={list.page} totalPages={list.totalPages} total={list.total} unit="products" onPage={list.setPage} />
      </div>

      <ToastLine message={toast} />
    </div>
  )
}
