import { describe, it, expect } from 'vitest'
import {
  YARDS_PER_METRE, metresToYards, yardsToMetres, parseQuantity, dualUnit,
  formatQuantity, unitLabel, parseQuantityUnit, unitFromPackType,
} from './units.js'

describe('metre ⇄ yard conversion (open item F / A11)', () => {
  it('uses the exact factor 1 m = 1.0936133 yd', () => {
    expect(YARDS_PER_METRE).toBeCloseTo(1 / 0.9144, 7)
  })

  it('converts metres to yards', () => {
    expect(metresToYards(18)).toBeCloseTo(19.685, 3)
    expect(metresToYards(0)).toBe(0)
  })

  it('round-trips metres → yards → metres', () => {
    expect(yardsToMetres(metresToYards(26))).toBeCloseTo(26, 9)
  })
})

describe('parseQuantity — quantities are still free text (F/A11)', () => {
  it('pulls the number out of "18 m"', () => {
    expect(parseQuantity('18 m')).toBe(18)
    expect(parseQuantity('26 m')).toBe(26)
  })

  it('falls back to 0 on non-numeric text', () => {
    expect(parseQuantity('POA')).toBe(0)
    expect(parseQuantity('')).toBe(0)
  })
})

describe('dualUnit — both units from one metre figure', () => {
  it('renders the yard reference to one decimal', () => {
    expect(dualUnit(18).yards).toBe('19.7 yd')
    expect(dualUnit(12).yards).toBe('13.1 yd')
  })
})

// Unit of measure format (decision 7, 15 Jul): numeric value + text descriptor.
describe('formatQuantity / unitLabel — value + descriptor', () => {
  it('formats a value with its unit abbreviation', () => {
    expect(formatQuantity(18)).toBe('18 m')
    expect(formatQuantity(2, 'roll')).toBe('2 roll')
    expect(formatQuantity(4, 'piece')).toBe('4 pc')
  })

  it('spells the "per <unit>" descriptor', () => {
    expect(unitLabel('metre')).toBe('per metre')
    expect(unitLabel('piece')).toBe('per piece')
    expect(unitLabel('hide')).toBe('per hide')
  })
})

describe('parseQuantityUnit — split free text into { value, unit }', () => {
  it('reads value and unit from common quantity strings', () => {
    expect(parseQuantityUnit('18 m')).toEqual({ value: 18, unit: 'metre' })
    expect(parseQuantityUnit('2 rolls')).toEqual({ value: 2, unit: 'roll' })
    expect(parseQuantityUnit('3 hides')).toEqual({ value: 3, unit: 'hide' })
  })

  it('defaults a bare number to metres', () => {
    expect(parseQuantityUnit(18)).toEqual({ value: 18, unit: 'metre' })
  })

  it('falls back to { value: 0, unit: metre } on junk', () => {
    expect(parseQuantityUnit('POA')).toEqual({ value: 0, unit: 'metre' })
    expect(parseQuantityUnit('')).toEqual({ value: 0, unit: 'metre' })
  })

  it('round-trips formatQuantity → parseQuantityUnit', () => {
    expect(parseQuantityUnit(formatQuantity(5, 'roll'))).toEqual({ value: 5, unit: 'roll' })
  })
})

describe('unitFromPackType — map an import Pack Type to a unit', () => {
  it('maps known pack types (case-insensitive)', () => {
    expect(unitFromPackType('Roll')).toBe('roll')
    expect(unitFromPackType('metre')).toBe('metre')
    expect(unitFromPackType('Panel')).toBe('panel')
  })

  it('defaults blank/unknown to metre', () => {
    expect(unitFromPackType('')).toBe('metre')
    expect(unitFromPackType('widget')).toBe('metre')
  })
})
