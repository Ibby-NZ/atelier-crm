import { describe, it, expect } from 'vitest'
import {
  INSIGHT_KEYS,
  breadcrumbs,
  contextOf,
  insightFiltersFromParams,
  insightLinkFor,
  insightQuery,
  insightRoute,
  kindOfFilters,
  monthRange,
  pinnedColumns,
  pinsOf,
  rowPins,
  sectionTitle,
  subjectHeading,
  summaryTiles,
} from './insight.js'
import { buildLiveReport, exportRows } from './reportBuilders.js'
import { canViewReport, reportDenialReason } from '../auth/reportPolicy.js'

// The URL is the subject: one filter set is always one querystring, in one order.
describe('the insight URL', () => {
  it('reads only its own keys, blanks absent, and writes them back in one order', () => {
    const params = new URLSearchParams('brand=larsen&product=atlas&from=2026-08-01&r=orders&sku=%20')
    const filters = insightFiltersFromParams(params)
    expect(filters).toEqual({ brand: 'larsen', product: 'atlas', from: '2026-08-01' })
    expect(insightQuery(filters)).toBe('?brand=larsen&product=atlas&from=2026-08-01')
    expect(insightQuery({})).toBe('')
    expect(insightRoute({ sku: 'PF NUA 01' })).toBe('/reporting?sku=PF+NUA+01')
    expect(INSIGHT_KEYS[0]).toBe('brand')
  })

  // The API echoes `brand` as a list; a list of one is that one and a list of
  // several pins nothing.
  it('reads a one-house list as a pin and drops a comparison', () => {
    expect(pinsOf({ brand: ['larsen'], from: '2026-01-01' })).toEqual({ brand: 'larsen' })
    expect(pinsOf({ brand: ['larsen', 'frey'] })).toEqual({})
    expect(contextOf({ brand: ['larsen'], from: '2026-01-01', category: 'fabric', limit: 5 }))
      .toEqual({ from: '2026-01-01', category: 'fabric' })
  })

  // Under a pin, the column that IS the pin says nothing on any row; the unit
  // and currency columns stay because a figure without them is the one thing
  // these tables never show.
  it('hides the columns a pin makes constant, never the unit or the currency', () => {
    expect(pinnedColumns({})).toEqual([])
    expect(pinnedColumns({ brand: 'frey' })).toEqual(['brand_name'])
    expect(pinnedColumns({ brand: 'frey', collection: 'c' })).toEqual(['brand_name', 'collection_name'])
    expect(pinnedColumns({ product: 'atlas' })).toEqual(['brand_name', 'product_name', 'category'])
    expect(pinnedColumns({ sku: 'PF-1' })).not.toContain('product_type')
    expect(pinnedColumns({ sku: 'PF-1' })).not.toContain('currency')
  })

  it('names the kind by the deepest pin', () => {
    expect(kindOfFilters({})).toBe('all')
    expect(kindOfFilters({ brand: 'a' })).toBe('house')
    expect(kindOfFilters({ brand: 'a', collection: 'c' })).toBe('collection')
    expect(kindOfFilters({ brand: 'a', product: 'p' })).toBe('design')
    expect(kindOfFilters({ product: 'p', sku: 's' })).toBe('colourway')
  })
})

describe('where a row leads', () => {
  it('reads the deepest identity off the row', () => {
    expect(rowPins({ sku: 'PF-1', product_slug: 'atlas', brand_slug: 'frey' })).toEqual({ sku: 'PF-1' })
    expect(rowPins({ product_slug: 'atlas', brand_slug: 'frey' })).toEqual({ brand: 'frey', product: 'atlas' })
    expect(rowPins({ collection_slug: 'season', brand_slug: 'frey' })).toEqual({ brand: 'frey', collection: 'season' })
    expect(rowPins({ collection_slug: null, brand_slug: 'frey' })).toEqual({ brand: 'frey' })
    expect(rowPins({ client: 'Maker Interiors' })).toBeNull()
    expect(rowPins(null)).toBeNull()
  })

  it('turns a month cell into a window, last day included', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('2026-13')).toBeNull()
    expect(monthRange('All months')).toBeNull()
  })

  it('carries the context with a subject pin, and the pins with a month', () => {
    const context = { brand: ['frey'], from: '2026-01-01', to: '2026-03-31', category: 'fabric' }
    expect(insightLinkFor({ product_slug: 'atlas', brand_slug: 'frey' }, context))
      .toBe('/reporting?brand=frey&product=atlas&category=fabric&from=2026-01-01&to=2026-03-31')
    expect(insightLinkFor({ month: '2026-02' }, context))
      .toBe('/reporting?brand=frey&category=fabric&from=2026-02-01&to=2026-02-28')
    expect(insightLinkFor({ status: 'paid' }, context)).toBe('')
  })
})

