import { describe, it, expect } from 'vitest'
import {
  buildReport,
  buildLiveReport,
  exportRows,
  hasFixture,
  liveReportPath,
  periodFactor,
  reportDef,
  reportRowLink,
} from './reportBuilders.js'
import { toCSV } from './exporters.js'
import { reportFiltersFromParams } from './reportFilters.js'
import {
  REPORTS, ownerSummary, FY_TOTAL, FY_TOTAL_PRIOR, STOCK_VALUATION,
  ownerByRange, brandTypes, designSales, OTHER_DESIGNS, SALES_YEARS, stockLines,
} from '../data/reportLibrary.js'
import { USERS, accessOf } from '../auth/roles.js'
import { canViewReport, reportDenialReason, reportIsMasked } from '../auth/reportPolicy.js'

// buildReport defaults to NO_ACCESS, so every table below states the role it exercises.
// Liz is the Director (owner:null — see the R-01 scoping tests); Rebecca is the User;
// Showroom is the shared login A6 has no person to attribute to.
const userOf = (id) => USERS.find((u) => u.id === id)
const asDirector = accessOf(userOf('liz'))
const asUser = accessOf(userOf('rebecca'))
const asShowroom = accessOf(userOf('showroom'))

// R-13 is the one report with no fixture behind it — it is the platform's own
// order lines or nothing at all — so there is no demo table for it to build.
const allStates = REPORTS.filter((r) => hasFixture(r.key)).flatMap((r) =>
  (r.dims || [[null]]).map(([dimKey]) => ({ report: r.key, period: 'FY', dim: dimKey, brand: 'Pierre Frey' })))

// R-12 helpers — the design/year totals the report DERIVES, recomputed independently
// here so the test is a second opinion rather than a copy of the builder's arithmetic.
const yearsOf = (d) => SALES_YEARS.map((_, i) => d.colourways.reduce((s, cw) => s + cw.years[i], 0))
const designNamed = (name) => designSales.find((d) => d.design === name)
const rowLabelled = (table, label) => table.rows.find((r) => r.cells[0].t === label)

const colLabels = (table) => table.cols.map((cl) => cl.t)
const cellText = (table) => table.rows.flatMap((r) => r.cells.map((cell) => cell.t))

// Every report × every view must build a well-formed table.
describe('buildReport — structural integrity', () => {
  it.each(allStates)('builds %o for a Director with matching col/cell counts', (state) => {
    const table = buildReport(state, asDirector)
    expect(table.cols.length).toBeGreaterThan(2)
    expect(table.rows.length).toBeGreaterThan(0)
    table.rows.forEach((row) => {
      expect(row.cells.length).toBe(table.cols.length)
      row.cells.forEach((cell) => expect(['text', 'pill']).toContain(cell.kind))
    })
  })

  // A mask that strips a column but not the cells under it renders every later cell one
  // column to the left — silently wrong rather than obviously broken.
  it.each(allStates.filter((s) => canViewReport(asUser, s.report)))(
    'keeps %o square for a User once the mask has run', (state) => {
      const table = buildReport(state, asUser)
      expect(table.rows.length).toBeGreaterThan(0)
      table.rows.forEach((row) => expect(row.cells.length).toBe(table.cols.length))
    })
})

