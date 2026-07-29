// Adversarial sweep over the report gate.
//
// The other tests check each rule in isolation; this one asks the only question that
// matters end to end: across EVERY report × EVERY view × EVERY seeded login, does any
// withheld figure survive into what the reader actually gets — the screen table AND
// the CSV/print export? It greps the flattened output for the literal figures rather
// than trusting the policy, so a new report, a new column, or a builder that stops
// routing through applyReportAccess fails here instead of on stage.
//
// Every leak the first cut of the gate shipped was of exactly this shape: a figure
// that was masked in one place and printed in another.
import { describe, it, expect } from 'vitest'
import { USERS, accessOf } from './roles.js'
import { canViewReport, reportDesc } from './reportPolicy.js'
import { buildReport, exportRows } from '../utils/reportBuilders.js'
import { REPORTS } from '../data/reportLibrary.js'

const userOf = (id) => USERS.find((u) => u.id === id)

// Figures that must never reach a login without finance.view.
const COST_FIGURES = [
  'NZ$104.60', 'NZ$118.20', 'NZ$71.80', 'NZ$62.40', // R-10 landed /m
  'NZ$13,850',                                      // STOCK_VALUATION
  '€980', '€12,140', '£3,640', '€6,220', 'US$7,890', // R-07 supplier PO values
  '18.5%', '25.4%', '74.1%', '75.7%',               // R-04 margins
  'Under 30%', 'Over 70%',                          // R-04 band, stated in words
]

// The all-company FY figure, which own-sales scoping exists to withhold.
const ALL_COMPANY = ['NZ$1,730k', 'NZ$1,613k']

const flatten = (table) => {
  if (!table || table.empty) return ''
  const { head, rows } = exportRows(table)
  return [head.join('|'), ...rows.map((r) => r.join('|')), table.note || ''].join('\n')
}

// Everything a login can actually pull out of the library: every report it may open,
// every view of it, as both screen table and export.
function everythingVisibleTo(id) {
  const access = accessOf(userOf(id))
  let out = ''
  for (const def of REPORTS) {
    if (!canViewReport(access, def.key)) continue
    out += '\n' + reportDesc(def, access)
    for (const [dimKey] of def.dims || [[null]]) {
      const t = buildReport({ report: def.key, period: 'FY', dim: dimKey, brand: 'Pierre Frey' }, access)
      out += '\n' + flatten(t)
    }
  }
  return out
}

describe('LEAK SWEEP — what a User role can actually read', () => {
  it('no cost figure survives anywhere in any report or export', () => {
    const seen = everythingVisibleTo('rebecca')
    const leaked = COST_FIGURES.filter((f) => seen.includes(f))
    expect(leaked).toEqual([])
  })

  it('the all-company FY figure never reaches a scoped reader', () => {
    const seen = everythingVisibleTo('rebecca')
    const leaked = ALL_COMPANY.filter((f) => seen.includes(f))
    expect(leaked).toEqual([])
  })

  it('a scoped reader sees no other salesperson’s name in a figures table', () => {
    const access = accessOf(userOf('rebecca'))
    const t = buildReport({ report: 'owner', period: 'FY', dim: 'supplier' }, access)
    const flat = flatten(t)
    expect(flat).not.toContain('Jenette')
    expect(flat).not.toContain('Charlotte')
    expect(flat).toContain('Rebecca')
  })

  it('the shared Showroom login gets an explained empty state, not a crash or a table', () => {
    const access = accessOf(userOf('showroom'))
    for (const dim of ['summary', 'supplier', 'range', 'territory']) {
      const t = buildReport({ report: 'owner', period: 'FY', dim }, access)
      expect(t.empty).toBe(true)
      expect(t.emptyReason).toMatch(/A6/)
      expect(t.rows).toEqual([])
    }
  })

  it('a Director still reads everything — the gate did not eat the product', () => {
    const seen = everythingVisibleTo('liz')
    expect(seen).toContain('NZ$13,850')  // stock valuation
    expect(seen).toContain('NZ$1,730k')  // company FY
    expect(seen).toContain('Under 30%')  // margin band pill
    expect(REPORTS.every((d) => canViewReport(accessOf(userOf('liz')), d.key))).toBe(true)
  })

  it('Finance reads every report too, differing from Director only in user admin', () => {
    expect(REPORTS.every((d) => canViewReport(accessOf(userOf('charlotte')), d.key))).toBe(true)
    expect(everythingVisibleTo('charlotte')).toContain('NZ$13,850')
  })

  it('every masked table keeps cells and columns in lockstep', () => {
    for (const id of ['rebecca', 'showroom', 'liz', 'charlotte']) {
      const access = accessOf(userOf(id))
      for (const def of REPORTS) {
        if (!canViewReport(access, def.key)) continue
        for (const [dimKey] of def.dims || [[null]]) {
          const t = buildReport({ report: def.key, period: 'FY', dim: dimKey, brand: 'Pierre Frey' }, access)
          t.rows.forEach((r) => expect(r.cells.length).toBe(t.cols.length))
        }
      }
    }
  })
})