describe('the heading and the trail', () => {
  const subject = {
    kind: 'colourway',
    brands: [],
    product: null,
    collections: [],
    colourway: { sku: 'PF-NUA-01', name: 'Ciel', hex: '#A8C6DE', product_slug: 'nuage', product_name: 'Nuage', brand_slug: 'pierre-frey', brand_name: 'Pierre Frey' },
  }

  it('titles a colour by its design and name, with the swatch', () => {
    expect(subjectHeading(subject, { sku: 'PF-NUA-01' })).toEqual({
      eyebrow: 'Pierre Frey · Colourway', title: 'Nuage — Ciel', detail: 'PF-NUA-01', hex: '#A8C6DE',
    })
  })

  it('widens through the design and the house, keeping the window', () => {
    expect(breadcrumbs(subject, { sku: 'PF-NUA-01', from: '2026-01-01' })).toEqual([
      { label: 'All', to: '/reporting?from=2026-01-01' },
      { label: 'Pierre Frey', to: '/reporting?brand=pierre-frey&from=2026-01-01' },
      { label: 'Nuage', to: '/reporting?brand=pierre-frey&product=nuage&from=2026-01-01' },
      { label: 'Nuage — Ciel' },
    ])
  })

  // A mistyped slug shows the raw filter and says so — never a guessed name.
  it('shows an unresolved pin as what was typed', () => {
    const heading = subjectHeading({ kind: 'design', product: null }, { product: 'no-such' })
    expect(heading.title).toBe('no-such')
    expect(heading.detail).toMatch(/not in the catalogue/)
    expect(breadcrumbs({ kind: 'design', product: null }, { product: 'no-such' })).toEqual([
      { label: 'All', to: '/reporting' },
      { label: 'no-such' },
    ])
  })

  it('reads the whole platform as one crumb', () => {
    expect(breadcrumbs({ kind: 'all' }, {})).toEqual([{ label: 'All' }])
    expect(subjectHeading({ kind: 'all' }, {}).eyebrow).toBe('Whole platform')
  })
})

describe('the tiles', () => {
  const summary = {
    orders: 12, lines: 30, qty: 84.5, product_type: 'fabric', mixed_units: false,
    value_cents: 1234500, currency: 'NZD', mixed_currency: false, unpriced_lines: 3,
    houses: 1, designs: 4, colourways_sold: 9, clients: 5, statuses: ['paid', 'shipped'],
    stock: { colourways_held: 6, held_unsold: 2, over_allocated: 1, unit: 'metres', mixed_units: false, on_hand: 40, allocated: 12, available: 28 },
    awaiting_invoice: { lines: 7 },
  }

  it('formats money in units with its currency and quantities with their unit', () => {
    const tiles = Object.fromEntries(summaryTiles(summary).map((t) => [t.label, t]))
    expect(tiles.Sales.value).toBe('NZD 12,345.00')
    expect(tiles.Sales.sub).toBe('3 unpriced lines at nil')
    expect(tiles.Sold.value).toBe('84.5 m')
    expect(tiles['On hand'].value).toBe('40 m')
    expect(tiles.Available.sub).toBe('1 over-allocated')
    expect(tiles['Awaiting invoice'].value).toBe('7')
    expect(tiles.Orders.sub).toBe('30 lines · paid / shipped')
  })

  // A figure the API withheld is a dash with the reason — never a summed lie.
  it('dashes a mixed-currency value and a mixed-unit quantity, saying why', () => {
    const tiles = Object.fromEntries(summaryTiles({
      ...summary, mixed_currency: true, value_cents: null, currency: null, mixed_units: true, qty: null,
      stock: { ...summary.stock, mixed_units: true, on_hand: null },
    }).map((t) => [t.label, t]))
    expect(tiles.Sales.value).toBe('—')
    expect(tiles.Sales.sub).toMatch(/currency/)
    expect(tiles.Sold.value).toBe('—')
    expect(tiles['On hand'].value).toBe('—')
  })

  it('draws nothing before the payload lands', () => {
    expect(summaryTiles(null)).toEqual([])
  })
})

