import { describe, it, expect } from 'vitest'
import { buildReport, exportRows, periodFactor, reportDef } from './reportBuilders.js'
import {
  REPORTS, ownerSummary, FY_TOTAL, FY_TOTAL_PRIOR, STOCK_VALUATION,
  ownerByRange, brandTypes, designSales, OTHER_DESIGNS, SALES_YEARS, stockLines,
} from '../data/reportLibrary.js'
import { USERS, accessOf } from '../auth/roles.js'
import { canViewReport, reportDenialReason } from '../auth/reportPolicy.js'

// buildReport defaults to NO_ACCESS, so every table below states the role it exercises.
// Liz is the Director (owner:null — see the R-01 scoping tests); Rebecca is the User;
// Showroom is the shared login A6 has no person to attribute to.
const userOf = (id) => USERS.find((u) => u.id === id)
const asDirector = accessOf(userOf('liz'))
const asUser = accessOf(userOf('rebecca'))
const asShowroom = accessOf(userOf('showroom'))

const allStates = REPORTS.flatMap((r) =>
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
