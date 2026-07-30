import { describe, it, expect } from 'vitest'
import {
  freeStock,
  parseDelta,
  wouldGoNegative,
  parseQuantities,
  quantityPatch,
  describeStock,
} from './stock.js'

describe('freeStock', () => {
  it('coerces pg numeric strings before subtracting', () => {
    // '60.00' - '10.00' must be 50, not a string concatenation or NaN.
    expect(freeStock({ qty_available: '60.00', qty_reserved: '10.00' })).toBe(50)
  })

  it('goes negative when reservations exceed the shelf', () => {
    // A short backorder legitimately reserves more than is held — this must NOT
    // clamp to zero, or committed demand disappears from the screen.
    expect(freeStock({ qty_available: '4', qty_reserved: '10' })).toBe(-6)
  })

  it('treats a missing quantity as zero', () => {
    expect(freeStock({})).toBe(0)
    expect(freeStock({ qty_available: '5' })).toBe(5)
  })
})

describe('parseDelta', () => {
  it('accepts a positive or negative amount', () => {
    expect(parseDelta('12')).toEqual({ ok: true, value: 12 })
    expect(parseDelta('-4.5')).toEqual({ ok: true, value: -4.5 })
  })

  it('refuses blank, zero and non-numeric input', () => {
    expect(parseDelta('').ok).toBe(false)
    expect(parseDelta('   ').ok).toBe(false)
    expect(parseDelta('0').error).toMatch(/changes nothing/)
    expect(parseDelta('lots').error).toMatch(/must be a number/)
  })
})

describe('wouldGoNegative', () => {
  it('catches a write-off larger than the shelf before it is sent', () => {
    expect(wouldGoNegative({ qty_available: '4' }, -10)).toBe(true)
    expect(wouldGoNegative({ qty_available: '10' }, -10)).toBe(false)
    expect(wouldGoNegative({ qty_available: '0' }, 5)).toBe(false)
  })
})

describe('parseQuantities', () => {
  it('accepts two non-negative numbers', () => {
    expect(parseQuantities({ qty_available: '60', qty_reserved: '0' })).toEqual({
      ok: true,
      value: { qty_available: 60, qty_reserved: 0 },
    })
  })

  it('allows reserved above available — that is a live backorder, not an error', () => {
    expect(parseQuantities({ qty_available: '2', qty_reserved: '9' }).ok).toBe(true)
  })

  it('names the field it rejected', () => {
    expect(parseQuantities({ qty_available: '-1', qty_reserved: '0' }).error).toBe(
      'Available cannot be negative.'
    )
    expect(parseQuantities({ qty_available: '10', qty_reserved: '' }).error).toBe(
      'Reserved cannot be blank.'
    )
    expect(parseQuantities({ qty_available: 'ten', qty_reserved: '0' }).error).toBe(
      'Available must be a number.'
    )
  })
})

describe('quantityPatch', () => {
  const row = Object.freeze({ qty_available: '60.00', qty_reserved: '10.00' })

  it('sends only the quantity that moved', () => {
    expect(quantityPatch(row, { qty_available: 65, qty_reserved: 10 })).toEqual({
      qty_available: 65,
    })
  })

  it('is empty when the numbers match despite the string form', () => {
    expect(quantityPatch(row, { qty_available: 60, qty_reserved: 10 })).toEqual({})
  })

  it('can send both', () => {
    expect(quantityPatch(row, { qty_available: 1, qty_reserved: 2 })).toEqual({
      qty_available: 1,
      qty_reserved: 2,
    })
  })

  it('sends a genuine zero rather than dropping it as falsy', () => {
    expect(quantityPatch(row, { qty_available: 0, qty_reserved: 10 })).toEqual({
      qty_available: 0,
    })
  })
})

describe('describeStock', () => {
  it('reads plainly for each tone', () => {
    expect(describeStock({ qty_available: '60', qty_reserved: '10', unit: 'metres' })).toEqual({
      free: 50,
      tone: 'ok',
      label: '50 metres free',
    })
    expect(describeStock({ qty_available: '10', qty_reserved: '10', unit: 'metres' })).toEqual({
      free: 0,
      tone: 'low',
      label: '0 metres free',
    })
    expect(describeStock({ qty_available: '4', qty_reserved: '10', unit: 'units' })).toEqual({
      free: -6,
      tone: 'over',
      label: '-6 units — oversold',
    })
  })
})
