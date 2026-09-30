import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  APPEND_NOTE,
  BASES,
  CATEGORY_VALUES,
  FREIGHT_ROUTE,
  NEW_FREIGHT_RATE_ROUTE,
  RATES_PATH,
  REPORT,
  SCOPE,
  SHEET_FILENAME,
  appliedNote,
  canApply,
  cappedNote,
  categoryLabel,
  describeChange,
  freightClassLabel,
  fileProblem,
  filenameFrom,
  groupRates,
  ledgerNote,
  newRateDraft,
  overflowNote,
  rateBody,
  rateFigure,
  rateListFilters,
  readLedger,
  refusalFrom,
  scopeOf,
  summaryLine,
  supplierOptions,
  houseOptions,
} from './adminFreight.js'

describe('the vocabularies mirror the API', () => {
  it('offers dollar FIRST — the default and the recommendation (C19, FR-186)', () => {
    expect(BASES[0]).toBe('dollar')
    expect(BASES).toEqual(['dollar', 'percent'])
  })

  it('carries every real category', () => {
    expect(CATEGORY_VALUES).toEqual([
      'fabric', 'wallpaper', 'trimming', 'accessory',
      'bed-linen', 'towel', 'cushion', 'throw', 'misc',
    ])
  })
})

describe('newRateDraft', () => {
  // 1 Oct 2026: a rate carries no unit; the product does.
  it('opens on dollar, with no unit to choose', () => {
    const draft = newRateDraft()
    expect(draft.basis).toBe('dollar')
    expect(draft).not.toHaveProperty('unit')
    // Freight is set per house, so the form opens on the house scope.
    expect(draft.scope).toBe(SCOPE.range)
  })
})

describe('rateBody', () => {
  const dollar = (over = {}) => ({
    ...newRateDraft(),
    scope: SCOPE.supplier,
    supplier_id: '12',
    rate: '35',
    effective_from: '2026-07-01',
    ...over,
  })

  it('builds a supplier-scoped dollar rate, sending exactly one scope key', () => {
    const built = rateBody(dollar({ category: 'wallpaper', note: '  Annual uplift letter ' }))
    expect(built).toEqual({
      body: {
        supplier_id: 12,
        category: 'wallpaper',
        basis: 'dollar',
        rate: 35,
        effective_from: '2026-07-01',
        note: 'Annual uplift letter',
      },
    })
    // The POST schema has no nullable scope types — a null range_name would
    // 400, so the other scope key must be ABSENT, not null.
    expect('range_name' in built.body).toBe(false)
  })

  it('builds a range-scoped rate from the free-text spelling', () => {
    const built = rateBody(dollar({ scope: SCOPE.range, range_name: '  HAMAM ', supplier_id: '' }))
    expect(built.body.range_name).toBe('HAMAM')
    expect('supplier_id' in built.body).toBe(false)
  })

  it('requires the scope it is on — the CHECK, mirrored', () => {
    expect(rateBody(dollar({ supplier_id: '' })).error).toMatch(/supplier/i)
    expect(rateBody(dollar({ supplier_id: 'x' })).error).toMatch(/supplier/i)
    expect(rateBody(dollar({ scope: SCOPE.range, range_name: '   ' })).error).toMatch(/house/i)
  })

  it('omits category for "every category" — a NULL column, never an empty enum', () => {
    const built = rateBody(dollar())
    expect('category' in built.body).toBe(false)
  })

  it('never sends a unit, whatever the draft holds', () => {
    expect(rateBody(dollar({ unit: 'roll' })).body).not.toHaveProperty('unit')
    const built = rateBody(dollar({ basis: 'percent', rate: '8' }))
    expect(built).toEqual({
      body: {
        supplier_id: 12,
        basis: 'percent',
        rate: 8,
        effective_from: '2026-07-01',
      },
    })
  })

  it('refuses a rate that is not a number of zero or more', () => {
    expect(rateBody(dollar({ rate: '' })).error).toMatch(/zero or more/)
    expect(rateBody(dollar({ rate: '-2' })).error).toMatch(/zero or more/)
    expect(rateBody(dollar({ rate: 'ten' })).error).toMatch(/zero or more/)
  })

  it('accepts a zero rate — genuinely free freight is a statement, not a miss', () => {
    expect(rateBody(dollar({ rate: '0' })).body.rate).toBe(0)
  })

  it('sends the rate as a NUMBER, never the typed string', () => {
    expect(rateBody(dollar({ rate: ' 2.5 ' })).body.rate).toBe(2.5)
  })

  it('requires the effective day', () => {
    expect(rateBody(dollar({ effective_from: '' })).error).toMatch(/date/i)
    expect(rateBody(dollar({ effective_from: '01/07/2026' })).error).toMatch(/date/i)
  })

  it('omits a blank note rather than sending an empty string', () => {
    expect('note' in rateBody(dollar()).body).toBe(false)
  })
})

