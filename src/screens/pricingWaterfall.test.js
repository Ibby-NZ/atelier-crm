import { describe, it, expect } from 'vitest'
import {
  KEY_STEPS,
  RAIL_ROWS,
  STEP_INPUT,
  cleanOverrides,
  defaultHouseId,
  foreign,
  fxBodyFrom,
  nzd,
  parseWholesale,
  pickableHouses,
  railDraftValue,
  railValueText,
  savableBody,
  savableColumn,
  sourceLabel,
  stepOp,
  unsavableTouched,
  waterfallPath,
} from './pricingWaterfall.js'

// One preview as GET /admin/pricing/waterfall returns it — Rubelli at 100 EUR, duty A.
const preview = {
  currency: 'EUR',
  inputs: {
    discount_percent: { value: 25, source: 'terms', detail: { shape: 'flat' } },
    fx_rate: { value: 0.52, source: 'fx' },
    fx_margin_percent: { value: 10, source: 'supplier' },
    duty_percent: { value: 5, source: 'house', detail: { duty_class: 'A' } },
    freight: { value: 50, source: 'freight-ledger', detail: { basis: 'dollar', unit: 'metre' } },
    clearance_percent: { value: 10, source: 'house' },
    handling: { value: 2.5, source: 'supplier' },
    trade_markup_percent: { value: 85, source: 'house' },
    retail_markup: { value: 1.3, source: 'terms' },
  },
}

describe('waterfallPath', () => {
  it('carries the house and the rate, the optional inputs that are set, and clean what-ifs', () => {
    expect(waterfallPath({ brandId: 20, wholesaleRate: 100 })).toBe('/admin/pricing/waterfall?brand_id=20&wholesale_rate=100')
    expect(
      waterfallPath({ brandId: 20, wholesaleRate: 12.5, dutyClass: 'A', category: 'fabric', overrides: { trade_markup_percent: '90', freight: '', handling: 'x' } })
    ).toBe('/admin/pricing/waterfall?brand_id=20&wholesale_rate=12.5&duty_class=A&category=fabric&trade_markup_percent=90')
  })
})

