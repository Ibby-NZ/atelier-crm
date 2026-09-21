import { describe, it, expect } from 'vitest'
import {
  priceBandFor,
  priceBandOptions,
  priceBandQuery,
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
  it('lists every band up to the catalogue ceiling, with No price last', () => {
    // The list is paged now, so the options come from the API's
    // meta.max_price_cents rather than from the rows on screen.
    expect(priceBandOptions(25000).map((o) => o.label)).toEqual([
      'Under $100',
      '$100–$200',
      '$201–$300',
      'No price',
    ])
    expect(priceBandOptions(9999).map((o) => o.label)).toEqual(['Under $100', 'No price'])
  })

  it('offers only No price while the ceiling is unknown or nothing is priced', () => {
    expect(priceBandOptions(null)).toEqual([NO_PRICE_BAND])
    expect(priceBandOptions(undefined)).toEqual([NO_PRICE_BAND])
    expect(priceBandOptions('54900').map((o) => o.value)).toEqual([
      'under-100', '100-200', '201-300', '301-400', '401-500', '501-600', 'none',
    ])
  })
})

describe('priceBandQuery', () => {
  // The cents range a band's value means on GET /admin/products, matching
  // priceBandFor at cents granularity: 20000 is "$100–$200", 20001 is "$201–$300".
  it('is all-null for "All prices"', () => {
    expect(priceBandQuery('')).toEqual({ price_min_cents: null, price_max_cents: null, unpriced: null })
    expect(priceBandQuery()).toEqual({ price_min_cents: null, price_max_cents: null, unpriced: null })
  })

  it('translates each band into the range priceBandFor draws', () => {
    expect(priceBandQuery('under-100')).toEqual({ price_min_cents: null, price_max_cents: 9999, unpriced: null })
    expect(priceBandQuery('100-200')).toEqual({ price_min_cents: 10000, price_max_cents: 20000, unpriced: null })
    expect(priceBandQuery('201-300')).toEqual({ price_min_cents: 20001, price_max_cents: 30000, unpriced: null })
    expect(priceBandQuery('1201-1300')).toEqual({ price_min_cents: 120001, price_max_cents: 130000, unpriced: null })
  })

  it('asks for the unpriced with a flag, not a range', () => {
    expect(priceBandQuery('none')).toEqual({ price_min_cents: null, price_max_cents: null, unpriced: true })
  })

  it('ignores a value it cannot read rather than sending a bad range', () => {
    expect(priceBandQuery('garbage')).toEqual({ price_min_cents: null, price_max_cents: null, unpriced: null })
  })
})
