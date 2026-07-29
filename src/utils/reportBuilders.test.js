import { describe, it, expect } from 'vitest'
import { buildReport, exportRows, periodFactor, reportDef } from './reportBuilders.js'
import { REPORTS, ownerSummary, FY_TOTAL, STOCK_VALUATION } from '../data/reportLibrary.js'
import { USERS, accessOf } from '../auth/roles.js'
import { canViewReport } from '../auth/reportPolicy.js'

// buildReport defaults to NO_ACCESS, so every table below states the role it exercises.
// Liz is the Director (owner:null — see the R-01 scoping tests); Rebecca is the User;
// Showroom is the shared login A6 has no person to attribute to.
const userOf = (id) => USERS.find((u) => u.id === id)
const asDirector = accessOf(userOf('liz'))
const asUser = accessOf(userOf('rebecca'))
const asShowroom = accessOf(userOf('showroom'))

const allStates = REPORTS.flatMap((r) =>
  (r.dims || [[null]]).map(([dimKey]) => ({ report: r.key, period: 'FY', dim: dimKey, brand: 'Pierre Frey' })))

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
