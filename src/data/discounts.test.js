import { describe, it, expect } from 'vitest'
import { applyDiscountChain, chainLabel, resolveDiscount } from './discounts.js'

describe('applyDiscountChain — sequential compounding', () => {
  it('compounds 40+40 to ×0.36, not −80%', () => {
    expect(applyDiscountChain(100, [0.4, 0.4])).toBeCloseTo(36, 6)
    expect(applyDiscountChain(200, [0.4, 0.4])).toBeCloseTo(72, 6)
  })

  it('handles the empty chain and single flat rates', () => {
    expect(applyDiscountChain(100, [])).toBe(100)
    expect(applyDiscountChain(100)).toBe(100)
    expect(applyDiscountChain(100, [0.05])).toBeCloseTo(95, 6)
  })

  it('labels chains for display', () => {
    expect(chainLabel([])).toBe('No discount step')
    expect(chainLabel([0.4, 0.4])).toBe('−40% then −40%')
  })
})

describe('resolveDiscount — routing per supplier/brand/category', () => {
  it('discount-inclusive supplier (Loro Piana) → empty chain, P2 skipped', () => {
    const r = resolveDiscount({ supplier: 'Loro Piana' })
    expect(r.chain).toEqual([])
    expect(r.source).toBe('inclusive')
  })

  it('JV Fabrics → the compounded 40+40 chain', () => {
    const r = resolveDiscount({ supplier: 'Janelli Volpi', brand: 'JV Fabrics' })
    expect(r.chain).toEqual([0.4, 0.4])
    expect(r.source).toBe('brand')
  })

  it('Janelli Volpi brand tiers match by category, with the all-other fallback', () => {
    expect(resolveDiscount({ supplier: 'Janelli Volpi', brand: 'Janelli Volpi', category: 'Wallpapers by the metre' }).chain).toEqual([0.4])
    expect(resolveDiscount({ supplier: 'Janelli Volpi', brand: 'Janelli Volpi', category: 'New collections + carry-over designs' }).chain).toEqual([0.45])
    const fallback = resolveDiscount({ supplier: 'Janelli Volpi', brand: 'Janelli Volpi' })
    expect(fallback.chain).toEqual([0.5])
    expect(fallback.source).toBe('brand-tier')
  })

  it('JV sister brands carry the flat −50%', () => {
    const r = resolveDiscount({ supplier: 'Janelli Volpi', brand: 'Missoni' })
    expect(r.chain).toEqual([0.5])
    expect(r.source).toBe('brand')
  })

  it('averaged suppliers fall through to the supplier-level default (9 Jul rule)', () => {
    const pf = resolveDiscount({ supplier: 'Pierre Frey' })
    expect(pf.chain).toEqual([0.05])
    expect(pf.source).toBe('supplier-average')
    // Markup-only brands (Fabricut house) also fall through to the supplier average.
    const sh = resolveDiscount({ supplier: 'Fabricut', brand: 'S. Harris' })
    expect(sh.chain).toEqual([0.05])
    expect(sh.source).toBe('supplier-average')
  })

  it('unknown suppliers resolve to no chain', () => {
    const r = resolveDiscount({ supplier: 'Nobody & Co' })
    expect(r.chain).toEqual([])
    expect(r.source).toBe('none')
  })
})
