import { describe, it, expect } from 'vitest'
import {
  NEEDS_REASON,
  PRODUCT_PRICE_KEYS,
  RATE_PRICE_KEYS,
  REASON_MAX_LENGTH,
  priceEdited,
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

describe('priceEdited', () => {
  const FIELDS = [
    { key: 'name', label: 'Name', required: true },
    { key: 'retail_price_cents', label: 'Retail price', kind: 'money' },
    { key: 'trade_price_cents', label: 'Trade price', kind: 'money' },
  ]
  const record = { name: 'Atlas', retail_price_cents: 18600, trade_price_cents: null }
  const draft = { name: 'Atlas', retail_price_cents: '186.00', trade_price_cents: '' }

  it('is false until a price differs from the saved figure', () => {
    expect(priceEdited(record, draft, FIELDS, PRODUCT_PRICE_KEYS)).toBe(false)
    expect(priceEdited(record, { ...draft, retail_price_cents: '186' }, FIELDS, PRODUCT_PRICE_KEYS)).toBe(false)
    expect(priceEdited(record, { ...draft, name: 'Atlas II' }, FIELDS, PRODUCT_PRICE_KEYS)).toBe(false)
  })

  it('is true the moment either price moves, set or cleared', () => {
    expect(priceEdited(record, { ...draft, retail_price_cents: '190' }, FIELDS, PRODUCT_PRICE_KEYS)).toBe(true)
    expect(priceEdited(record, { ...draft, trade_price_cents: '99' }, FIELDS, PRODUCT_PRICE_KEYS)).toBe(true)
    expect(priceEdited(record, { ...draft, retail_price_cents: '' }, FIELDS, PRODUCT_PRICE_KEYS)).toBe(true)
  })

  it('counts a price still being typed, and ignores other fields\' errors', () => {
    expect(priceEdited(record, { ...draft, retail_price_cents: 'abc' }, FIELDS, PRODUCT_PRICE_KEYS)).toBe(true)
    // A blank required name must not hide the box for a price that moved.
    expect(priceEdited(record, { ...draft, name: '', trade_price_cents: '99' }, FIELDS, PRODUCT_PRICE_KEYS)).toBe(true)
  })

  it('is false when the prices are not in the editable fields (locked)', () => {
    const unlocked = FIELDS.filter((field) => field.key === 'name')
    expect(priceEdited(record, { ...draft, retail_price_cents: '190' }, unlocked, PRODUCT_PRICE_KEYS)).toBe(false)
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
