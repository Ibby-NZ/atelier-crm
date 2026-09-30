import { describe, expect, it } from 'vitest'
import {
  PARAMETER_FIELDS,
  buildSaveBody,
  canRemoveFreightClass,
  pendingRemovalNote,
  withoutFreightClass,
  canApply,
  changeValueText,
  classRemovalNote,
  discountNote,
  draftFrom,
  fillSummaryText,
  freightClassHint,
  freightClassLetters,
  freightNote,
  groupChanges,
  unusedFreightLetters,
  withDiscountClass,
  withDiscountClassField,
  withFreightClass,
  withoutDiscountClass,
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
  freight: { rate: 50, basis: 'dollar', effective_from: '2026-09-25', note: null },
  supplier_freight: null,
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
      freight_rate: '50', freight_from: '2026-09-26',
    })
    expect(draft).not.toHaveProperty('freight_unit')
    expect(placeholderFor('fx_margin_percent', pricing)).toBe('3 (supplier default)')
    expect(placeholderFor('clearance_percent', pricing)).toBe('')
  })

  it("leaves the discount blank when the house only inherits its supplier's rate", () => {
    const bare = {
      ...pricing,
      parameters: null,
      discount: { percent: 12.5, source: 'supplier', shape: 'none', editable: true, reason: null },
      freight: null,
      supplier_freight: { rate: 30, basis: 'dollar', effective_from: '2026-01-01' },
    }
    const draft = draftFrom(bare, '2026-09-26')
    expect(draft.discount_percent).toBe('')
    expect(draft.duty_percent_a).toBe('')
    expect(draft.freight_rate).toBe('')
    expect(placeholderFor('discount_percent', bare)).toBe("12.5 (supplier's averaged rate)")
    expect(placeholderFor('freight_rate', bare)).toBe('$30 (supplier rate)')
    expect(freightNote(bare)).toMatch(/supplier's \$30 applies/)
  })
})

