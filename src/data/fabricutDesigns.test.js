import { describe, it, expect } from 'vitest'
import { fabricutDesigns } from './fabricutDesigns.js'
import { buildSku, parseSku } from '../utils/sku.js'

// Per-brand retail markups — must mirror ./suppliers.js Fabricut brands exactly.
const RETAIL_MARKUP = {
  Fabricut: '×2.1',
  'S. Harris': '×2.3',
  Stroheim: '×2.2',
  Vervain: '×2.4',
  Trend: '×2.0',
  'Clarence House': '×2.5',
}

describe('fabricutDesigns — the six house-brand catalogue rows', () => {
  it('has exactly six entries', () => {
    expect(fabricutDesigns).toHaveLength(6)
  })

  it('every entry is a USD Fabricut design with no images', () => {
    for (const d of fabricutDesigns) {
      expect(d.supplier).toBe('Fabricut')
      expect(d.currency).toBe('USD')
      expect(d.img).toBeNull()
      expect(d.src).toBeNull()
      expect(d.inHouse).toBe(false)
    }
  })

  it('carries the exact per-brand retail markup from the supplier master', () => {
    for (const d of fabricutDesigns) {
      expect(d.retailMarkup).toBe(RETAIL_MARKUP[d.brand])
    }
  })

  it('covers each of the six house brands exactly once', () => {
    const brands = fabricutDesigns.map((d) => d.brand).sort()
    expect(brands).toEqual(Object.keys(RETAIL_MARKUP).sort())
  })

  it('every colourway SKU round-trips through buildSku(parseSku(sku))', () => {
    for (const d of fabricutDesigns) {
      expect(d.colourways.length).toBeGreaterThan(0)
      for (const cw of d.colourways) {
        expect(buildSku(parseSku(cw.sku))).toBe(cw.sku)
      }
    }
  })
})
