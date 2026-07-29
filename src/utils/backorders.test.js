import { describe, it, expect } from 'vitest'
import { deriveBackorders } from './backorders.js'

// Back orders generated on receipt (decision 2, 15 Jul).
describe('deriveBackorders', () => {
  it('ignores a line with nothing received (not yet a back order)', () => {
    const lines = [{ sku: 'PF-ATL-05', name: 'Atlas — Slate', ordered: 20, received: 0 }]
    expect(deriveBackorders(lines)).toEqual([])
  })

  it('creates a back order for a part-received, still-short line', () => {
    const lines = [{ sku: 'PF-ATL-04', name: 'Atlas — Indigo', ordered: 30, received: 18 }]
    const bo = deriveBackorders(lines, { so: 'SO-2026-0418', client: 'Marlow & Finch' })
    expect(bo).toHaveLength(1)
    expect(bo[0]).toMatchObject({ sku: 'PF-ATL-04', qty: 12, so: 'SO-2026-0418', client: 'Marlow & Finch', status: 'Awaiting supplier' })
  })

  it('drops a fully-received line', () => {
    const lines = [{ sku: 'PF-ATL-01', name: 'Atlas — Natural', ordered: 40, received: 40 }]
    expect(deriveBackorders(lines)).toEqual([])
  })

  it('handles the seeded PO shape — only the short-received line', () => {
    const lines = [
      { sku: 'PF-ATL-01', name: 'Atlas — Natural', ordered: 40, received: 40 },
      { sku: 'PF-ATL-04', name: 'Atlas — Indigo', ordered: 30, received: 18 },
      { sku: 'PF-ATL-05', name: 'Atlas — Slate', ordered: 20, received: 0 },
    ]
    const bo = deriveBackorders(lines)
    expect(bo).toHaveLength(1)
    expect(bo[0].qty).toBe(12)
  })

  it('defaults so/client to em dashes', () => {
    const bo = deriveBackorders([{ sku: 'X', name: 'X', ordered: 10, received: 4 }])
    expect(bo[0]).toMatchObject({ so: '—', client: '—' })
  })
})
