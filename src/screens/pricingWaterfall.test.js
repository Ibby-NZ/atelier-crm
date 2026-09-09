import { describe, it, expect } from 'vitest'
import {
  EMPTY_DRAFT,
  PARAMETER_FIELDS,
  STEP_INPUT,
  buildFxBody,
  buildParametersBody,
  d365Hint,
  draftFromParameters,
  draftIsBlank,
  inputText,
  nzd,
  parseWholesale,
  pickableHouses,
  waterfallPath,
} from './pricingWaterfall.js'

describe('waterfallPath', () => {
  it('carries the house and the rate, and only the optional inputs that are set', () => {
    expect(waterfallPath({ brandId: 20, wholesaleRate: 100 })).toBe('/admin/pricing/waterfall?brand_id=20&wholesale_rate=100')
    expect(waterfallPath({ brandId: 20, wholesaleRate: 12.5, dutyClass: 'A', category: 'fabric' })).toBe(
      '/admin/pricing/waterfall?brand_id=20&wholesale_rate=12.5&duty_class=A&category=fabric'
    )
  })
})

describe('parseWholesale', () => {
  it('takes a non-negative number and refuses the rest', () => {
    expect(parseWholesale('100')).toBe(100)
    expect(parseWholesale(' 12.5 ')).toBe(12.5)
    expect(parseWholesale('0')).toBe(0)
    expect(parseWholesale('')).toBe(null)
    expect(parseWholesale('-1')).toBe(null)
    expect(parseWholesale('abc')).toBe(null)
  })
})

describe('inputText', () => {
  it('says the value in its unit and where it came from', () => {
    expect(inputText('discount_percent', { value: 25, source: 'terms', detail: { shape: 'flat' } })).toBe('25% · supplier terms')
    expect(inputText('discount_percent', { value: 64, source: 'terms', detail: { shape: 'chain' } })).toBe('64% (compounded chain) · supplier terms')
    expect(inputText('trade_markup_percent', { value: 89, source: 'house' })).toBe('89% · this house')
    expect(inputText('clearance_percent', { value: 10, source: 'supplier' })).toBe('10% · supplier default')
    expect(inputText('fx_rate', { value: 0.52, source: 'fx' }, 'EUR')).toBe('0.52 EUR per NZ$1 · exchange rate')
    expect(inputText('freight', { value: 30, source: 'freight-ledger', detail: { basis: 'dollar', unit: 'metre' } })).toBe('$30.00 / metre · freight ledger')
    expect(inputText('freight', { value: 8, source: 'freight-ledger', detail: { basis: 'percent' } })).toBe('8% · freight ledger')
    expect(inputText('handling', { value: 2.5, source: 'supplier' })).toBe('$2.50 · supplier default')
    expect(inputText('retail_markup', { value: 1.3, source: 'terms' })).toBe('×1.3 · supplier terms')
  })

  it('names a missing input and a duty-free line rather than printing 0', () => {
    expect(inputText('freight', { value: null, source: 'missing' })).toBe('not set')
    expect(inputText('duty_percent', { value: 0, source: 'none' })).toBe('0% · no duty class')
    expect(inputText('duty_percent', undefined)).toBe('—')
  })

  it('maps every step after wholesale to one input', () => {
    expect(Object.keys(STEP_INPUT)).toEqual([
      'export_price', 'price_ex_duty', 'price_incl_duty', 'freight_amount',
      'landed_ex_handling', 'landed', 'trade_sell', 'retail_sell',
    ])
  })
})

describe('nzd', () => {
  it('prints dollars and dashes a step the waterfall could not reach', () => {
    expect(nzd(209.25)).toBe('$209.25')
    expect(nzd('1234.5')).toBe('$1,234.50')
    expect(nzd(null)).toBe('—')
  })
})

describe('the parameter form', () => {
  const row = { duty_percent_a: 5, duty_percent_b: null, duty_percent_c: 10, clearance_percent: 10, trade_markup_percent: 85, fx_margin_percent: null, handling: 2.5, note: 'From Dynamics' }

  it('drafts strings from a row, blank for null', () => {
    expect(draftFromParameters(row)).toEqual({
      duty_percent_a: '5', duty_percent_b: '', duty_percent_c: '10', clearance_percent: '10',
      trade_markup_percent: '85', fx_margin_percent: '', handling: '2.5', note: 'From Dynamics',
    })
    expect(draftFromParameters(null)).toEqual(EMPTY_DRAFT)
    expect(draftIsBlank(EMPTY_DRAFT)).toBe(true)
    expect(draftIsBlank(draftFromParameters(row))).toBe(false)
  })

  it('builds a PUT of the whole set: blank clears, numbers are numbers', () => {
    const built = buildParametersBody({ ...draftFromParameters(row), duty_percent_c: '' })
    expect(built.ok).toBe(true)
    expect(built.body).toEqual({
      duty_percent_a: 5, duty_percent_b: null, duty_percent_c: null, clearance_percent: 10,
      trade_markup_percent: 85, fx_margin_percent: null, handling: 2.5, note: 'From Dynamics',
    })
    expect(Object.keys(built.body)).toHaveLength(PARAMETER_FIELDS.length + 1)
  })

  it('refuses a word or a negative, naming the field', () => {
    expect(buildParametersBody({ ...EMPTY_DRAFT, handling: 'two' })).toEqual({ ok: false, error: 'Handling must be a number.' })
    expect(buildParametersBody({ ...EMPTY_DRAFT, duty_percent_a: '-5' })).toEqual({ ok: false, error: 'Duty A cannot be negative.' })
  })

  it('shows the Dynamics figure under a field the export states, and nothing where it does not', () => {
    const d365 = { duty_rate_a: 5, duty_rate_b: null, clearance_percent: 10, trade_markup_percent: 85 }
    expect(d365Hint(d365, PARAMETER_FIELDS[0])).toBe('Dynamics: 5%')
    expect(d365Hint(d365, PARAMETER_FIELDS[1])).toBe(null)
    // FX margin and handling have no Dynamics column at all.
    expect(d365Hint(d365, PARAMETER_FIELDS.find((f) => f.key === 'handling'))).toBe(null)
    expect(d365Hint(null, PARAMETER_FIELDS[0])).toBe(null)
  })
})

describe('buildFxBody', () => {
  it('takes a positive rate and an optional day', () => {
    expect(buildFxBody({ rate: '0.52', set_on: '' })).toEqual({ ok: true, body: { rate: 0.52 } })
    expect(buildFxBody({ rate: '0.52', set_on: '2026-01-01' })).toEqual({ ok: true, body: { rate: 0.52, set_on: '2026-01-01' } })
  })

  it('refuses zero, a word, and a malformed day', () => {
    expect(buildFxBody({ rate: '0' }).ok).toBe(false)
    expect(buildFxBody({ rate: 'x' }).ok).toBe(false)
    expect(buildFxBody({ rate: '0.5', set_on: '1/1/26' }).ok).toBe(false)
  })
})

describe('pickableHouses', () => {
  it('drops archived houses and sorts by name without mutating the list', () => {
    const brands = [
      { id: 2, name: 'Rubelli', archived_at: null },
      { id: 3, name: 'Brochier', archived_at: '2026-09-01' },
      { id: 1, name: 'Kieffer', archived_at: null },
    ]
    const copy = brands.map((b) => ({ ...b }))
    expect(pickableHouses(brands).map((b) => b.name)).toEqual(['Kieffer', 'Rubelli'])
    expect(brands).toEqual(copy)
  })
})
