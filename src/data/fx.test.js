import { describe, it, expect } from 'vitest'
import { fxTable, fxCurrencies, fxInfo, isKnownCurrency, nzdMultiplier, toNzd } from './fx.js'

describe('fx — per-currency conversion (foreign per NZ$1 convention)', () => {
  it('converts at the actual rate without margin', () => {
    expect(nzdMultiplier('EUR', { withMargin: false })).toBeCloseTo(2.0408, 4)
    expect(nzdMultiplier('GBP', { withMargin: false })).toBeCloseTo(2.381, 3)
    expect(nzdMultiplier('USD', { withMargin: false })).toBeCloseTo(1.7857, 4)
  })

  it('applies the +10% forex margin by default', () => {
    expect(nzdMultiplier('EUR')).toBeCloseTo(2.2449, 4)
    expect(nzdMultiplier('GBP')).toBeCloseTo(2.619, 3)
    expect(nzdMultiplier('USD')).toBeCloseTo(1.9643, 4)
  })

  it('both conventions agree — margined multiplier ≈ 1 / CRM rate for every currency', () => {
    fxCurrencies.forEach((code) => {
      const viaCrm = 1 / fxTable[code].crm
      const relDiff = Math.abs(nzdMultiplier(code) - viaCrm) / viaCrm
      expect(relDiff).toBeLessThan(0.015)
    })
  })

  it('CRM is the actual rate with the margin baked in (÷1.1, rounded 2 dp)', () => {
    fxCurrencies.forEach((code) => {
      const derived = Math.round((fxTable[code].actual / 1.1) * 100) / 100
      expect(derived).toBe(fxTable[code].crm)
    })
  })

  it('toNzd matches the P1 wholesale path (EUR 48 → 107.7551 with margin)', () => {
    expect(toNzd(48, 'EUR', { withMargin: false }) * 1.1).toBeCloseTo(107.7551, 4)
  })

  it('falls back to EUR for unknown currencies, and reports known ones honestly', () => {
    expect(fxInfo('XXX')).toBe(fxTable.EUR)
    expect(fxInfo(null)).toBe(fxTable.EUR)
    expect(isKnownCurrency('GBP')).toBe(true)
    expect(isKnownCurrency('gbp')).toBe(true)
    expect(isKnownCurrency('AUD')).toBe(false)
    expect(isKnownCurrency('')).toBe(false)
  })
})
