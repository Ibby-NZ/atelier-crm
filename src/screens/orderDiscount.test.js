// The discount control's rules (Rebecca-R2). The important assertions are the
// mirror-pinning ones: the tiers must equal the API's, the untouched draft
// must build a NULL patch before the director refusal can fire (or a
// back-office user cannot edit lines on a director-discounted order), and the
// printed amount must be derived from the server's figures, never recomputed.

import { describe, it, expect } from 'vitest'

import {
  CUSTOM_DISCOUNT_HINT,
  DIRECTORS_ONLY_NOTE,
  DISCOUNT_OPTIONS,
  EMPTY_DISCOUNT_DRAFT,
  STANDARD_DISCOUNT_TIERS,
  buildDiscountPatch,
  discountAmountCents,
  discountAppliedBy,
  discountDraftFrom,
  formatDiscountPct,
  hasDiscount,
  isStandardDiscount,
} from './orderDiscount.js'

// An order as /admin/orders returns it: money in integer cents, discount_pct a
// pg-numeric STRING.
const orderWith = (extra = {}) => ({
  subtotal_cents: 10000,
  shipping_cents: 500,
  total_cents: 10500,
  discount_pct: '0.00',
  discount_reason: null,
  discount_applied_by: null,
  ...extra,
})

const discounted = () =>
  orderWith({
    discount_pct: '7.50',
    discount_reason: 'Hutchinson job',
    discount_applied_by: 4,
    total_cents: 9750, // 10000 * 0.925 + 500, as the API computes it
  })

describe('the tiers mirror atelier-api', () => {
  it('is the API trio, frozen', () => {
    // atelier-api src/orders/discounts.js STANDARD_DISCOUNT_TIERS — a drift
    // here offers a tier the server would 403 or hides one it would take.
    expect(STANDARD_DISCOUNT_TIERS).toEqual([0, 5, 10])
    expect(Object.isFrozen(STANDARD_DISCOUNT_TIERS)).toBe(true)
  })

  it('reads the pg-numeric string the API answers with', () => {
    expect(isStandardDiscount('5.00')).toBe(true)
    expect(isStandardDiscount('7.50')).toBe(false)
  })

  it('offers every tier plus the one director door', () => {
    expect(DISCOUNT_OPTIONS.map((o) => o.value)).toEqual(['0', '5', '10', 'custom'])
    // The notes exist and say whose door it is.
    expect(DIRECTORS_ONLY_NOTE).toMatch(/director/i)
    expect(CUSTOM_DISCOUNT_HINT).toMatch(/why|reason/i)
  })
})

describe('discountDraftFrom', () => {
  it('shows an undiscounted order as None', () => {
    expect(discountDraftFrom(orderWith())).toEqual({ mode: '0', pct: '', reason: '' })
  })

  it('shows a standard tier as its own option', () => {
    expect(discountDraftFrom(orderWith({ discount_pct: '5.00' })).mode).toBe('5')
    expect(discountDraftFrom(orderWith({ discount_pct: '10.00' })).mode).toBe('10')
  })

  it('shows an override as Custom with the stored values', () => {
    expect(discountDraftFrom(discounted())).toEqual({
      mode: 'custom',
      pct: '7.5',
      reason: 'Hutchinson job',
    })
  })

  it('shows a justified standard tier as Custom, so the reason stays visible', () => {
    const draft = discountDraftFrom(
      orderWith({ discount_pct: '5.00', discount_reason: 'matched a quote' })
    )
    expect(draft).toEqual({ mode: 'custom', pct: '5', reason: 'matched a quote' })
  })

  it('has a cleared state that matches an untouched new order', () => {
    expect(discountDraftFrom(orderWith())).toEqual({ ...EMPTY_DISCOUNT_DRAFT })
  })
})

