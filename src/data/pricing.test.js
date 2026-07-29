import { describe, it, expect } from 'vitest'
import { computeWaterfall, pricingInputs, canonical } from './pricing.js'
import { nzdMultiplier } from './fx.js'

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
// The unrounded supplier-discounted price the freight step operates on (EUR 48 ÷ 0.49 × 1.1, −5%).
const supplierDiscounted = 48 * nzdMultiplier('EUR', { withMargin: false }) * 1.1 * 0.95

describe('computeWaterfall — canonical Pierre Frey · Atlas (real FX table)', () => {
  it('pins the canonical figures (EUR 48 ÷ 0.49 × 1.1 basis)', () => {
    expect(canonical).toEqual({
      wholesale: 107.76,
      supplierDiscounted: 102.37,
      priceExDuty: 112.6,
      cogs: 120.49,
      landed: 121.14,
      retail: 266.5,
      trade: 187.76,
      tier1: 168.99,
      tier2: 178.37,
    })
  })

  it('legacy single-rate supplierDiscount path matches the chain path', () => {
    const legacy = computeWaterfall({ ...pricingInputs, discountChain: undefined, supplierDiscount: 0.05 })
    expect(legacy).toEqual(canonical)
  })

  it('an empty chain (discount-inclusive prices) skips P2', () => {
    const r = computeWaterfall({ ...pricingInputs, discountChain: [] })
    expect(r.wholesale).toBe(107.76)
    expect(r.supplierDiscounted).toBe(r.wholesale)
  })

  it('a compounded 40+40 chain flows through P2 (×0.36)', () => {
    const r = computeWaterfall({ ...pricingInputs, discountChain: [0.4, 0.4] })
    expect(r.supplierDiscounted).toBe(38.79)
  })

  it('dollar trade-markup mode adds the flat value to landed', () => {
    const r = computeWaterfall({ ...pricingInputs, tradeMarkupMode: 'dollar' })
    expect(r.trade).toBe(181.14)
  })

  it('per-currency FX: GBP wholesale = 48 ÷ 0.42 × 1.1', () => {
    const r = computeWaterfall({ ...pricingInputs, currency: 'GBP' })
    expect(r.wholesale).toBe(125.71)
  })

  // Decision 1 (15 Jul): freight can be a flat $ value instead of a %. Percent mode (canonical
  // above) is unchanged; dollar mode adds a flat pre-duty amount.
  it('dollar freight mode adds a flat $ before duty', () => {
    const r = computeWaterfall({ ...pricingInputs, freightMode: 'dollar', freightDollar: 30 })
    expect(r.priceExDuty).toBe(round2(supplierDiscounted * (1 + pricingInputs.clearance) + 30))
  })

  it('dollar freight of $0 leaves only clearance before duty', () => {
    const r = computeWaterfall({ ...pricingInputs, freightMode: 'dollar', freightDollar: 0 })
    expect(r.priceExDuty).toBe(round2(supplierDiscounted * (1 + pricingInputs.clearance)))
  })
})
