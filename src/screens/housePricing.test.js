import { describe, expect, it } from 'vitest'
import {
  PARAMETER_FIELDS,
  buildSaveBody,
  canApply,
  changeValueText,
  discountNote,
  draftFrom,
  fillSummaryText,
  freightNote,
  groupChanges,
  housePricingPath,
  houseReportRows,
  importFileProblem,
  importPath,
  importRefusal,
  importSummaryLine,
  localToday,
  placeholderFor,
  reportSections,
} from './housePricing.js'

// GET /admin/pricing/houses/:id as the API answers it for a house with its own
// figures, a supplier default under them, and a flat discount.
const pricing = {
  house: { id: 7, name: 'BROCHIER', supplier_id: 3, supplier_name: 'Brochier' },
  parameters: {
    duty_percent_a: 5, duty_percent_b: 5, duty_percent_c: 5, clearance_percent: 10,
    trade_markup_percent: 92, fx_margin_percent: null, handling: null,
    surcharge_min_qty: 5, surcharge_per_unit: 20, note: 'From the Dynamics parameter export (range BROCHIER)',
  },
  supplier_parameters: { fx_margin_percent: 3, handling: 1.5 },
  discount: { percent: 0, source: 'house', shape: 'flat', editable: true, reason: null },
  freight: { rate: 50, basis: 'dollar', unit: 'metre', effective_from: '2026-09-25', note: null },
  supplier_freight: null,
  freight_unit_hint: 'metre',
}

describe('paths', () => {
  it('reads and writes one house, and uploads the export with its options', () => {
    expect(housePricingPath(7)).toBe('/admin/pricing/houses/7')
    expect(importPath('validate')).toBe('/admin/pricing/houses/import/validate')
    expect(importPath('apply', { overwrite: true, filename: 'Active Tracking Options 25-09-2026 10-58-14 AM.xlsx' })).toBe(
      '/admin/pricing/houses/import/apply?overwrite=true&filename=Active+Tracking+Options+25-09-2026+10-58-14+AM.xlsx'
    )
    // A path separator never reaches the API's filename pattern.
    expect(importPath('validate', { filename: 'C:\\exports/x.xlsx' })).toBe('/admin/pricing/houses/import/validate?filename=C%3Aexportsx.xlsx')
  })
})

