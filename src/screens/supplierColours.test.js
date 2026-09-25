import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  canApplyColours,
  coloursAppliedNote,
  coloursFileProblem,
  coloursImportPath,
  coloursRefusal,
  coloursSummaryLine,
  coloursWorklist,
} from './supplierColours.js'

// A check of the one-row test file, as the API answers it.
const CHECK = Object.freeze({
  rows_read: 1,
  products: 1,
  products_new: 1,
  products_priced: 1,
  colourways: 1,
  colourways_new: 1,
  unknown_brands: [],
  skips: [],
  conflicts: [],
})

describe('the colours upload', () => {
  it('checks the file before sending it', () => {
    expect(coloursFileProblem(null)).toMatch(/Choose/)
    expect(coloursFileProblem({ name: 'x.xlsx', size: 0 })).toMatch(/empty/)
    expect(coloursFileProblem({ name: 'colours.csv', size: 10 })).toMatch(/not an \.xlsx/)
    expect(coloursFileProblem({ name: 'Supplier Colours 2026.xlsx', size: 1_346_359 })).toBeNull()
    expect(coloursImportPath('validate', 'Supplier Colours 2026.xlsx')).toBe(
      '/admin/catalogue/colours/import/validate?filename=Supplier%20Colours%202026.xlsx'
    )
  })

  it('summarises a check, and offers Apply only on a check that lands something', () => {
    expect(coloursSummaryLine(CHECK)).toBe('1 row — 1 design (1 new, 1 with a product price), 1 colourway (1 new)')
    expect(canApplyColours(CHECK)).toBe(true)
    expect(canApplyColours({ ...CHECK, colourways: 0 })).toBe(false)
    const applied = { ...CHECK, applied: { colourways: 1, products: 1, stock_rows_created: 1, products_priced: 1 } }
    expect(canApplyColours(applied)).toBe(false)
    expect(coloursAppliedNote(applied)).toBe('Applied — 1 colourway across 1 design, 1 new stock row (at zero), 1 design given its trade price from the product prices.')
    expect(coloursAppliedNote({ applied: { colourways: 2, products: 1, stock_rows_created: 2, products_priced: 0 } })).toBe('Applied — 2 colourways across 1 design, 2 new stock rows (at zero).')
    expect(coloursAppliedNote(CHECK)).toBe('')
  })

  it('lists what did not land as the office’s worklist', () => {
    const worklist = coloursWorklist({
      unknown_brands: [{ brand: 'Perennials', rows: 1188, first: 'x.xlsx:Supplier Colours:40001' }],
      skips: [{ reason: 'no colour code', rows: 1, first: 'x.xlsx:Supplier Colours:9' }],
      conflicts: [{ sku: 'MADEAUX-X-01', kept: { name: 'Sky' }, dropped: { name: 'Blue', source: 'x.xlsx:Supplier Colours:12' } }],
    })
    expect(worklist.map((line) => line.text)).toEqual([
      'Perennials — 1,188 rows: no house of that name in the catalogue (add it, or rename one to match), first at x.xlsx:Supplier Colours:40001',
      '1 row: no colour code, first at x.xlsx:Supplier Colours:9',
      'MADEAUX-X-01: "Sky" kept, "Blue" dropped (x.xlsx:Supplier Colours:12)',
    ])
  })

  it('reads a refusal’s per-row reasons, and nothing else as one', () => {
    expect(coloursRefusal({ status: 422, body: { message: '1 row could not be read.', errors: ['row 2: no brand'], error_count: 1 } })).toEqual({
      message: '1 row could not be read.',
      errors: ['row 2: no brand'],
      errorCount: 1,
    })
    expect(coloursRefusal({ status: 403, body: { message: 'no' } })).toBeNull()
  })

  it('is drawn on the Products list for a director only, inside the existing panel', () => {
    const list = readFileSync(new URL('./AdminProducts.jsx', import.meta.url), 'utf8')
    expect(list).toContain('<SupplierColoursImport')
    expect(list).toMatch(/canEditRecords\(/)
  })
})
