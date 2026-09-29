import { describe, it, expect } from 'vitest'
import { canApplyStock, stockAppliedNote, stockLevelsPath, stockSummaryLine, stockWorklist, stockWorklistCsv } from './stockLevels.js'

const result = {
  rows_read: 7750, stocked: 371, set: 4492, set_stocked: 43, created: 15,
  several: 1, no_product: 262, no_house: 50, negative: 1, units_not_applied: 4868.13,
  worklist: [
    { kind: 'no_product', range_name: 'SOLBIATI', item_code: 'BROUILIN7210', name: 'Brouillard Lin', on_hand: 12 },
    { kind: 'several', range_name: 'HAMAM', item_code: 'MARINE PC', name: 'MARINE "Pillow" case', on_hand: 1, candidates: ['A', 'B'] },
  ],
}

describe('the stock upload', () => {
  it('says what a check would do, and offers Apply only when something would be written', () => {
    expect(stockLevelsPath('validate', 'Stock View.xlsx')).toBe('/admin/inventory/stock-levels/validate?filename=Stock%20View.xlsx')
    expect(stockSummaryLine(result)).toBe('7,750 items (371 holding stock) — 43 stocked variations set, 15 new, 314 not placed')
    expect(canApplyStock(result)).toBe(true)
    expect(canApplyStock({ ...result, applied: true })).toBe(false)
    expect(canApplyStock({ ...result, set: 0, created: 0 })).toBe(false)
  })

  it('lists what was not placed, and writes it as CSV', () => {
    expect(stockWorklist(result).map((row) => row.why)).toEqual(['no product in its house', 'matches more than one variation or product: A, B'])
    expect(stockWorklistCsv(result).split('\n')[2]).toBe('"HAMAM","MARINE PC","MARINE ""Pillow"" case","1","matches more than one variation or product: A, B"')
    expect(stockAppliedNote({ ...result, applied: true })).toBe('Applied — 58 stocked variations given their stock (15 new), 4,868.13 units not placed.')
  })
})
