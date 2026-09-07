import { describe, it, expect } from 'vitest'
import {
  priceBandFor,
  priceBandOptions,
  matchesProductFilters,
  productPriceBand,
  NO_PRICE_BAND,
} from './priceBands.js'

describe('priceBandFor', () => {
  it('draws the office bands: under 100, 100–200, 201–300, …', () => {
    expect(priceBandFor(null)).toBeNull()
    expect(priceBandFor(undefined)).toBeNull()
    expect(priceBandFor('')).toBeNull()
    expect(priceBandFor(9999)).toEqual({ value: 'under-100', label: 'Under $100', from: 0 })
    expect(priceBandFor(10000)).toEqual({ value: '100-200', label: '$100–$200', from: 100 })
    expect(priceBandFor(20000)).toEqual({ value: '100-200', label: '$100–$200', from: 100 })
    expect(priceBandFor(20100)).toEqual({ value: '201-300', label: '$201–$300', from: 201 })
    expect(priceBandFor(30000)).toEqual({ value: '201-300', label: '$201–$300', from: 201 })
    expect(priceBandFor(48600)).toEqual({ value: '401-500', label: '$401–$500', from: 401 })
    expect(priceBandFor(123456)).toEqual({ value: '1201-1300', label: '$1,201–$1,300', from: 1201 })
  })

  it('takes the string pg hands back for a numeric', () => {
    expect(priceBandFor('48600')).toEqual({ value: '401-500', label: '$401–$500', from: 401 })
  })
})

describe('productPriceBand', () => {
  it('bands retail first, trade where there is no retail, and names the unpriced', () => {
    expect(productPriceBand({ retail_price_cents: 15000, trade_price_cents: 9000 }).value).toBe('100-200')
    expect(productPriceBand({ retail_price_cents: null, trade_price_cents: 9000 }).value).toBe('under-100')
    expect(productPriceBand({ retail_price_cents: null, trade_price_cents: null })).toBe(NO_PRICE_BAND)
    expect(productPriceBand({})).toBe(NO_PRICE_BAND)
  })
})

describe('priceBandOptions', () => {
  it('lists the bands present, by amount, with No price last', () => {
    const options = priceBandOptions([
      { retail_price_cents: 123456 },
      { retail_price_cents: null },
      { retail_price_cents: 15000 },
      { retail_price_cents: 16000 },
      { retail_price_cents: 5000 },
    ])
    expect(options.map((o) => o.label)).toEqual(['Under $100', '$100–$200', '$1,201–$1,300', 'No price'])
  })

  it('is empty for an empty list', () => {
    expect(priceBandOptions([])).toEqual([])
    expect(priceBandOptions()).toEqual([])
  })
})

describe('matchesProductFilters', () => {
  const cushion = { category: 'cushion', retail_price_cents: 15000 }
  const fabric = { category: null, retail_price_cents: null, trade_price_cents: 48600 }

  it('passes everything with no filter set', () => {
    expect(matchesProductFilters(cushion)).toBe(true)
    expect(matchesProductFilters(fabric, {})).toBe(true)
    expect(matchesProductFilters(fabric, { category: '', priceBand: '' })).toBe(true)
  })

  it('narrows by category and by band, together', () => {
    expect(matchesProductFilters(cushion, { category: 'cushion' })).toBe(true)
    expect(matchesProductFilters(fabric, { category: 'cushion' })).toBe(false)
    expect(matchesProductFilters(cushion, { priceBand: '100-200' })).toBe(true)
    expect(matchesProductFilters(fabric, { priceBand: '401-500' })).toBe(true)
    expect(matchesProductFilters(cushion, { category: 'cushion', priceBand: '401-500' })).toBe(false)
    expect(matchesProductFilters({}, { priceBand: 'none' })).toBe(true)
  })
})