describe('draftFrom', () => {
  it("starts from the house's OWN figures — an inherited value is a placeholder, never a typed one", () => {
    const draft = draftFrom(pricing, '2026-09-26')
    expect(draft).toMatchObject({
      duty_percent_a: '5', trade_markup_percent: '92', surcharge_min_qty: '5', surcharge_per_unit: '20',
      fx_margin_percent: '', handling: '', discount_percent: '0',
      freight_rate: '50', freight_unit: 'metre', freight_from: '2026-09-26',
    })
    expect(placeholderFor('fx_margin_percent', pricing)).toBe('3 (supplier default)')
    expect(placeholderFor('clearance_percent', pricing)).toBe('')
  })

  it("leaves the discount blank when the house only inherits its supplier's rate, and takes the freight unit from its price lines", () => {
    const bare = {
      ...pricing,
      parameters: null,
      discount: { percent: 12.5, source: 'supplier', shape: 'none', editable: true, reason: null },
      freight: null,
      supplier_freight: { rate: 30, basis: 'dollar', unit: 'roll', effective_from: '2026-01-01' },
      freight_unit_hint: 'roll',
    }
    const draft = draftFrom(bare, '2026-09-26')
    expect(draft.discount_percent).toBe('')
    expect(draft.duty_percent_a).toBe('')
    expect(draft.freight_rate).toBe('')
    expect(draft.freight_unit).toBe('roll')
    expect(placeholderFor('discount_percent', bare)).toBe("12.5 (supplier's averaged rate)")
    expect(placeholderFor('freight_rate', bare)).toBe('$30 / roll (supplier rate)')
    expect(freightNote(bare)).toMatch(/supplier's \$30 \/ roll applies/)
  })
})

describe('buildSaveBody', () => {
  const draft = () => draftFrom(pricing, '2026-09-26')

  it('sends the whole parameter set (PUT) and leaves the discount and freight out when untouched', () => {
    const { body, error } = buildSaveBody(pricing, draft())
    expect(error).toBe(null)
    expect(Object.keys(body.parameters)).toEqual([...PARAMETER_FIELDS.map((f) => f.key), 'note'])
    expect(body.parameters).toMatchObject({ duty_percent_a: 5, surcharge_per_unit: 20, fx_margin_percent: null })
    expect(body).not.toHaveProperty('discount_percent')
    expect(body).not.toHaveProperty('freight')
  })

  it('clears a blank field rather than dropping it, and refuses a word or a negative', () => {
    expect(buildSaveBody(pricing, { ...draft(), clearance_percent: '  ' }).body.parameters.clearance_percent).toBe(null)
    expect(buildSaveBody(pricing, { ...draft(), duty_percent_b: 'five' }).error).toBe('Duty B must be a number.')
    expect(buildSaveBody(pricing, { ...draft(), surcharge_per_unit: '-1' }).error).toBe('Surcharge cannot be negative.')
  })

  it('sends a changed discount, a cleared one as null, and refuses 100%', () => {
    expect(buildSaveBody(pricing, { ...draft(), discount_percent: '25' }).body.discount_percent).toBe(25)
    expect(buildSaveBody(pricing, { ...draft(), discount_percent: '' }).body.discount_percent).toBe(null)
    expect(buildSaveBody(pricing, { ...draft(), discount_percent: '100' }).error).toMatch(/below 100/)
  })

  it("will not touch a discount the house cannot write here — a chain lives on the supplier's terms", () => {
    const chained = {
      ...pricing,
      discount: { percent: 64, source: 'house', shape: 'chain', editable: false, reason: "This house is on a compounded discount chain. Edit it on the supplier's terms." },
    }
    const untouched = buildSaveBody(chained, draftFrom(chained))
    expect(untouched.error).toBe(null)
    expect(untouched.body).not.toHaveProperty('discount_percent')
    expect(buildSaveBody(chained, { ...draftFrom(chained), discount_percent: '50' }).error).toMatch(/compounded discount chain/)
    expect(discountNote(chained.discount)).toMatch(/supplier's terms/)
  })

  it('sends a new freight rate with its unit and day, and never asks the ledger to forget one', () => {
    expect(buildSaveBody(pricing, { ...draft(), freight_rate: '55' }).body.freight).toEqual({
      rate: 55, unit: 'metre', effective_from: '2026-09-26',
    })
    // The unit alone changing is a new rate too.
    expect(buildSaveBody(pricing, { ...draft(), freight_unit: 'yard' }).body.freight).toMatchObject({ rate: 50, unit: 'yard' })
    expect(buildSaveBody(pricing, { ...draft(), freight_rate: '' }).error).toMatch(/cannot be cleared/)
    expect(buildSaveBody({ ...pricing, freight: null }, { ...draft(), freight_rate: '30', freight_unit: '' }).error).toMatch(/per — metre/)
    expect(buildSaveBody(pricing, { ...draft(), freight_rate: '55', freight_from: '' }).error).toMatch(/takes effect/)
  })

  it('reads a percent-basis rate back without appending a dollar one', () => {
    const percent = { ...pricing, freight: { rate: 8, basis: 'percent', unit: null, effective_from: '2026-01-01' } }
    const d = draftFrom(percent, '2026-09-26')
    expect(d.freight_unit).toBe('')
    expect(buildSaveBody(percent, d).body).not.toHaveProperty('freight')
    expect(buildSaveBody(percent, { ...d, freight_unit: 'metre' }).body.freight).toMatchObject({ rate: 8, unit: 'metre' })
    expect(freightNote(percent)).toMatch(/8% of the duty-paid value/)
  })
})

describe('the upload', () => {
  it('asks for the .xlsx as Dynamics saved it', () => {
    expect(importFileProblem(null)).toMatch(/Choose/)
    expect(importFileProblem({ name: 'export.csv', size: 10 })).toMatch(/not an .xlsx/)
    expect(importFileProblem({ name: 'Active Tracking Options.xlsx', size: 0 })).toBe('That file is empty.')
    expect(importFileProblem({ name: 'Active Tracking Options.xlsx', size: 3 * 1024 * 1024 })).toMatch(/2 MB/)
    expect(importFileProblem({ name: 'Active Tracking Options 25-09-2026.XLSX', size: 16713 })).toBe(null)
  })

  const result = {
    dry_run: true,
    ranges: 61,
    houses_matched: 2,
    values_filled: 2,
    values_replaced: 0,
    values_kept: 1,
    changes: [
      { brand_id: 1, brand: 'ALPAKA', range: 'ALPAKA', field: 'freight', from: null, to: 25, unit: 'metre', from_unit: null, kind: 'fill' },
      { brand_id: 2, brand: 'ALTAGAMMA', range: 'ALTAGAMMA', field: 'discount_percent', from: 0, to: 50, kind: 'kept' },
      { brand_id: 1, brand: 'ALPAKA', range: 'ALPAKA', field: 'surcharge_per_unit', from: null, to: 20, kind: 'fill' },
    ],
    reports: {
      rangesWithoutBrand: [{ range: 'Miscellaneous', supplier: null }],
      termsAlreadyOnFile: [],
      freightWithoutUnit: [{ brand: 'HOULES', range: 'HOULES', rate: 30 }],
    },
  }

  it('groups the changes by house and prints each value in its own unit', () => {
    const houses = groupChanges(result.changes)
    expect(houses.map((h) => [h.brand, h.lines.length])).toEqual([['ALPAKA', 2], ['ALTAGAMMA', 1]])
    expect(changeValueText(result.changes[0], 'to')).toBe('$25 / metre')
    expect(changeValueText(result.changes[0], 'from')).toBe('—')
    expect(changeValueText(result.changes[1], 'to')).toBe('50%')
    expect(changeValueText(result.changes[2], 'to')).toBe('$20')
    expect(changeValueText({ field: 'surcharge_min_qty', to: 5 }, 'to')).toBe('5')
  })

  it('reads a house’s fills as one line and keeps every decision on its own row', () => {
    const [alpaka, altagamma] = groupChanges(result.changes)
    const rows = houseReportRows(alpaka)
    expect(rows.fills).toHaveLength(2)
    expect(rows.decisions).toHaveLength(0)
    expect(fillSummaryText(rows.fills)).toBe('Freight $25 / metre · Surcharge $20')
    expect(houseReportRows(altagamma).decisions.map((l) => l.kind)).toEqual(['kept'])
  })

  it('says what a run would do, lists only the reports with rows, and offers Apply only when something would be written', () => {
    expect(importSummaryLine(result)).toBe('2 houses matched of 61 ranges · 2 to fill · 0 to replace · 1 kept')
    expect(importSummaryLine({ ...result, dry_run: false })).toBe('2 houses matched of 61 ranges · 2 filled · 0 replaced · 1 kept')
    expect(reportSections(result.reports).map((s) => [s.key, s.rows.length])).toEqual([
      ['rangesWithoutBrand', 1],
      ['freightWithoutUnit', 1],
    ])
    expect(canApply(result)).toBe(true)
    expect(canApply({ ...result, values_filled: 0 })).toBe(false)
    expect(canApply({ ...result, dry_run: false })).toBe(false)
  })

  it("turns the API's per-cell refusal into a report, and leaves every other error to the error line", () => {
    const refusal = importRefusal({ status: 422, body: { message: '1 cell could not be read.', errors: ['x.xlsx:4: trade_markup: bad'], error_count: 1 } })
    expect(refusal).toEqual({ message: '1 cell could not be read.', errors: ['x.xlsx:4: trade_markup: bad'], errorCount: 1 })
    expect(importRefusal({ status: 403, body: {} })).toBe(null)
  })

  it('dates a new rate by the office calendar, not UTC', () => {
    expect(localToday(new Date(2026, 8, 26, 9, 30))).toBe('2026-09-26')
  })
})