describe('rateListFilters', () => {
  it('hands empties through for buildListQuery to drop', () => {
    // `category=` would fail the API's enum and kill the whole list — the kit's
    // buildListQuery drops empty strings, so the filter shape just passes them.
    expect(rateListFilters({})).toEqual({ supplier_id: '', range_name: '', category: '' })
    expect(rateListFilters({ supplierId: '12', category: 'fabric' })).toEqual({
      supplier_id: '12',
      range_name: '',
      category: 'fabric',
    })
  })
})

describe('readLedger', () => {
  it('keeps the meta — the append-only note rides on it', () => {
    const body = {
      rates: [{ id: 1 }],
      meta: { total: 7, note: 'Append-only.' },
    }
    expect(readLedger(body)).toEqual({
      rates: [{ id: 1 }],
      total: 7,
      meta: { total: 7, note: 'Append-only.' },
    })
  })

  it('reads an empty or malformed envelope as an empty ledger', () => {
    expect(readLedger(null)).toEqual({ rates: [], total: 0, meta: null })
    expect(readLedger({ rates: [{ id: 2 }] })).toEqual({
      rates: [{ id: 2 }],
      total: 1,
      meta: null,
    })
  })
})

describe('supplierOptions', () => {
  it('keeps the API order and drops a row that could not be posted', () => {
    const options = supplierOptions([
      { id: 3, name: 'Dedar' },
      { name: 'No id' },
      { id: 9, name: '  ' },
    ])
    expect(options).toEqual([
      { id: 3, name: 'Dedar' },
      { id: 9, name: 'Supplier #9' },
    ])
  })
})

describe('scopeOf and groupRates', () => {
  const names = new Map([[12, 'Garrett Leather']])
  const RATES = [
    { id: 5, supplier_id: 12, range_name: null, effective_from: '2026-07-01' },
    { id: 4, supplier_id: null, range_name: 'HAMAM', effective_from: '2026-06-01' },
    { id: 3, supplier_id: 12, range_name: null, effective_from: '2025-07-01' },
    { id: 2, supplier_id: null, range_name: 'Hamam', effective_from: '2025-06-01' },
  ]

  it('names a supplier scope from the roster, or by number when it is not there', () => {
    expect(scopeOf(RATES[0], names).label).toBe('Garrett Leather')
    expect(scopeOf({ supplier_id: 99 }, names).label).toBe('Supplier #99')
    expect(scopeOf(RATES[1]).label).toBe('HAMAM')
  })

  it('folds range spellings together, as the unique index does', () => {
    expect(scopeOf({ range_name: 'HAMAM' }).key).toBe(scopeOf({ range_name: 'Hamam' }).key)
  })

  it('cannot collide a range named "12" with supplier 12', () => {
    expect(scopeOf({ supplier_id: 12 }).key).not.toBe(scopeOf({ range_name: '12' }).key)
  })

  it('groups in first-appearance order, keeping newest-first inside a group', () => {
    const groups = groupRates(RATES, names)
    expect(groups.map((group) => group.label)).toEqual(['Garrett Leather', 'HAMAM'])
    expect(groups[0].kind).toBe(SCOPE.supplier)
    expect(groups[0].rates.map((rate) => rate.id)).toEqual([5, 3])
    // Two casings of one range are one house — one group, both rows.
    expect(groups[1].rates.map((rate) => rate.id)).toEqual([4, 2])
  })
})

describe('rateFigure and categoryLabel', () => {
  it('quotes a dollar rate as a figure, narrowing pg numeric strings', () => {
    expect(rateFigure({ basis: 'dollar', rate: '35.0000' })).toBe('NZD 35')
    expect(rateFigure({ basis: 'percent', rate: '8.0000' })).toBe('8%')
  })

  it('never prints a NULL category as "null"', () => {
    expect(categoryLabel(null)).toBe('all')
    expect(categoryLabel('fabric')).toBe('fabric')
  })
})