describe('cleanOverrides', () => {
  it('keeps only rail keys holding a non-negative number', () => {
    expect(cleanOverrides({ trade_markup_percent: ' 90 ', freight: '', handling: 'two', clearance_percent: '-1', wholesale: '5' })).toEqual({
      trade_markup_percent: 90,
    })
    expect(cleanOverrides()).toEqual({})
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

describe('stepOp — the formula line under each step', () => {
  it('states the operation, the figure and its source for every step', () => {
    expect(stepOp('wholesale', preview)).toBe('supplier list price per unit, in EUR')
    expect(stepOp('export_price', preview)).toBe('− 25% supplier discount · supplier terms')
    expect(stepOp('price_ex_duty', preview)).toBe('÷ 0.52 EUR per NZ$1, softened by 10% margin · exchange rate')
    expect(stepOp('price_incl_duty', preview, 'A')).toBe('+ 5% duty (class A) · this house')
    expect(stepOp('freight_amount', preview)).toBe('+ $50.00 per metre freight · freight ledger')
    expect(stepOp('landed_ex_handling', preview)).toBe('× (1 + 10% clearance) over duty-paid value and freight · this house')
    expect(stepOp('landed', preview)).toBe('+ $2.50 warehouse handling per unit · supplier default')
    expect(stepOp('trade_sell', preview)).toBe('+ 85% trade markup on landed cost · this house')
    expect(stepOp('retail_sell', preview)).toBe('× 1.3 retail markup on landed cost · supplier terms')
  })

  it('names a missing input and points at the rail; a duty-free line says so', () => {
    const bare = { currency: 'EUR', inputs: { ...preview.inputs, freight: { value: null, source: 'missing' }, duty_percent: { value: 0, source: 'none' } } }
    expect(stepOp('freight_amount', bare)).toBe('Freight not set — enter it in the rail')
    expect(stepOp('price_incl_duty', bare)).toBe('no duty class on the line — no duty')
  })

  it('spells a chain and a percentage freight, and an edited value says so', () => {
    const p = {
      currency: 'EUR',
      inputs: {
        ...preview.inputs,
        discount_percent: { value: 64, source: 'terms', detail: { shape: 'chain' } },
        freight: { value: 8, source: 'freight-ledger', detail: { basis: 'percent' } },
        trade_markup_percent: { value: 95, source: 'manual' },
      },
    }
    expect(stepOp('export_price', p)).toBe('− 64% supplier discount (compounded chain) · supplier terms')
    expect(stepOp('freight_amount', p)).toBe('+ 8% of the duty-paid value · freight ledger')
    expect(stepOp('trade_sell', p)).toBe('+ 95% trade markup on landed cost · edited')
  })

  it('maps every step after wholesale to one rail input, and highlights the three sell-side keys', () => {
    expect(Object.keys(STEP_INPUT)).toEqual(['export_price', 'price_ex_duty', 'price_incl_duty', 'freight_amount', 'landed_ex_handling', 'landed', 'trade_sell', 'retail_sell'])
    expect(KEY_STEPS).toEqual(['landed', 'trade_sell', 'retail_sell'])
    expect(sourceLabel({ source: 'manual' })).toBe('edited')
    expect(sourceLabel(undefined)).toBe('—')
  })
})

describe('the rail', () => {
  it('prints a value in the row unit and dashes a missing one', () => {
    const row = (key) => RAIL_ROWS.find((r) => r.key === key)
    expect(railValueText(row('discount_percent'), preview.inputs.discount_percent)).toBe('25%')
    expect(railValueText(row('fx_rate'), preview.inputs.fx_rate)).toBe('0.52')
    expect(railValueText(row('handling'), preview.inputs.handling)).toBe('$2.50')
    expect(railValueText(row('retail_markup'), preview.inputs.retail_markup)).toBe('×1.3')
    expect(railValueText(row('freight'), { value: null, source: 'missing' })).toBe('—')
  })

  it('shows the override while typing, else the resolved value as typed text', () => {
    const row = RAIL_ROWS.find((r) => r.key === 'handling')
    expect(railDraftValue(row, preview.inputs.handling, {})).toBe('2.5')
    expect(railDraftValue(row, preview.inputs.handling, { handling: '4' })).toBe('4')
    expect(railDraftValue(row, { value: null, source: 'missing' }, {})).toBe('')
  })

  it('knows which rows a Save can write, and that duty follows the class in play', () => {
    const duty = RAIL_ROWS.find((r) => r.key === 'duty_percent')
    expect(savableColumn(duty, 'A')).toBe('duty_percent_a')
    expect(savableColumn(duty, '')).toBe(null)
    expect(savableColumn(RAIL_ROWS.find((r) => r.key === 'freight'))).toBe(null)
    expect(savableColumn(RAIL_ROWS.find((r) => r.key === 'fx_rate'))).toBe('fx')
    expect(savableColumn(RAIL_ROWS.find((r) => r.key === 'handling'))).toBe('handling')
  })
})

describe('savableBody — the PUT a Save writes', () => {
  const current = { duty_percent_a: 5, duty_percent_b: 5, duty_percent_c: null, clearance_percent: 10, trade_markup_percent: 85, fx_margin_percent: null, handling: null, note: 'From Dynamics' }

  it('merges the savable overrides over the current set, every column travelling', () => {
    expect(savableBody(current, { trade_markup_percent: '90', handling: '4', duty_percent: '7', freight: '60' }, 'B')).toEqual({
      duty_percent_a: 5, duty_percent_b: 7, duty_percent_c: null, clearance_percent: 10,
      trade_markup_percent: 90, fx_margin_percent: null, handling: 4, note: 'From Dynamics',
    })
  })

  it('starts from a blank set when the scope has none, and is null when nothing savable was touched', () => {
    expect(savableBody(null, { fx_margin_percent: '10' })).toEqual({
      duty_percent_a: null, duty_percent_b: null, duty_percent_c: null, clearance_percent: null,
      trade_markup_percent: null, fx_margin_percent: 10, handling: null, note: null,
    })
    expect(savableBody(current, { freight: '60', discount_percent: '30' })).toBe(null)
    expect(savableBody(current, { duty_percent: '7' }, '')).toBe(null) // no class in play
    expect(savableBody(current, {})).toBe(null)
  })

  it('names the what-ifs a Save cannot keep, and lifts an FX edit into its own body', () => {
    expect(unsavableTouched({ freight: '60', retail_markup: '1.4', handling: '4' }).map((r) => r.key)).toEqual(['freight', 'retail_markup'])
    expect(unsavableTouched({ duty_percent: '7' }, '').map((r) => r.key)).toEqual(['duty_percent'])
    expect(fxBodyFrom({ fx_rate: '0.55', handling: '4' })).toEqual({ rate: 0.55 })
    expect(fxBodyFrom({ fx_rate: '0' })).toBe(null)
    expect(fxBodyFrom({})).toBe(null)
  })
})

describe('money', () => {
  it('prints NZ dollars, a foreign figure with its code, and dashes what the waterfall could not reach', () => {
    expect(nzd(209.25)).toBe('$209.25')
    expect(nzd('1234.5')).toBe('$1,234.50')
    expect(nzd(null)).toBe('—')
    expect(foreign(100, 'EUR')).toBe('100.00 EUR')
    expect(foreign(null, 'EUR')).toBe('—')
  })
})

describe('the house picker', () => {
  const brands = [
    { id: 2, name: 'Rubelli', slug: 'rubelli-venezia', archived_at: null },
    { id: 3, name: 'Brochier', slug: 'brochier', archived_at: '2026-09-01' },
    { id: 1, name: 'Pierre Frey', slug: 'pierre-frey', archived_at: null },
  ]

  it('drops archived houses and sorts by name without mutating the list', () => {
    const copy = brands.map((b) => ({ ...b }))
    expect(pickableHouses(brands).map((b) => b.name)).toEqual(['Pierre Frey', 'Rubelli'])
    expect(brands).toEqual(copy)
  })

  it('opens on Pierre Frey when it is there, else the first house, else nothing', () => {
    expect(defaultHouseId(pickableHouses(brands))).toBe(1)
    expect(defaultHouseId([{ id: 9, slug: 'other' }])).toBe(9)
    expect(defaultHouseId([])).toBe('')
  })
})
