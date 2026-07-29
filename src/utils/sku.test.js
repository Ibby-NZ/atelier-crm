import { describe, it, expect } from 'vitest'
import { buildSku, parseSku, colorCode, designCode, skuFormat, normalizeSupplierCode } from './sku.js'

// Pins the workshop SKU logic (decision 8): SKU = Range acronym + design Code + ColorCode.
describe('buildSku — Range acronym + Code + ColorCode', () => {
  it('joins the three parts with hyphens', () => {
    expect(buildSku({ rangeAcronym: 'PF', code: 'ATL', colorCode: '04' })).toBe('PF-ATL-04')
  })

  it('cleans each part — uppercases and strips non-alphanumerics', () => {
    expect(buildSku({ rangeAcronym: 'pf', code: 'a-tl', colorCode: '0/4' })).toBe('PF-ATL-04')
  })

  it('drops empty parts so a partial key still renders', () => {
    expect(buildSku({ rangeAcronym: 'PF', code: 'ATL' })).toBe('PF-ATL')
    expect(buildSku({ rangeAcronym: 'PF', code: 'ATL', colorCode: '' })).toBe('PF-ATL')
    expect(buildSku({ rangeAcronym: 'PF', code: 'ATL', colorCode: null })).toBe('PF-ATL')
  })

  it('assembles the on-screen example PF + ATL + colorCode(1) ⟶ PF-ATL-01', () => {
    expect(buildSku({ rangeAcronym: 'PF', code: 'ATL', colorCode: colorCode(1) })).toBe('PF-ATL-01')
  })
})

describe('parseSku — inverse of buildSku', () => {
  it('splits a SKU back into its parts', () => {
    expect(parseSku('PF-ATL-04')).toEqual({ rangeAcronym: 'PF', code: 'ATL', colorCode: '04' })
  })

  it('round-trips with buildSku', () => {
    const sku = 'PF-ATL-04'
    expect(buildSku(parseSku(sku))).toBe(sku)
  })
})

describe('colorCode / designCode / skuFormat', () => {
  it('colorCode zero-pads a 1-based index to two digits', () => {
    expect(colorCode(1)).toBe('01')
    expect(colorCode(9)).toBe('09')
    expect(colorCode(12)).toBe('12')
  })

  it('designCode takes the 3-letter uppercase code from a design name', () => {
    expect(designCode('Atlas')).toBe('ATL')
    expect(designCode('wright')).toBe('WRI')
  })

  it('skuFormat renders the NN template shown in the UI', () => {
    expect(skuFormat({ rangeAcronym: 'PF', code: 'ATL' })).toBe('PF-ATL-NN')
  })
})

// Supplier code standardisation (decision 6, 15 Jul): uniform format, separators preserved as hyphens.
describe('normalizeSupplierCode', () => {
  it('uppercases and collapses separator runs to a single hyphen', () => {
    expect(normalizeSupplierCode('w7004 / 01')).toBe('W7004-01')
    expect(normalizeSupplierCode(' f4855.03 ')).toBe('F4855-03')
    expect(normalizeSupplierCode('a__b--c')).toBe('A-B-C')
  })

  it('is idempotent on an already-canonical code', () => {
    expect(normalizeSupplierCode('W7004-01')).toBe('W7004-01')
  })

  it('returns an empty string for blank/nullish input', () => {
    expect(normalizeSupplierCode('')).toBe('')
    expect(normalizeSupplierCode(null)).toBe('')
    expect(normalizeSupplierCode(undefined)).toBe('')
  })
})
