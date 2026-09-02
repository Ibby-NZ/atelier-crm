import { describe, it, expect } from 'vitest'
import { DASH, fxRate, fxText, markupPct, markupText, numberOrNull } from './priceLists.js'

// One D365 price row as the API projects it: pg numerics arrive as strings.
const row = (over = {}) => ({
  guid: 'g1',
  code: 'ABC-01',
  landed_cost_nz: '100.0000',
  trade_sell_price_nz: '162.5000',
  exchange_rate: '0.450000',
  price_exchange_rate: '0.540000',
  ...over,
})

describe('numberOrNull', () => {
  it('reads a pg numeric string', () => {
    expect(numberOrNull('100.0000')).toBe(100)
    expect(numberOrNull('0.450000')).toBe(0.45)
  })

  it('keeps a real zero', () => {
    expect(numberOrNull('0.0000')).toBe(0)
    expect(numberOrNull(0)).toBe(0)
  })

  it('preserves absence rather than defaulting it to 0', () => {
    expect(numberOrNull(null)).toBe(null)
    expect(numberOrNull(undefined)).toBe(null)
    expect(numberOrNull('')).toBe(null)
    expect(numberOrNull('n/a')).toBe(null)
  })
})

describe('fxRate', () => {
  it('prefers the rate struck on the row over the planning rate', () => {
    expect(fxRate(row())).toBe(0.54)
  })

  it('falls back to the planning rate when the row struck none', () => {
    expect(fxRate(row({ price_exchange_rate: null }))).toBe(0.45)
  })

  it('is an em dash on a row from an API that does not project FX yet', () => {
    expect(fxText({ guid: 'g1', code: 'ABC-01' })).toBe(DASH)
  })

  it('prints six-decimal storage at the four the office reads', () => {
    expect(fxText(row())).toBe('0.5400')
  })
})

describe('markupPct', () => {
  it('states the trade markup over landed cost', () => {
    expect(markupPct(row())).toBeCloseTo(62.5, 10)
    expect(markupText(row())).toBe('62.5%')
  })

  it('reads the figures as the strings pg sends', () => {
    expect(markupText(row({ landed_cost_nz: '40', trade_sell_price_nz: '100' }))).toBe('150.0%')
  })

  it('refuses to divide by an uncosted row', () => {
    expect(markupPct(row({ landed_cost_nz: '0.0000' }))).toBe(null)
    expect(markupText(row({ landed_cost_nz: '0.0000' }))).toBe(DASH)
    expect(markupText(row({ landed_cost_nz: 0 }))).toBe(DASH)
  })

  it('says nothing rather than 0% when either end is missing', () => {
    expect(markupText(row({ landed_cost_nz: null }))).toBe(DASH)
    expect(markupText(row({ trade_sell_price_nz: null }))).toBe(DASH)
    expect(markupText({})).toBe(DASH)
  })

  it('reports a house sold under landed cost as the negative it is', () => {
    expect(markupText(row({ trade_sell_price_nz: '90' }))).toBe('-10.0%')
  })
})