describe('ledgerNote', () => {
  it('prefers the API’s own sentence — one author for the append-only rule', () => {
    expect(ledgerNote({ note: 'Append-only: correct by dating a new rate.' })).toBe(
      'Append-only: correct by dating a new rate.'
    )
  })

  it('falls back to its own copy when the meta carries none', () => {
    expect(ledgerNote(null)).toBe(APPEND_NOTE)
    expect(ledgerNote({ note: '  ' })).toBe(APPEND_NOTE)
  })
})

describe('overflowNote', () => {
  it('says when the cap hid rows, and stays silent while it holds', () => {
    expect(overflowNote(612, 500)).toMatch(/newest 500 of 612/)
    expect(overflowNote(120, 500)).toBeNull()
    expect(overflowNote(undefined, 500)).toBeNull()
  })
})

describe('the sheet round trip', () => {
  it('falls back to the API’s own filename when the header is invisible', () => {
    // Content-Disposition is not CORS-safelisted, so cross-origin this is null.
    expect(filenameFrom(null)).toBe(SHEET_FILENAME)
    expect(filenameFrom('attachment; filename="atelier-freight-rates.csv"')).toBe(
      'atelier-freight-rates.csv'
    )
    expect(filenameFrom('attachment; filename="../../etc/passwd"')).toBe(SHEET_FILENAME)
  })

  it('refuses an Excel workbook and anything past the 2 MB body limit', () => {
    expect(fileProblem({ name: 'rates.xlsx', size: 4096 })).toMatch(/Excel workbook/)
    expect(fileProblem({ name: 'rates.csv', size: 0 })).toMatch(/empty/)
    expect(fileProblem({ name: 'rates.csv', size: 3 * 1024 * 1024 })).toMatch(/2 MB/)
    expect(fileProblem({ name: 'atelier-freight-rates.csv', size: 4096 })).toBeNull()
    expect(fileProblem(null)).toMatch(/Choose the filled-in sheet/)
  })

  it('reads the counts in the append-only vocabulary — created, never changed', () => {
    expect(
      summaryLine({ rows: 6, skipped: 1, repeats: 1, unchanged: 2, created: 2 })
    ).toBe('6 rows read · 1 left blank · 1 repeated · 2 already on the ledger · 2 rates to append')
    expect(summaryLine({ rows: 3, unchanged: 3, created: 0 })).toBe(
      '3 rows read · 3 already on the ledger · nothing to append'
    )
    expect(summaryLine(null)).toBe('')
  })

  it('describes a pending append as a person reads it', () => {
    expect(
      describeChange({
        row: 3,
        scope: 'supplier 12',
        category: null,
        basis: 'dollar',
        rate: 10,
        effective_from: '2026-07-01',
      })
    ).toBe('Row 3 · supplier 12 — all · NZD 10 from 2026-07-01')
  })

  it('reads a 422 refusal, keeping the row numbers', () => {
    const refusal = refusalFrom({
      status: 422,
      body: {
        message: '2 rows could not be read. Nothing has been written.',
        errors: [{ row: 4, message: 'Rates are append-only — date the correction.' }],
        error_count: 2,
        summary: { rows: 5 },
      },
    })
    expect(refusal.errors).toHaveLength(1)
    expect(refusal.errorCount).toBe(2)
    expect(refusal.message).toMatch(/Nothing has been written/)
  })

  it('leaves a 400 (not a rate sheet at all) to the ordinary error line', () => {
    expect(refusalFrom({ status: 400, body: { message: 'The file is empty.' } })).toBeNull()
    expect(refusalFrom({ status: 422, body: { message: 'x', errors: [] } })).toBeNull()
    expect(refusalFrom(null)).toBeNull()
  })

  it('offers Apply only after a CLEAN dry run, and retires it once applied', () => {
    expect(canApply({ kind: REPORT.clean })).toBe(true)
    expect(canApply({ kind: REPORT.refused })).toBe(false)
    expect(canApply({ kind: REPORT.applied })).toBe(false)
    expect(canApply(null)).toBe(false)
  })

  it('quotes the transaction’s own count after an apply', () => {
    expect(appliedNote({ applied: 3 })).toBe('3 rates appended to the ledger.')
    expect(appliedNote({ applied: 1 })).toBe('1 rate appended to the ledger.')
    expect(appliedNote({ applied: 0 })).toMatch(/already on the ledger/)
  })

  it('names what a capped list left out', () => {
    expect(cappedNote(50, 214, 'row')).toBe('Showing the first 50 of 214 rows.')
    expect(cappedNote(50, 50, 'row')).toBeNull()
    expect(cappedNote(3, undefined, 'row')).toBeNull()
  })
})