describe('buildReport — figures', () => {
  it('owner summary total row reconciles to FY NZ$1,730k', () => {
    const table = buildReport({ report: 'owner', period: 'FY', dim: 'summary' }, asDirector)
    const total = table.rows[table.rows.length - 1]
    expect(total.total).toBe(true)
    expect(total.cells[1].t).toBe('NZ$1,730k')
    const sum = ownerSummary.reduce((x, [, ty]) => x + ty, 0)
    expect(sum).toBe(FY_TOTAL)
  })

  it('owner matrix columns reconcile to the owner totals', () => {
    for (const dim of ['supplier', 'range', 'territory']) {
      const table = buildReport({ report: 'owner', period: 'FY', dim }, asDirector)
      const totalRow = table.rows[table.rows.length - 1]
      expect(totalRow.cells[1].t).toBe('NZ$642k')
      expect(totalRow.cells[2].t).toBe('NZ$589k')
      expect(totalRow.cells[3].t).toBe('NZ$499k')
      expect(totalRow.cells[4].t).toBe('NZ$1,730k')
    }
  })

  it('period factor scales figures down', () => {
    expect(periodFactor('FY')).toBe(1)
    const ytd = buildReport({ report: 'owner', period: 'YTD', dim: 'summary' }, asDirector)
    expect(ytd.rows[ytd.rows.length - 1].cells[1].t).toBe('NZ$467k') // 1730 × 0.27
  })

  it('brand-within view respects the selected brand and sums to 100%', () => {
    const table = buildReport({ report: 'brandtype', period: 'FY', dim: 'within', brand: 'de Le Cuona' }, asDirector)
    expect(table.cols[0].t).toContain('de Le Cuona')
    expect(table.rows[table.rows.length - 1].cells[2].t).toBe('100%')
  })

  it('falls back safely on unknown report / brand keys', () => {
    expect(reportDef('nope').key).toBe('owner')
    const table = buildReport({ report: 'brandtype', period: 'FY', dim: 'within', brand: 'Unknown House' }, asDirector)
    expect(table.rows.length).toBeGreaterThan(0)
  })
})

