import { describe, it, expect } from 'vitest'
import {
  NEEDS_REASON,
  PRODUCT_PRICE_KEYS,
  RATE_PRICE_KEYS,
  REASON_MAX_LENGTH,
  priceMoved,
  withReason,
} from './priceChange.js'

describe('priceMoved', () => {
  it('reads the patch, never the draft — presence is movement', () => {
    // diffFields only emits changed keys, so a patch carrying the key IS the
    // price moving; a patch without it restated the same figure.
    expect(priceMoved({ wholesale_rate: 60 }, RATE_PRICE_KEYS)).toBe(true)
    expect(priceMoved({ description: 'Linen' }, RATE_PRICE_KEYS)).toBe(false)
    expect(priceMoved({}, RATE_PRICE_KEYS)).toBe(false)
  })

  it('treats either product price as a price', () => {
    expect(priceMoved({ retail_price_cents: 18600 }, PRODUCT_PRICE_KEYS)).toBe(true)
    expect(priceMoved({ trade_price_cents: null }, PRODUCT_PRICE_KEYS)).toBe(true)
    expect(priceMoved({ name: 'Atlas' }, PRODUCT_PRICE_KEYS)).toBe(false)
  })

  it('counts an explicit clear as movement', () => {
    // '' → null is a real change (the price comes off), and the API demands a
    // reason for it exactly as for a new figure.
    expect(priceMoved({ retail_price_cents: null }, PRODUCT_PRICE_KEYS)).toBe(true)
  })
})

describe('withReason', () => {
  it('leaves a patch that moves no price untouched', () => {
    const patch = { description: 'Heavy linen' }
    expect(withReason(patch, 'ignored', RATE_PRICE_KEYS)).toEqual({ patch })
    // No reason typed and none needed — this is the everyday non-price save.
    expect(withReason(patch, '', RATE_PRICE_KEYS)).toEqual({ patch })
  })

  it('demands a non-blank reason when a price moved', () => {
    expect(withReason({ wholesale_rate: 60 }, '', RATE_PRICE_KEYS)).toEqual({
      error: NEEDS_REASON,
    })
    expect(withReason({ wholesale_rate: 60 }, '   ', RATE_PRICE_KEYS)).toEqual({
      error: NEEDS_REASON,
    })
    expect(withReason({ trade_price_cents: 9900 }, undefined, PRODUCT_PRICE_KEYS)).toEqual({
      error: NEEDS_REASON,
    })
  })

  it('attaches the trimmed reason beside the patch', () => {
    expect(withReason({ wholesale_rate: 60 }, '  supplier increase ', RATE_PRICE_KEYS)).toEqual({
      patch: { wholesale_rate: 60, reason: 'supplier increase' },
    })
  })

  it('slices an over-long reason to what the API schema accepts', () => {
    // The PATCH schemas bound `reason` at MAX_REASON_LENGTH; a longer one would
    // 400 at the boundary before the rule it exists for is even reached.
    const result = withReason({ wholesale_rate: 60 }, 'x'.repeat(600), RATE_PRICE_KEYS)
    expect(result.patch.reason).toHaveLength(REASON_MAX_LENGTH)
  })

  it('does not mutate the patch it was handed', () => {
    const patch = { wholesale_rate: 60 }
    withReason(patch, 'exchange rate', RATE_PRICE_KEYS)
    expect(patch).toEqual({ wholesale_rate: 60 })
  })
})
