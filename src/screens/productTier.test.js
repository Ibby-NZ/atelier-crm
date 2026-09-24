import { describe, it, expect } from 'vitest'
import { productTierPath, tierBody, tierOptionLabel } from './productTier.js'

describe('product discount tier', () => {
  it('addresses the product’s tier route', () => {
    expect(productTierPath(12)).toBe('/admin/products/12/discount-tier')
  })

  it('labels a tier with its rate, marking the house default', () => {
    expect(tierOptionLabel({ label: 'JV Design', pct: 0.45 })).toBe('JV Design — 45%')
    expect(tierOptionLabel({ label: 'Standard', pct: 0.4, is_fallback: true })).toBe('Standard — 40% (house default)')
    expect(tierOptionLabel({ label: 'Odd', pct: 0.125 })).toBe('Odd — 12.5%')
  })

  it('clears the choice on blank and sends the id otherwise', () => {
    expect(tierBody('')).toEqual({ tier_id: null })
    expect(tierBody('7')).toEqual({ tier_id: 7 })
    expect(tierBody('x')).toEqual({ tier_id: null })
  })
})