// R-12 answers the client's "how much of Nuage Ciel have we sold, and per year", so
// these tests are mostly about one thing: the colours have to add up to the design and
// the designs have to add up to the company, or the report is worse than not having it.
describe('R-12 — sales per design & colourway', () => {
  const at = (dim, design) => buildReport({ report: 'designsales', period: 'FY', dim, design }, asDirector)

  it('reconciles to FY_TOTAL and FY_TOTAL_PRIOR across every design plus the remainder', () => {
    const summed = SALES_YEARS.map((_, i) =>
      designSales.reduce((s, d) => s + yearsOf(d)[i], 0) + OTHER_DESIGNS.years[i])
    expect(summed[2]).toBe(FY_TOTAL)
    expect(summed[1]).toBe(FY_TOTAL_PRIOR)

    const table = at('design')
    const total = table.rows[table.rows.length - 1]
    expect(total.total).toBe(true)
    expect(total.cells[2].t).toBe('NZ$1,730k')
    expect(total.cells[3].t).toBe('NZ$1,613k')
    expect(total.cells[5].t).toBe('100%')
  })

  // The reason this report can sit in the same library as R-01/R-02/R-11 without
  // contradicting them: a design never outsells the range or the brand product-type
  // figure it belongs to, and the five named ranges match theirs exactly.
  it('agrees with the range and brand figures the other reports publish', () => {
    const rangeFY = new Map(ownerByRange.map((r) => [r[0], r[2] + r[3] + r[4]]))
    for (const name of ['Cappuccino', 'Giverny', 'Nature’s Opera', 'Return to Arcadia', 'Larsen 2024']) {
      const d = designSales.find((x) => x.range === name)
      expect(yearsOf(d)[2]).toBe(rangeFY.get(name))
    }
    for (const d of designSales) {
      const brand = brandTypes.find((b) => b.brand === d.brand)
      expect(yearsOf(d)[2]).toBeLessThanOrEqual(brand.types[d.type])
    }
  })

  it('answers “Nuage Ciel, per year” in one row, and totals its own colourways', () => {
    const table = at('year', 'Nuage')
    expect(table.cols.map((cl) => cl.t)).toEqual(['Colourway · Nuage', 'FY2024', 'FY2025', 'FY2026', 'YoY'])
    const ciel = rowLabelled(table, 'Ciel')
    expect(ciel.cells[0].sub).toBe('PF-NUA-01')
    expect(ciel.cells.slice(1, 4).map((x) => x.t)).toEqual(['NZ$26.0k', 'NZ$28.0k', 'NZ$31.0k'])

    const total = table.rows[table.rows.length - 1]
    expect(total.total).toBe(true)
    SALES_YEARS.forEach((_, i) => {
      const summed = table.rows.slice(0, -1).reduce((s, r) => s + parseFloat(r.cells[i + 1].t.replace(/[^0-9.]/g, '')), 0)
      expect(total.cells[i + 1].t).toBe(`NZ$${summed.toFixed(1)}k`)
    })
  })

  it('says New rather than dividing by a nil prior year', () => {
    const table = at('year', 'Larsen 2024')
    expect(rowLabelled(table, 'Ochre').cells[4].t).toBe('New') // added in FY2026
    expect(rowLabelled(table, 'Leaf').cells[4].t).toMatch(/^[+−]\d/)
  })

  it('prints the design’s own unit — metres for cloth, rolls for wallpaper', () => {
    expect(cellText(at('colourway', 'Nuage')).some((t) => /\brolls$/.test(t))).toBe(true)
    expect(cellText(at('colourway', 'Cappuccino Chenille')).some((t) => /\bm$/.test(t))).toBe(true)
    // The catalogue-wide view carries no quantity column at all: adding metres to rolls
    // would be a figure with no unit.
    expect(at('design').cols.map((cl) => cl.t)).not.toContain('Quantity')
  })

  it('takes On hand from R-10 and does NOT scale it with the period pills', () => {
    const held = new Map(stockLines.map((r) => [r[0], r[3]]))
    for (const period of ['FY', 'Month']) {
      const table = buildReport({ report: 'designsales', period, dim: 'colourway', design: 'Cappuccino Chenille' }, asDirector)
      const ecru = rowLabelled(table, 'Écru')
      expect(ecru.cells[1].t).toBe(`${held.get('PF-CAP-01')} m`)
    }
    // A colourway Atelier does not stock reads as a dash, never as a nil holding.
    expect(rowLabelled(at('colourway', 'Cappuccino Chenille'), 'Crème').cells[1].t).toBe('—')
  })

  it('scales the money and the quantity together when the period changes', () => {
    const fy = at('colourway', 'Nuage')
    const month = buildReport({ report: 'designsales', period: 'Month', dim: 'colourway', design: 'Nuage' }, asDirector)
    expect(rowLabelled(fy, 'Ciel').cells[3].t).toBe('NZ$31.0k')
    expect(rowLabelled(month, 'Ciel').cells[3].t).toBe('NZ$2.6k')   // 31 × 0.084
    expect(rowLabelled(fy, 'Ciel').cells[2].t).toBe('50 rolls')     // 31,000 ÷ 620
    expect(rowLabelled(month, 'Ciel').cells[2].t).toBe('4 rolls')
    // Share is a ratio, so the period must not move it.
    expect(rowLabelled(month, 'Ciel').cells[4].t).toBe(rowLabelled(fy, 'Ciel').cells[4].t)
  })

  it('the swatch is decoration — the export still carries the colourway and its SKU', () => {
    const { head, rows } = exportRows(at('year', 'Nuage'))
    expect(head[0]).toBe('Colourway · Nuage')
    expect(rows[0][0]).toBe('Ciel — PF-NUA-01')
  })

  it('falls back to the first design on an unknown or missing selection', () => {
    for (const design of [undefined, 'Not A Design']) {
      const table = buildReport({ report: 'designsales', period: 'FY', dim: 'year', design }, asDirector)
      expect(table.cols[0].t).toBe(`Colourway · ${designSales[0].design}`)
      expect(table.rows.length).toBe(designSales[0].colourways.length + 1)
    }
  })

  // Same A6 gap as R-02 and R-11 — grained by design, so it cannot be scoped to a
  // salesperson, and its by-design view totals to the company's FY figure.
  it('is all-company only: closed to the User role, with a reason that names A6', () => {
    expect(canViewReport(asDirector, 'designsales')).toBe(true)
    expect(canViewReport(asUser, 'designsales')).toBe(false)
    expect(reportDenialReason('designsales')).toMatch(/A6/)
  })
})

describe('exportRows', () => {
  it('flattens cells with sub-lines for CSV export', () => {
    const table = buildReport({ report: 'account', period: 'FY', dim: 'summary' }, asDirector)
    const { head, rows } = exportRows(table)
    expect(head).toEqual(['Account', 'This period', 'Prior period', 'YoY'])
    expect(rows[0][0]).toBe('McKenzie & Willis — Christchurch')
    expect(rows.length).toBe(table.rows.length)
  })
})

