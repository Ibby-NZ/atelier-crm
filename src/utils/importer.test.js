import { describe, it, expect } from 'vitest'
import { parseCSV } from './csv.js'
import { autoMapColumns, parseRate, parseFreight, buildPreview } from './importer.js'
import { IMPORT_COLUMNS, colefaxSampleCSV } from '../data/importSamples.js'
import { supplierByName } from '../data/suppliers.js'

const colefax = supplierByName('Colefax & Fowler')
const loroPiana = supplierByName('Loro Piana')

describe('parseRate', () => {
  it('reads blanks, percents and fractions', () => {
    expect(parseRate('')).toBeNull()
    expect(parseRate('8')).toBeCloseTo(0.08, 6)
    expect(parseRate('8%')).toBeCloseTo(0.08, 6)
    expect(parseRate('0.08')).toBeCloseTo(0.08, 6)
    expect(Number.isNaN(parseRate('POA'))).toBe(true)
  })
})

describe('import engine — the Colefax & Fowler sample end to end', () => {
  const preview = buildPreview(parseCSV(colefaxSampleCSV), colefax)

  it('auto-maps all 15 template columns (Pattern Match added 15 Jul)', () => {
    const { mapped, unmapped } = autoMapColumns(parseCSV(colefaxSampleCSV).header)
    expect(mapped).toEqual(IMPORT_COLUMNS)
    expect(unmapped).toEqual([])
  })

  it('prices 7 of 9 rows — POA and AUD are errors', () => {
    expect(preview.rows.length).toBe(9)
    expect(preview.errorCount).toBe(2)
    expect(preview.stageable).toBe(7)
    const poa = preview.rows.find((r) => r.code === 'F4901-01')
    expect(poa.wf).toBeNull()
    expect(poa.issues.some((i) => i.level === 'error' && i.field === 'Wholesale Rate')).toBe(true)
    const aud = preview.rows.find((r) => r.code === 'F4901-09')
    expect(aud.issues.some((i) => i.level === 'error' && i.message.includes("'AUD'"))).toBe(true)
  })

  it('takes the 7% duty placeholder for blank and coded duty, flagged A10', () => {
    const blank = preview.rows.find((r) => r.code === 'W7004-01')
    expect(blank.dutyPct).toBeCloseTo(0.07, 6)
    expect(blank.issues.some((i) => i.level === 'warn' && i.message.includes('A10'))).toBe(true)
    const coded = preview.rows.find((r) => r.code === 'W7011-04')
    expect(coded.dutyPct).toBeCloseTo(0.07, 6)
    expect(coded.issues.some((i) => i.message.includes("'A'"))).toBe(true)
  })

  it('defaults a blank currency to the supplier currency with a warning', () => {
    const row = preview.rows.find((r) => r.code === 'F4901-05')
    expect(row.currency).toBe('GBP')
    expect(row.issues.some((i) => i.level === 'warn' && i.field === 'Currency')).toBe(true)
    expect(row.wf).not.toBeNull()
  })

  it('prices clean GBP rows through the waterfall with the supplier-average chain', () => {
    const row = preview.rows.find((r) => r.code === 'W7004-01')
    expect(row.chain).toEqual([0.05])
    expect(row.wf).not.toBeNull()
    expect(row.wf.wholesale).toBeCloseTo(39 / 0.42 * 1.1, 1)
  })

  it('skips P2 entirely for a discount-inclusive supplier (Loro Piana)', () => {
    const inclusive = buildPreview(parseCSV(colefaxSampleCSV), loroPiana)
    const row = inclusive.rows.find((r) => r.code === 'W7004-01')
    expect(row.chain).toEqual([])
    expect(row.discountLabel).toBe('Included in supplied price — P2 skipped')
    expect(row.wf.supplierDiscounted).toBe(row.wf.wholesale)
  })

  // Decision 6 (15 Jul): the sample's codes are already canonical, so no Code warnings fire.
  it('raises no Code standardisation warnings on the already-canonical sample', () => {
    expect(preview.rows.every((r) => !r.issues.some((i) => i.field === 'Code'))).toBe(true)
    const row = preview.rows.find((r) => r.code === 'W7004-01')
    expect(row.rawCode).toBe('W7004-01')
  })

  // Decision 8 (15 Jul): the technical product fields flow through to the resolved row.
  it('carries repeat / vertical repeat / pattern match through', () => {
    const wall = preview.rows.find((r) => r.code === 'W7004-01')
    expect(wall.repeat).toBe('64cm')
    expect(wall.verticalRepeat).toBe('64cm')
    expect(wall.patternMatch).toBe('Straight')
    const plain = preview.rows.find((r) => r.code === 'F4855-07')
    expect(plain.repeat).toBe('')
    expect(plain.patternMatch).toBe('')
  })

  // Decision 7 (15 Jul): the pack type becomes the row's unit of measure.
  it('reads the unit of measure from Pack Type', () => {
    expect(preview.rows.find((r) => r.code === 'W7004-01').unit).toBe('roll')
    expect(preview.rows.find((r) => r.code === 'F4855-07').unit).toBe('metre')
  })

  // Decision 1 (15 Jul): the sample quotes freight as a percentage ('8'), so it stays percent mode.
  it('keeps the sample freight in percent mode', () => {
    const row = preview.rows.find((r) => r.code === 'W7004-01')
    expect(row.freightMode).toBe('percent')
    expect(row.freightPct).toBeCloseTo(0.08, 6)
  })
})

describe('parseFreight — dollar vs percent freight (decision 1, 15 Jul)', () => {
  it('reads a dollar value', () => {
    expect(parseFreight('$30', colefax)).toMatchObject({ mode: 'dollar', value: 30 })
    expect(parseFreight('30 $', colefax)).toMatchObject({ mode: 'dollar', value: 30 })
  })

  it('reads a percentage', () => {
    expect(parseFreight('8', colefax)).toMatchObject({ mode: 'percent', value: 0.08 })
    expect(parseFreight('8%', colefax)).toMatchObject({ mode: 'percent', value: 0.08 })
  })

  it('defaults a blank cell to the supplier $ lookup with a warning', () => {
    const r = parseFreight('', colefax) // Colefax freightDollar: 20
    expect(r).toMatchObject({ mode: 'dollar', value: 20 })
    expect(r.issues.some((i) => i.level === 'warn' && i.field === 'Freight Rate')).toBe(true)
  })

  it('falls back to the 8% placeholder with a warning on junk', () => {
    const r = parseFreight('n/a', colefax)
    expect(r).toMatchObject({ mode: 'percent', value: 0.08 })
    expect(r.issues.length).toBe(1)
  })
})

describe('code standardisation on import (decision 6, 15 Jul)', () => {
  const messyCSV = `Product Range,Code,Description,Item Type,Pack Type,Width,Duty Rate,Wholesale Rate,Currency,Freight Rate
Lindon Wovens,f4855 / 12,Lindon Chenille — Slate,Fabric,Metre,140cm,,68.00,GBP,8`

  it('normalises a messy code and warns, preserving the raw', () => {
    const preview = buildPreview(parseCSV(messyCSV), colefax)
    const row = preview.rows[0]
    expect(row.code).toBe('F4855-12')
    expect(row.rawCode).toBe('f4855 / 12')
    expect(row.issues.some((i) => i.field === 'Code' && i.level === 'warn')).toBe(true)
  })
})
