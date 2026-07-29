import { describe, it, expect } from 'vitest'
import { packingSlipLines } from './packingSlip.js'

// Packing slips list ONLY items currently being shipped (decision 2, 15 Jul).
describe('packingSlipLines', () => {
  it('includes only lines with material received/shipping now', () => {
    const lines = [
      { sku: 'PF-ATL-01', name: 'Atlas — Natural', ordered: 40, received: 40 },
      { sku: 'PF-ATL-04', name: 'Atlas — Indigo', ordered: 30, received: 18 },
      { sku: 'PF-ATL-05', name: 'Atlas — Slate', ordered: 20, received: 0 },
    ]
    const slip = packingSlipLines(lines)
    expect(slip.map((l) => l.sku)).toEqual(['PF-ATL-01', 'PF-ATL-04'])
  })

  it('reports shipped and backordered per line', () => {
    const slip = packingSlipLines([{ sku: 'PF-ATL-04', name: 'Atlas — Indigo', ordered: 30, received: 18 }])
    expect(slip[0]).toMatchObject({ ordered: 30, shipped: 18, backordered: 12 })
  })

  it('shows zero backordered for a fully-shipped line', () => {
    const slip = packingSlipLines([{ sku: 'PF-ATL-01', name: 'Atlas — Natural', ordered: 40, received: 40 }])
    expect(slip[0].backordered).toBe(0)
  })

  it('returns [] when nothing is shipping', () => {
    expect(packingSlipLines([{ sku: 'X', name: 'X', ordered: 10, received: 0 }])).toEqual([])
    expect(packingSlipLines([])).toEqual([])
  })
})