describe('buildReport — the finance mask', () => {
  it('leaves a Director every column and every total', () => {
    const stock = buildReport({ report: 'stock' }, asDirector)
    expect(colLabels(stock)).toEqual(['SKU', 'Design · Colourway', 'On hand', 'Allocated', 'Available', 'Landed /m', 'Value'])
    const valuation = stock.rows[stock.rows.length - 1]
    expect(valuation.total).toBe(true)
    expect(valuation.cells[6].t).toBe(STOCK_VALUATION)

    expect(colLabels(buildReport({ report: 'zerocost' }, asDirector))).toContain('Cost')

    const margin = buildReport({ report: 'margin' }, asDirector)
    expect(colLabels(margin)).toEqual(expect.arrayContaining(['Cost /m', 'Margin']))
    expect(cellText(margin)).toContain('Under 30%')
  })

  it('R-03 drops Cost for a User, and the export inherits the mask', () => {
    const table = buildReport({ report: 'zerocost' }, asUser)
    expect(colLabels(table)).not.toContain('Cost')
    expect(exportRows(table).head).not.toContain('Cost')
  })

  // The pill states the margin band in words: masking the column and leaving the pill
  // withholds the figure and publishes the fact.
  it('R-04 drops Cost /m and Margin for a User, and no pill names the band', () => {
    const table = buildReport({ report: 'margin' }, asUser)
    expect(colLabels(table)).not.toContain('Cost /m')
    expect(colLabels(table)).not.toContain('Margin')
    expect(cellText(table)).not.toContain('Under 30%')
    expect(cellText(table)).not.toContain('Over 70%')
  })

  it('R-10 drops Landed /m, Value and the valuation total for a User', () => {
    const table = buildReport({ report: 'stock' }, asUser)
    expect(colLabels(table)).not.toContain('Landed /m')
    expect(colLabels(table)).not.toContain('Value')
    expect(table.rows.some((r) => r.total)).toBe(false)
    expect(cellText(table)).not.toContain(STOCK_VALUATION)
  })
})

describe('buildReport — own-sales scoping (R-01)', () => {
  it('scopes every view to Rebecca alone and withholds the all-company FY figure', () => {
    for (const dim of ['summary', 'supplier', 'range', 'territory']) {
      const table = buildReport({ report: 'owner', period: 'FY', dim }, asUser)
      expect(colLabels(table)).not.toContain('Jenette')
      expect(colLabels(table)).not.toContain('Charlotte')
      expect(colLabels(table)).not.toContain('Total')
      // The company FY figure is the single number the scoping exists to withhold —
      // it must not survive in any cell of any row, total or otherwise.
      expect(cellText(table)).not.toContain('NZ$1,730k')
    }
  })

  it('summary scoped to Rebecca keeps her row and drops the grand total', () => {
    const table = buildReport({ report: 'owner', period: 'FY', dim: 'summary' }, asUser)
    expect(table.rows.length).toBe(1)
    expect(table.rows[0].cells[0].t).toBe('Rebecca')
    expect(table.rows.some((r) => r.total)).toBe(false)
  })

  it('the matrix views keep Rebecca’s column and total her own book', () => {
    for (const dim of ['supplier', 'range', 'territory']) {
      const table = buildReport({ report: 'owner', period: 'FY', dim }, asUser)
      expect(colLabels(table)[1]).toBe('Rebecca')
      expect(colLabels(table).length).toBe(2)
      const total = table.rows[table.rows.length - 1]
      expect(total.total).toBe(true)
      expect(total.cells[0].t).toBe('Rebecca — total')
      expect(total.cells[1].t).toBe('NZ$642k')
    }
  })

  it('a shared login has no salesperson to scope to, and says so (A6)', () => {
    for (const dim of ['summary', 'supplier', 'range', 'territory']) {
      const table = buildReport({ report: 'owner', period: 'FY', dim }, asShowroom)
      expect(table.empty).toBe(true)
      expect(table.emptyReason).toMatch(/A6/)
      expect(table.rows).toEqual([])
      expect(table.cols).toEqual([])
    }
  })

  // Liz carries owner:null too, so this pins where the empty state comes from: being
  // scoped with nobody to scope to, not owner:null on its own. `all` outranks scoping.
  it('a Director with no salesperson still reads the whole company', () => {
    const table = buildReport({ report: 'owner', period: 'FY', dim: 'summary' }, asDirector)
    expect(asDirector.owner).toBe(null)
    expect(table.empty).toBeUndefined()
    expect(table.rows[table.rows.length - 1].cells[1].t).toBe('NZ$1,730k')
  })
})