// Appending a rate moved to a page of its own (23 Sep 2026 — the client asked
// for every data-entry form on one). There is no jsdom here, so the move is
// held by reading the two screens.
describe('appending a rate is a page of its own', () => {
  const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
  const LEDGER_SOURCE = read('AdminFreight.jsx')
  const NEW_SOURCE = read('AdminFreightRateNew.jsx')
  const APP_SOURCE = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

  it('lives beside the ledger, apart from the API path', () => {
    expect(FREIGHT_ROUTE).toBe('/admin/freight')
    expect(NEW_FREIGHT_RATE_ROUTE).toBe('/admin/freight/new')
    expect(NEW_FREIGHT_RATE_ROUTE.startsWith(RATES_PATH)).toBe(false)
    expect(APP_SOURCE).toContain('path="/admin/freight/new" element={<AdminFreightRateNew />}')
  })

  it('leaves the ledger with no form that posts a rate', () => {
    expect(LEDGER_SOURCE).not.toContain('showNew')
    expect(LEDGER_SOURCE).not.toContain('rateBody')
    expect(LEDGER_SOURCE).not.toContain('apiSend')
    expect(LEDGER_SOURCE).toContain('to={NEW_FREIGHT_RATE_ROUTE}')
  })

  it('still offers no edit, archive or delete anywhere — the ledger is append-only', () => {
    for (const source of [LEDGER_SOURCE, NEW_SOURCE]) {
      expect(source).not.toContain("'PATCH'")
      expect(source).not.toContain('apiDelete')
      expect(source).not.toContain('/archive')
    }
  })

  it('validates with the live vocabulary and lands back on the ledger', () => {
    expect(NEW_SOURCE).toContain('rateBody(draft, categoryValues)')
    expect(NEW_SOURCE).toContain("apiSend('POST', RATES_PATH, built.body)")
    expect(NEW_SOURCE).toContain('navigate(FREIGHT_ROUTE, { replace: true })')
  })

  it('keeps the StrictMode guard on the roster load', () => {
    expect(NEW_SOURCE).toContain('let active = true')
  })
})

describe('houseOptions', () => {
  it('lists live houses by name, alphabetically, once each', () => {
    expect(
      houseOptions([
        { name: 'Stroheim' },
        { name: 'Boussac' },
        { name: 'Thorp of London', archived_at: '2026-01-01' },
        { name: 'Boussac' },
      ])
    ).toEqual(['Boussac', 'Stroheim'])
    expect(houseOptions(undefined)).toEqual([])
  })
})

describe('freight classes on the ledger', () => {
  const draft = (over) => ({ ...newRateDraft(), range_name: 'FABRICUT', rate: '3', effective_from: '2026-01-01', ...over })

  it('sends a class only when one is chosen, raised to a capital, and refuses anything but one letter', () => {
    expect(rateBody(draft({})).body).not.toHaveProperty('freight_class')
    expect(rateBody(draft({ freight_class: 'b' })).body.freight_class).toBe('B')
    expect(rateBody(draft({ freight_class: 'AB' })).error).toMatch(/not a freight class/)
  })

  it('says which class a ledger row or a sheet change is for, and nothing for every class', () => {
    expect(freightClassLabel('B')).toBe('class B')
    expect(freightClassLabel(null)).toBe('all classes')
    expect(
      describeChange({ row: 3, scope: 'range FABRICUT class B', category: null, freight_class: 'B', basis: 'dollar', rate: 3, effective_from: '2026-01-01' })
    ).toBe('Row 3 · range FABRICUT class B — all · NZD 3 from 2026-01-01')
    expect(describeChange({ row: 2, scope: 'range X', category: null, basis: 'dollar', rate: 23, effective_from: '2026-01-01' })).toBe(
      'Row 2 · range X — all · NZD 23 from 2026-01-01'
    )
  })
})
