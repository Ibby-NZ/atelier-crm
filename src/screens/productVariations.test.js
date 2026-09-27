import { describe, expect, it } from 'vitest'
import { diffFields, draftFrom } from '../admin/drafts.js'
import { editableFields } from './recordLock.js'
import {
  LOCKED_VARIATION_KEYS,
  VARIATION_FIELDS,
  inheritedPriceHint,
  pickVariation,
  variationLabel,
} from './productVariations.js'

const ink = { id: 1, name: 'Ink', sku: 'AT-01', archived_at: '2026-09-01T00:00:00Z', retail_price_cents: null, trade_price_cents: null }
const sand = { id: 2, name: 'Sand', sku: 'AT-02', archived_at: null, retail_price_cents: 12950, trade_price_cents: null }

describe('the Variations drop-down', () => {
  it('keeps the pick, else the first live variation, else the first', () => {
    expect(pickVariation([ink, sand], 1)).toBe(ink)
    expect(pickVariation([ink, sand], null)).toBe(sand)
    // A pick that is gone (deleted since) falls back rather than blanking.
    expect(pickVariation([ink, sand], 99)).toBe(sand)
    expect(pickVariation([ink], null)).toBe(ink)
    expect(pickVariation([], null)).toBe(null)
  })

  it('names each option by variation and SKU', () => {
    expect(variationLabel(sand)).toBe('Sand — AT-02')
    expect(variationLabel(ink)).toBe('Ink — AT-01 (archived)')
  })
})

describe('a variation\'s own price', () => {
  it('shows the product\'s price as the placeholder of a blank box', () => {
    expect(inheritedPriceHint({ retail_price_cents: 10000 }, 'retail_price_cents')).toBe("100.00 (product's price)")
    expect(inheritedPriceHint({ trade_price_cents: null }, 'trade_price_cents')).toBe("Product's price (none set)")
  })

  it('sends a typed price, and a cleared box as null (back to the product\'s)', () => {
    const typed = { ...draftFrom(sand, VARIATION_FIELDS), trade_price_cents: '80' }
    expect(diffFields(sand, typed, VARIATION_FIELDS).patch).toEqual({ trade_price_cents: 8000 })
    const cleared = { ...draftFrom(sand, VARIATION_FIELDS), retail_price_cents: '' }
    expect(diffFields(sand, cleared, VARIATION_FIELDS).patch).toEqual({ retail_price_cents: null })
  })

  it('keeps the prices out of a non-director\'s save', () => {
    const fields = editableFields(VARIATION_FIELDS, LOCKED_VARIATION_KEYS, false)
    const typed = { ...draftFrom(sand, VARIATION_FIELDS), name: 'Dune', retail_price_cents: '1' }
    expect(diffFields(sand, typed, fields).patch).toEqual({ name: 'Dune' })
  })
})