// ---- live reports (atelier-api) ------------------------------------------------
//
// These take an atelier-api envelope verbatim — the shape src/reports/*.js emits
// and maskReport narrows — so a change to it on either side fails here rather
// than as a blank column on a screen nobody can render in this repo.
describe('buildLiveReport — the platform’s own answer', () => {
  const LIVE_COLUMNS = [
    { key: 'brand_name', label: 'House', kind: 'text', finance: false },
    { key: 'product_name', label: 'Design', kind: 'text', finance: false },
    { key: 'currency', label: 'Currency', kind: 'text', finance: false },
    { key: 'orders', label: 'Orders', kind: 'number', finance: false },
    { key: 'value_cents', label: 'Sales', kind: 'money', finance: false },
  ]

  const payload = (over = {}) => ({
    report: 'product-performance',
    title: 'Product performance by house and design',
    columns: LIVE_COLUMNS,
    rows: [
      { brand_name: 'Pierre Frey', product_name: 'Atlas', currency: 'NZD', orders: 3, value_cents: 125000 },
      { brand_name: 'Larsen', product_name: '=SUM(A1:A9)', currency: 'NZD', orders: 1, value_cents: 4997 },
    ],
    // `qty` is deliberately absent from the API's totals where it cannot be added.
    totals: { brand_name: 'All houses', orders: 4, value_cents: 129997 },
    meta: {
      filters: {},
      rows_total: 2,
      row_limit: 200,
      truncated: false,
      masked_columns: [],
      coverage: { note: 'Live platform orders only; historic Dynamics sales are header-only.' },
    },
    ...over,
  })

  it('maps the envelope onto the screen’s descriptor, square', () => {
    const table = buildLiveReport(payload())
    expect(colLabels(table)).toEqual(['House', 'Design', 'Currency', 'Orders', 'Sales'])
    // Two data rows plus the totals row.
    expect(table.rows).toHaveLength(3)
    table.rows.forEach((r) => expect(r.cells).toHaveLength(table.cols.length))
    expect(table.rows[2].total).toBe(true)
    expect(table.live).toBe(true)
  })

  // The column declares `kind: 'money'` once for the table and the file alike, and
  // 125000 under a heading of "Sales" is a wrong figure to every human who reads it.
  it('writes a money column in units, never in cents', () => {
    const table = buildLiveReport(payload())
    expect(table.rows[0].cells[4].t).toBe('1,250.00')
    expect(table.rows[1].cells[4].t).toBe('49.97')
    expect(cellText(table)).not.toContain('125000')
  })

  // A figure the API deliberately omitted from its totals — metres and units do not
  // sum — is a dash. A zero would state a total nobody computed.
  it('renders an absent totals key as a dash rather than a nil', () => {
    const table = buildLiveReport(payload())
    const totals = table.rows[table.rows.length - 1]
    expect(totals.cells[0].t).toBe('All houses')
    expect(totals.cells[2].t).toBe('—') // no currency on the totals row
    expect(totals.cells[4].t).toBe('1,299.97')
  })

  // THE SERVER IS THE ONLY AUTHORITY ON A LIVE TABLE. REPORT_POLICY.stock declares
  // 'Landed /m' and 'Value' as finance columns; the live stock report has no cost
  // source at all (A1 open), so nothing is withheld and nothing may claim it was.
  it('takes the masked note from the API’s own list, not from REPORT_POLICY', () => {
    expect(buildLiveReport(payload()).masked).toBe('')
    expect(reportIsMasked(accessOf(userOf('rebecca')), 'stock')).toBe(true) // the policy still says so

    const withheld = buildLiveReport(payload({
      meta: { ...payload().meta, masked_columns: ['Landed /m', 'Value'] },
    }))
    expect(withheld.masked).toContain('Landed /m')
    expect(withheld.masked).toContain('Value')
    expect(withheld.masked).toMatch(/partial/)
  })

  it('says what the figures cover, and when it is showing a page of them', () => {
    expect(buildLiveReport(payload()).note).toMatch(/header-only/)

    const cut = buildLiveReport(payload({
      meta: { ...payload().meta, truncated: true, row_limit: 1, rows_total: 2 },
    }))
    expect(cut.note).toMatch(/Showing 1 of 2 rows/)
    // The totals are the population's, not the page's — the screen has to say which.
    expect(cut.note).toMatch(/totals cover every row/)
  })

  // A filter the report could not honour narrowed nothing, and silence about it
  // reads as "filtered" — the same reason the API writes the line into its CSV.
  it('names a filter the report declined', () => {
    const table = buildLiveReport(payload({
      meta: { ...payload().meta, ignored_filters: ['from', 'to'] },
    }))
    expect(table.note).toMatch(/ignored: from, to/)
  })

  // A heading over nothing reads as broken; a sentence is an answer.
  it('answers an empty population with a reason rather than a bare header', () => {
    const table = buildLiveReport(payload({ rows: [], totals: null }))
    expect(table.empty).toBe(true)
    expect(table.emptyReason).toBeTruthy()
    expect(table.cols).toEqual([])
  })

  it('treats a payload with no columns as a fault, not as an empty report', () => {
    const table = buildLiveReport({ report: 'x', columns: [], rows: [] })
    expect(table.empty).toBe(true)
    expect(table.emptyReason).toMatch(/fault/)
  })

  // The four the platform serves, and only those: everything else is still a
  // fixture, and a path invented for one would 404 on open.
  it('maps exactly the four reports atelier-api answers', () => {
    expect(liveReportPath('brandtype')).toBe('/admin/reports/product-performance')
    expect(liveReportPath('notinvoiced')).toBe('/admin/reports/not-invoiced')
    expect(liveReportPath('stock')).toBe('/admin/reports/stock')
    expect(liveReportPath('orders')).toBe('/admin/reports/revenue-lines')
    for (const key of ['owner', 'account', 'designsales', 'purchases', 'zerocost', 'margin', 'shipment', 'inwards', 'delivery']) {
      expect(liveReportPath(key)).toBe(null)
    }
    expect(liveReportPath('nope')).toBe(null)
  })

  // R-13 is served by the platform or not at all. buildReport must answer it
  // with the empty shape rather than throwing on a missing builder — the export
  // buttons and the leak sweep both walk every report the library lists.
  it('has no fixture behind the orders report, and does not crash looking for one', () => {
    expect(hasFixture('orders')).toBe(false)
    expect(REPORTS.filter((r) => !hasFixture(r.key)).map((r) => r.key)).toEqual(['orders'])
    const table = buildReport({ report: 'orders', period: 'FY', dim: null }, asDirector)
    expect(table.empty).toBe(true)
    expect(table.emptyReason).toMatch(/platform/)
    expect(table.rows).toEqual([])
  })

  it('exports through the same flattener as every other table', () => {
    const { head, rows } = exportRows(buildLiveReport(payload()))
    expect(head).toEqual(['House', 'Design', 'Currency', 'Orders', 'Sales'])
    expect(rows).toHaveLength(3)
    expect(rows[0][4]).toBe('1,250.00')
  })

  // A design name typed as a formula is live code the moment Excel opens the file.
  // atelier-api's own writer neutralises it; this screen's export writes the same
  // rows, so it has to as well — the guard is widened in one place or not at all.
  it('neutralises a formula lead-in on the way into a CSV', () => {
    const { head, rows } = exportRows(buildLiveReport(payload()))
    const csv = toCSV(head, rows)
    expect(csv).toContain('"\'=SUM(A1:A9)"')
    expect(csv).not.toContain('"=SUM(A1:A9)"')
  })

  // "We should be able to click and see what orders were placed" — an aggregate
  // row leads to R-13 carrying its own dimension.
  it('leads a product-performance row to the orders report, filtered to its category', () => {
    const table = buildLiveReport(payload({
      rows: [{ brand_name: 'Larsen', product_name: 'Atlas', category: 'wallpaper', currency: 'NZD', orders: 1, value_cents: 4997 }],
    }))
    expect(table.rows[0].link).toBe('/reporting/library?r=orders&category=wallpaper')
    // The totals row is every order at once — the list the reader already has.
    expect(table.rows[table.rows.length - 1].link).toBeUndefined()
  })

  // The figure being clicked was produced under the bar's filters as well as
  // under the row's own dimension. Dropped, an August NZ$1,200 row opened every
  // wallpaper line the platform holds across all time, presented as the orders
  // behind that August number — a wrong answer, not a missing feature.
  it('carries the filters that produced the figure into the drill-down', () => {
    const table = buildLiveReport(payload({
      rows: [{ brand_name: 'Larsen', product_name: 'Atlas', category: 'wallpaper', currency: 'NZD', orders: 1, value_cents: 120000 }],
      meta: {
        ...payload().meta,
        filters: { from: '2026-08-01', to: '2026-08-31', brand_code: 'CF', range: 'RAMM, SON & CROCKER' },
      },
    }))
    // The destination's own bar reads them straight back out — the round trip
    // the screen actually makes when the link lands.
    const applied = reportFiltersFromParams(new URLSearchParams(table.rows[0].link.split('?')[1]))
    expect(applied).toEqual({
      category: 'wallpaper',
      from: '2026-08-01',
      to: '2026-08-31',
      brand_code: 'CF',
      range: 'RAMM, SON & CROCKER',
    })
  })

  it('names the report and applies nothing that was not applied', () => {
    const table = buildLiveReport(payload({
      rows: [{ brand_name: 'Larsen', category: 'cushion', currency: 'NZD', orders: 1, value_cents: 4997 }],
      // `brand` is a filter the bar has no box for, and the API sends it as an
      // array; it must not travel, or the bar would draw a filter it cannot show.
      meta: { ...payload().meta, filters: { from: '2026-08-01', brand: ['larsen'] } },
    }))
    expect(table.rows[0].link).toBe('/reporting/library?r=orders&category=cushion&from=2026-08-01')
  })
})