describe('a section through the live pipeline', () => {
  const section = {
    key: 'by_colourway',
    report: 'colourway-performance',
    title: 'Sales and stock by colourway',
    columns: [
      { key: 'sku', label: 'SKU', kind: 'text', finance: false },
      { key: 'colourway_name', label: 'Colourway', kind: 'text', finance: false },
      { key: 'hex', label: 'Swatch', kind: 'text', finance: false },
      { key: 'qty', label: 'Sold', kind: 'number', finance: false },
      { key: 'on_hand', label: 'On hand', kind: 'number', finance: false },
      { key: 'brand_slug', label: 'House slug', kind: 'text', finance: false },
      { key: 'product_slug', label: 'Design slug', kind: 'text', finance: false },
    ],
    rows: [
      { sku: 'PF-NUA-01', colourway_name: 'Ciel', hex: '#A8C6DE', qty: 12, on_hand: 4, brand_slug: 'pierre-frey', product_slug: 'nuage' },
      { sku: 'PF-NUA-03', colourway_name: 'Brume', hex: null, qty: 0, on_hand: null, brand_slug: 'pierre-frey', product_slug: 'nuage' },
    ],
    totals: { sku: 'All colourways', qty: 12, on_hand: 4 },
    meta: { filters: { product: 'nuage', from: '2026-01-01' }, rows_total: 2, row_limit: 200, truncated: false, masked_columns: [] },
  }

  it('hides the link columns and the hex, rides the swatch on the name, links by SKU', () => {
    const table = buildLiveReport(section)
    expect(table.cols.map((cl) => cl.t)).toEqual(['SKU', 'Colourway', 'Sold', 'On hand'])
    expect(table.rows[0].cells[1].hex).toBe('#A8C6DE')
    expect(table.rows[0].cells[1].t).toBe('Ciel')
    expect(table.rows[1].cells[1].hex).toBeUndefined()
    expect(table.rows[1].cells[3].t).toBe('—')
    expect(table.rows[0].link).toBe('/reporting?sku=PF-NUA-01&from=2026-01-01')
    expect(table.rows[2].total).toBe(true)
    expect(table.rows[2].link).toBeUndefined()
    // The CRM's own CSV follows the drawn columns: no slug, no hex string.
    expect(exportRows(table).head).toEqual(['SKU', 'Colourway', 'Sold', 'On hand'])
  })

  it('drops the caller’s hidden columns, and never every column', () => {
    const table = buildLiveReport(section, { hide: ['colourway_name'] })
    expect(table.cols.map((cl) => cl.t)).toEqual(['SKU', 'Sold', 'On hand'])
    const kept = buildLiveReport(section, { hide: ['sku', 'colourway_name', 'qty', 'on_hand'] })
    expect(kept.cols.map((cl) => cl.t)).toEqual(['SKU', 'Colourway', 'Sold', 'On hand'])
  })

  it('names every section the API composes', () => {
    for (const key of ['by_month', 'by_house', 'by_collection', 'by_design', 'by_category', 'by_colourway', 'by_client', 'by_rep', 'by_status', 'awaiting_invoice', 'recent_orders']) {
      expect(sectionTitle(key)).not.toBe(key)
    }
    expect(sectionTitle('by_nothing')).toBe('by_nothing')
  })
})

// The insight's tiles are company totals when nothing is pinned — the leak
// own-sales scoping exists to close — so it is gated like R-11/R-12/R-13.
describe('the insight policy', () => {
  it('needs all-company report access, with the reason written down', () => {
    expect(canViewReport({ all: true, finance: false }, 'insight')).toBe(true)
    expect(canViewReport({ all: false, finance: true }, 'insight')).toBe(false)
    expect(reportDenialReason('insight')).toMatch(/A6/)
  })
})