describe('buildSaveBody', () => {
  const draft = () => draftFrom(pricing, '2026-09-26')

  it('sends the whole parameter set (PUT) and leaves the discount and freight out when untouched', () => {
    const { body, error } = buildSaveBody(pricing, draft())
    expect(error).toBe(null)
    expect(Object.keys(body.parameters)).toEqual([...PARAMETER_FIELDS.map((f) => f.key), 'note', 'clearance_basis'])
    // The basis travels on every save (PUT), percent unless the house says dollars.
    expect(body.parameters.clearance_basis).toBe('percent')
    expect(buildSaveBody(pricing, { ...draft(), clearance_basis: 'dollar' }).body.parameters.clearance_basis).toBe('dollar')
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

  // 1 Oct 2026: a rate carries no unit — the product does.
  it('sends a new freight rate with its day and no unit, and never asks the ledger to forget one', () => {
    expect(buildSaveBody(pricing, { ...draft(), freight_rate: '55' }).body.freight).toEqual({
      rate: 55, effective_from: '2026-09-26',
    })
    expect(buildSaveBody(pricing, draft()).body).not.toHaveProperty('freight')
    expect(buildSaveBody(pricing, { ...draft(), freight_rate: '' }).error).toMatch(/cannot be cleared/)
    expect(buildSaveBody({ ...pricing, freight: null }, { ...draft(), freight_rate: '30' }).body.freight).toEqual({
      rate: 30, effective_from: '2026-09-26',
    })
    expect(buildSaveBody(pricing, { ...draft(), freight_rate: '55', freight_from: '' }).error).toMatch(/takes effect/)
  })

  it('reads a percent-basis rate back without appending a dollar one', () => {
    const percent = { ...pricing, freight: { rate: 8, basis: 'percent', effective_from: '2026-01-01' } }
    const d = draftFrom(percent, '2026-09-26')
    expect(buildSaveBody(percent, d).body).not.toHaveProperty('freight')
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
      { brand_id: 1, brand: 'ALPAKA', range: 'ALPAKA', field: 'freight', from: null, to: 25, kind: 'fill' },
      { brand_id: 2, brand: 'ALTAGAMMA', range: 'ALTAGAMMA', field: 'discount_percent', from: 0, to: 50, kind: 'kept' },
      { brand_id: 1, brand: 'ALPAKA', range: 'ALPAKA', field: 'surcharge_per_unit', from: null, to: 20, kind: 'fill' },
    ],
    reports: {
      rangesWithoutBrand: [{ range: 'Miscellaneous', supplier: null }],
      termsAlreadyOnFile: [],
      freightDatedToday: [{ brand: 'HOULES', range: 'HOULES', rate: 30, current: 28 }],
    },
  }

  it('groups the changes by house and prints each value as it is written', () => {
    const houses = groupChanges(result.changes)
    expect(houses.map((h) => [h.brand, h.lines.length])).toEqual([['ALPAKA', 2], ['ALTAGAMMA', 1]])
    expect(changeValueText(result.changes[0], 'to')).toBe('$25')
    expect(changeValueText(result.changes[0], 'from')).toBe('—')
    expect(changeValueText(result.changes[1], 'to')).toBe('50%')
    expect(changeValueText(result.changes[2], 'to')).toBe('$20')
    expect(changeValueText({ field: 'surcharge_min_qty', to: 5 }, 'to')).toBe('5')
    // A freight class from Dynamics' own prices (30 Sep 2026) reads like freight.
    const classLine = { field: 'freight_class_B', from: null, to: 3, kind: 'fill' }
    expect(changeValueText(classLine, 'to')).toBe('$3')
    expect(fillSummaryText([classLine])).toBe('Freight class B $3')
    expect(reportSections({ freightClassUnclear: [{ brand: 'Jim Thompson', letter: 'C', rows: 4 }] })[0].line({ brand: 'Jim Thompson', letter: 'C', rows: 4 }))
      .toBe('Jim Thompson class C: 4 prices')
  })

  it('reads a house’s fills as one line and keeps every decision on its own row', () => {
    const [alpaka, altagamma] = groupChanges(result.changes)
    const rows = houseReportRows(alpaka)
    expect(rows.fills).toHaveLength(2)
    expect(rows.decisions).toHaveLength(0)
    expect(fillSummaryText(rows.fills)).toBe('Freight $25 · Surcharge $20')
    expect(houseReportRows(altagamma).decisions.map((l) => l.kind)).toEqual(['kept'])
  })

  it('says what a run would do, lists only the reports with rows, and offers Apply only when something would be written', () => {
    expect(importSummaryLine(result)).toBe('2 houses matched of 61 ranges · 2 to fill · 0 to replace · 1 kept')
    expect(importSummaryLine({ ...result, dry_run: false })).toBe('2 houses matched of 61 ranges · 2 filled · 0 replaced · 1 kept')
    expect(reportSections(result.reports).map((s) => [s.key, s.rows.length])).toEqual([
      ['rangesWithoutBrand', 1],
      ['freightDatedToday', 1],
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

describe('freight classes and discount classes', () => {
  // Fabricut as the API answers it: a default rate, an A and a B, and price
  // lines on A, B and C; two discount classes, one the default, one chosen by
  // three products.
  const classed = {
    ...pricing,
    freight: { rate: 23, basis: 'dollar', effective_from: '2026-01-01', freight_class: null },
    freight_classes: [
      { freight_class: 'A', rate: 30, basis: 'dollar', effective_from: '2026-01-01' },
      { freight_class: 'B', rate: 3, basis: 'dollar', effective_from: '2026-01-01' },
    ],
    freight_class_lines: [
      { freight_class: 'A', lines: 1240 },
      { freight_class: 'C', lines: 12 },
    ],
    discount: {
      percent: 30, source: 'house', shape: 'tiers', editable: true, reason: null,
      classes: [
        { id: 11, label: 'wallpaper', percent: 40, is_default: false, matches_category: true, products: 0 },
        { id: 12, label: 'All other collections', discount_class: 'B', percent: 50, is_default: true, matches_category: false, products: 3 },
      ],
    },
  }
  const draft = () => draftFrom(classed, '2026-09-26')

  it('draws a row for every letter with a rate or a price line, and the classes as they stand', () => {
    expect(freightClassLetters(classed)).toEqual(['A', 'B', 'C'])
    // At most five classes: a line letter past E gets no row.
    expect(freightClassLetters({ ...classed, freight_class_lines: [{ freight_class: 'F', lines: 2 }] })).toEqual(['A', 'B'])
    expect(draft().freight_classes).toEqual({
      A: { rate: '30' },
      B: { rate: '3' },
      // No rate yet: blank.
      C: { rate: '' },
    })
    expect(draft().discount_classes.map((row) => [row.id, row.label, row.percent, row.is_default])).toEqual([
      [11, 'wallpaper', '40', false],
      [12, 'All other collections', '50', true],
    ])
    expect(freightClassHint(classed, 'A')).toBe('1240 price lines · current $30 from 2026-01-01')
    expect(freightClassHint(classed, 'C')).toBe('12 price lines · pays the house rate')
    expect(freightClassHint(classed, 'B')).toBe('no price lines carry it · current $3 from 2026-01-01')
    expect(unusedFreightLetters(draft())).not.toContain('A')
    expect(unusedFreightLetters(draft())).toContain('D')
    expect(unusedFreightLetters(draft())).not.toContain('F')
  })

  it('sends nothing for classes nobody touched', () => {
    const { body, error } = buildSaveBody(classed, draft())
    expect(error).toBe(null)
    expect(body).not.toHaveProperty('freight_classes')
    expect(body).not.toHaveProperty('discount_classes')
  })

  it('sends each changed or new letter as a dated rate, and refuses to clear one', () => {
    let d = draft()
    d = { ...d, freight_classes: { ...d.freight_classes, B: { rate: '4' }, C: { rate: '5' } } }
    d = withFreightClass(d, 'D')
    expect(buildSaveBody(classed, d).body.freight_classes).toEqual([
      { freight_class: 'B', rate: 4, effective_from: '2026-09-26' },
      { freight_class: 'C', rate: 5, effective_from: '2026-09-26' },
    ])
    expect(buildSaveBody(classed, { ...d, freight_classes: { ...d.freight_classes, A: { rate: '' } } }).error).toMatch(
      /Freight class A cannot be cleared/
    )
  })

  it('sends the discount classes as a whole set once anything changed, and checks them as the API does', () => {
    let d = withDiscountClassField(draft(), 'class-11', 'percent', '42')
    d = withDiscountClassField(d, 'class-11', 'is_default', true)
    d = withoutDiscountClass(d, 'class-12')
    d = withDiscountClass(d)
    const added = d.discount_classes.at(-1).key
    d = withDiscountClassField(withDiscountClassField(d, added, 'label', 'New collections'), added, 'percent', '45')
    expect(buildSaveBody(classed, d).body.discount_classes).toEqual([
      { id: 11, label: 'wallpaper', discount_class: null, percent: 42, is_default: true },
      { label: 'New collections', discount_class: null, percent: 45, is_default: false },
    ])

    // 1 Oct 2026: a class carries the letter products and variations choose;
    // one with only a letter is named after it, and no two share a letter.
    let lettered = withDiscountClass(draft())
    const fresh = lettered.discount_classes.at(-1).key
    lettered = withDiscountClassField(withDiscountClassField(lettered, fresh, 'discount_class', 'C'), fresh, 'percent', '35')
    expect(buildSaveBody(classed, lettered).body.discount_classes.at(-1)).toEqual({
      label: 'C', discount_class: 'C', percent: 35, is_default: false,
    })
    expect(buildSaveBody(classed, withDiscountClassField(draft(), 'class-11', 'discount_class', 'B')).error).toMatch(/Two discount classes are class B/)
    expect(buildSaveBody(classed, draft()).body).not.toHaveProperty('discount_classes')

    expect(buildSaveBody(classed, withDiscountClass(draft())).error).toMatch(/letter or a name/)
    const twin = withDiscountClassField(draft(), 'class-11', 'label', 'ALL OTHER COLLECTIONS')
    expect(buildSaveBody(classed, twin).error).toMatch(/Two discount classes/)
    expect(buildSaveBody(classed, withDiscountClassField(draft(), 'class-11', 'percent', '')).error).toMatch(/needs a percentage/)
    expect(buildSaveBody(classed, withDiscountClassField(draft(), 'class-11', 'percent', '100')).error).toMatch(/below 100/)
    // Removing every class is a real answer: an empty set.
    expect(buildSaveBody(classed, withoutDiscountClass(withoutDiscountClass(draft(), 'class-11'), 'class-12')).body.discount_classes).toEqual([])
  })

  it('keeps the default exclusive, and says what a removal does to the products that chose a class', () => {
    const d = withDiscountClassField(draft(), 'class-11', 'is_default', true)
    expect(d.discount_classes.map((row) => row.is_default)).toEqual([true, false])
    expect(classRemovalNote(classed.discount.classes[1])).toBe(
      '3 products and variations chose class B — removing it sends them back to matching by category and the default.'
    )
    expect(classRemovalNote(classed.discount.classes[0])).toBe('')
    expect(discountNote(classed.discount)).toMatch(/covers every product no class does/)
  })

  it('refuses class edits on a house whose discount is a chain', () => {
    const chained = { ...classed, discount: { ...classed.discount, shape: 'chain', editable: false, reason: 'On a compounded chain.' } }
    expect(buildSaveBody(chained, withDiscountClassField(draftFrom(chained), 'class-11', 'percent', '41')).error).toBe('On a compounded chain.')
  })
})

describe('removing a freight or discount class', () => {
  const withClasses = {
    ...pricing,
    freight_classes: [{ freight_class: 'A', rate: 30, basis: 'dollar', effective_from: '2026-01-01' }],
    freight_class_lines: [{ freight_class: 'A', lines: 4 }, { freight_class: 'B', lines: 2 }],
    discount: { ...pricing.discount, editable: true, classes: [{ id: 7, label: 'Wallpaper', percent: 10, is_default: false }] },
  }

  it('offers Remove where a letter has a rate of its own or was added here, not where only lines carry it', () => {
    expect(canRemoveFreightClass(withClasses, 'A')).toBe(true)
    expect(canRemoveFreightClass(withClasses, 'B')).toBe(false)
    expect(canRemoveFreightClass(withClasses, 'D')).toBe(true)
  })

  it('sends a removed letter, and says what the save will remove until it is pressed', () => {
    const draft = draftFrom(withClasses, '2026-09-28')
    expect(pendingRemovalNote(withClasses, draft)).toBe('')
    const removed = withoutDiscountClass(withoutFreightClass(draft, 'A'), 'class-7')
    expect(pendingRemovalNote(withClasses, removed)).toBe(
      'Removed when you save: freight class A, discount class Wallpaper. Press Save pricing to keep the change.'
    )
    const { body, error } = buildSaveBody(withClasses, removed)
    expect(error).toBe(null)
    expect(body.remove_freight_classes).toEqual(['A'])
    expect(body.discount_classes).toEqual([])
    expect(body).not.toHaveProperty('freight_classes')
  })
})