// ---- the drill-down (Userback 8287873) -----------------------------------------
describe('reportRowLink — where a row leads', () => {
  // Every report grained by an order line carries `order_number` (not-invoiced
  // and revenue-lines both), so the rule reads the ROW rather than the report.
  it('takes an order-line row to the order desk, filtered to that order', () => {
    expect(reportRowLink('revenue-lines', { order_number: 'ATL-1042', category: 'fabric' }))
      .toBe('/admin/orders?q=ATL-1042')
    expect(reportRowLink('not-invoiced', { order_number: 'ATL-1042' }))
      .toBe('/admin/orders?q=ATL-1042')
  })

  // The order number is the endpoint's `q` value: it reaches the URL as a
  // parameter, and a number carrying a slash or an ampersand would otherwise
  // arrive as a different search or as two.
  it('encodes the order number rather than joining it in by hand', () => {
    expect(reportRowLink('revenue-lines', { order_number: 'SO/26 & 27' }))
      .toBe('/admin/orders?q=SO%2F26%20%26%2027')
  })

  // Category is the only filterable dimension a product-performance row carries
  // — atelier-api gives no report a brand_code or range COLUMN — so an
  // uncategorised row leads nowhere rather than to an unfiltered list.
  it('takes an aggregate row to the orders report with its category applied', () => {
    expect(reportRowLink('product-performance', { brand_name: 'Larsen', category: 'trimming' }))
      .toBe('/reporting/library?r=orders&category=trimming')
    expect(reportRowLink('product-performance', { brand_name: 'Larsen', category: null })).toBe('')
    expect(reportRowLink('product-performance', { brand_name: 'Larsen' })).toBe('')
  })

  it('leaves a row with nothing behind it unlinked', () => {
    expect(reportRowLink('stock', { sku: 'PF-ATL-04', qty_available: 12 })).toBe('')
    expect(reportRowLink('revenue-lines', { order_number: '   ' })).toBe('')
    expect(reportRowLink('revenue-lines', null)).toBe('')
  })

  // A demo table is fixtures and has no orders behind it; the screen renders a
  // plain row for anything with no link, so the two must stay distinguishable.
  it('leaves every fixture row unlinked', () => {
    const table = buildReport({ report: 'notinvoiced', period: 'FY', dim: null }, asDirector)
    table.rows.forEach((row) => expect(row.link).toBeUndefined())
  })
})
