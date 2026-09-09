import { describe, it, expect } from 'vitest'
import {
  NO_SUPPLIER,
  discountNote,
  dutyText,
  freightText,
  groupBySupplier,
  surchargeText,
} from './pricingParameters.js'

// One Range row as GET /admin/freight/parameters projects it. Numerics are
// already numbers there (the API coerces), null where the export was blank.
const range = (over = {}) => ({
  guid: 'g-rubelli',
  name: 'RUBELLI',
  supplier: 'Rubelli / Dominique Kieffer',
  duty_rate_a: 5,
  duty_rate_b: 5,
  duty_rate_c: 5,
  clearance_percent: 10,
  freight_per_unit: 50,
  discount_percent: 25,
  discount_stated: true,
  trade_markup_percent: 85,
  min_qty_to_avoid_surcharge: null,
  surcharge_per_unit: null,
  ...over,
})

describe('freightText', () => {
  it('prints dollars per unit to the cent', () => {
    expect(freightText(50)).toBe('$50.00')
    expect(freightText('28.0000')).toBe('$28.00')
  })

  it('calls a blank freight unknown — never free, never zero', () => {
    expect(freightText(null)).toBe('unknown')
    expect(freightText(undefined)).toBe('unknown')
  })
})

describe('dutyText', () => {
  it('shows the three bands side by side', () => {
    expect(dutyText(range())).toBe('A 5% · B 5% · C 5%')
  })

  it('dashes a band the range does not define rather than reading it as 0%', () => {
    expect(dutyText(range({ duty_rate_b: null, duty_rate_c: 10 }))).toBe('A 5% · B — · C 10%')
  })
})

describe('surchargeText', () => {
  it('is a dash when the range states neither figure', () => {
    expect(surchargeText(range())).toBe('—')
  })

  it('pairs the surcharge with the quantity that avoids it', () => {
    expect(surchargeText(range({ surcharge_per_unit: 15, min_qty_to_avoid_surcharge: 3 }))).toBe(
      '$15.00 under 3'
    )
  })

  it('shows whichever half is stated', () => {
    expect(surchargeText(range({ surcharge_per_unit: 15 }))).toBe('$15.00')
    expect(surchargeText(range({ min_qty_to_avoid_surcharge: 3 }))).toBe('— under 3')
  })
})

describe('discountNote', () => {
  it('is silent on a stated discount', () => {
    expect(discountNote(range())).toBe(null)
  })

  it('says a blank discount was never stated, while the cell still reads 0%', () => {
    expect(discountNote(range({ discount_percent: 0, discount_stated: false }))).toMatch(/Blank in Dynamics/)
  })
})

describe('groupBySupplier', () => {
  const rows = [
    range({ guid: 'g1', name: 'LARSEN', supplier: 'Colefax & Fowler' }),
    range({ guid: 'g2', name: 'ATELIER STOCK', supplier: null }),
    range({ guid: 'g3', name: 'COLEFAX & FOWLER', supplier: 'Colefax & Fowler' }),
    range({ guid: 'g4', name: 'KIEFFER', supplier: ' Rubelli / Dominique Kieffer ' }),
    range({ guid: 'g5', name: 'RUBELLI', supplier: 'Rubelli / Dominique Kieffer' }),
  ]

  it('groups ranges under the invoicing entity that bills them, trimmed', () => {
    const groups = groupBySupplier(rows)
    expect(groups.map((g) => g.supplier)).toEqual([
      'Colefax & Fowler',
      'Rubelli / Dominique Kieffer',
      NO_SUPPLIER,
    ])
    expect(groups[1].ranges.map((r) => r.name)).toEqual(['KIEFFER', 'RUBELLI'])
  })

  it('sorts ranges within an entity and entities alphabetically, the blank one last', () => {
    const groups = groupBySupplier(rows)
    expect(groups[0].ranges.map((r) => r.name)).toEqual(['COLEFAX & FOWLER', 'LARSEN'])
    expect(groups[2].ranges.map((r) => r.name)).toEqual(['ATELIER STOCK'])
  })

  it('gives an empty payload an empty list rather than a group of nothing', () => {
    expect(groupBySupplier([])).toEqual([])
    expect(groupBySupplier()).toEqual([])
  })

  it('does not mutate the rows it was handed', () => {
    const copy = rows.map((r) => ({ ...r }))
    groupBySupplier(rows)
    expect(rows).toEqual(copy)
  })
})