describe('buildDiscountPatch', () => {
  it('builds nothing when the control was not touched', () => {
    const order = orderWith()
    expect(buildDiscountPatch(order, discountDraftFrom(order))).toEqual({
      ok: true,
      patch: null,
    })
  })

  it('builds a null patch for an UNTOUCHED override even without director rights', () => {
    // The seeded mode on a director-discounted order is 'custom'. A back-office
    // user saving an ordinary line edit must not be refused for a discount they
    // never touched — the null-patch return runs before the director check.
    const order = discounted()
    expect(
      buildDiscountPatch(order, discountDraftFrom(order), { director: false })
    ).toEqual({ ok: true, patch: null })
  })

  it('sends a standard tier as the pct alone — the API clears the reason with it', () => {
    expect(buildDiscountPatch(orderWith(), { mode: '5', pct: '', reason: '' })).toEqual({
      ok: true,
      patch: { discount_pct: 5 },
    })
  })

  it('lets anyone move an override back to a standard tier', () => {
    // Standard tiers are back-office territory whichever direction they are
    // approached from; only leaving them needs a director.
    expect(
      buildDiscountPatch(discounted(), { mode: '5', pct: '', reason: '' }, { director: false })
    ).toEqual({ ok: true, patch: { discount_pct: 5 } })
  })

  it('re-sends the same standard pct when there is a stored reason to clear', () => {
    const order = orderWith({ discount_pct: '5.00', discount_reason: 'matched a quote' })
    expect(buildDiscountPatch(order, { mode: '5', pct: '', reason: '' })).toEqual({
      ok: true,
      patch: { discount_pct: 5 },
    })
  })

  it('builds a custom patch for a director, pct and reason together', () => {
    expect(
      buildDiscountPatch(
        orderWith(),
        { mode: 'custom', pct: '7.5', reason: '  Hutchinson job  ' },
        { director: true }
      )
    ).toEqual({ ok: true, patch: { discount_pct: 7.5, discount_reason: 'Hutchinson job' } })
  })

  it('refuses a changed custom value from a non-director with the API 403 wording', () => {
    const result = buildDiscountPatch(
      orderWith(),
      { mode: 'custom', pct: '7.5', reason: 'trying' },
      { director: false }
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/director/i)
  })

  it('requires a reason on a custom discount', () => {
    for (const reason of ['', '   ']) {
      const result = buildDiscountPatch(
        orderWith(),
        { mode: 'custom', pct: '7.5', reason },
        { director: true }
      )
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/reason/i)
    }
  })

  it('refuses a blank, non-numeric or out-of-range percentage', () => {
    for (const pct of ['', 'ten', '0', '-5', '101']) {
      const result = buildDiscountPatch(
        orderWith(),
        { mode: 'custom', pct, reason: 'valid reason' },
        { director: true }
      )
      expect(result.ok).toBe(false)
    }
  })

  it('accepts an edit to the reason alone — pct and reason travel as a pair', () => {
    const result = buildDiscountPatch(
      discounted(),
      { mode: 'custom', pct: '7.5', reason: 'Hutchinson job, agreed 12 Aug' },
      { director: true }
    )
    expect(result).toEqual({
      ok: true,
      patch: { discount_pct: 7.5, discount_reason: 'Hutchinson job, agreed 12 Aug' },
    })
  })
})

describe('the totals area', () => {
  it('derives the amount from the server figures, never the pct', () => {
    // 10000 + 500 − 9750: whatever the API rounded to IS the discount, so the
    // printed line can never disagree with the total beside it.
    expect(discountAmountCents(discounted())).toBe(750)
    expect(discountAmountCents(orderWith())).toBe(0)
  })

  it('prints the pct without pg-numeric trailing noise', () => {
    expect(formatDiscountPct('7.50')).toBe('7.5%')
    expect(formatDiscountPct('10.00')).toBe('10%')
  })

  it('only claims a discount when there is one', () => {
    expect(hasDiscount(orderWith())).toBe(false)
    expect(hasDiscount(discounted())).toBe(true)
  })

  it('names the staff account that applied it, and stays quiet otherwise', () => {
    expect(discountAppliedBy(discounted())).toBe('Applied by staff account #4')
    expect(discountAppliedBy(orderWith())).toBe('')
    // A discount whose applier the API never recorded (a legacy row) says
    // nothing rather than 'staff account #null'.
    expect(discountAppliedBy(orderWith({ discount_pct: '5.00', total_cents: 10000 }))).toBe('')
  })
})
