import { describe, it, expect, beforeEach } from 'vitest'
import { stageBatch, getStagedBatches, clearBatches } from './importStore.js'

// Repeatable import (15 Jul): the business runs live during migration, so re-staging a supplier
// REPLACES its batch and merges rows by normalized code — no duplicate batches, no duplicate rows.
describe('importStore — upsert on re-import', () => {
  beforeEach(() => clearBatches())

  const rowsA = [
    { code: 'W7004-01', wholesaleForeign: 39 },
    { code: 'W7004-02', wholesaleForeign: 39 },
  ]

  it('stages a first batch as a new record', () => {
    const res = stageBatch({ supplierName: 'Colefax & Fowler', rows: rowsA })
    expect(res.replaced).toBe(false)
    expect(res.added).toBe(2)
    expect(getStagedBatches().length).toBe(1)
  })

  it('re-staging the same supplier replaces the batch instead of adding a second', () => {
    stageBatch({ supplierName: 'Colefax & Fowler', rows: rowsA })
    const res = stageBatch({ supplierName: 'Colefax & Fowler', rows: rowsA })
    expect(res.replaced).toBe(true)
    expect(getStagedBatches().length).toBe(1)
  })

  it('merges rows by code — re-imported codes update, new codes are added', () => {
    stageBatch({ supplierName: 'Colefax & Fowler', rows: rowsA })
    const res = stageBatch({
      supplierName: 'Colefax & Fowler',
      rows: [
        { code: 'W7004-01', wholesaleForeign: 42 }, // updated price
        { code: 'W7011-04', wholesaleForeign: 50 }, // new code
      ],
    })
    expect(res.updated).toBe(1)
    expect(res.added).toBe(1)
    const batch = getStagedBatches()[0]
    expect(batch.count).toBe(3)
    expect(batch.rows.find((r) => r.code === 'W7004-01').wholesaleForeign).toBe(42)
  })

  it('keeps a different supplier as its own batch', () => {
    stageBatch({ supplierName: 'Colefax & Fowler', rows: rowsA })
    stageBatch({ supplierName: 'Larsen', rows: [{ code: 'L1', wholesaleForeign: 10 }] })
    expect(getStagedBatches().length).toBe(2)
  })

  it('dedupes within a single import (last row wins per code)', () => {
    const res = stageBatch({
      supplierName: 'Larsen',
      rows: [
        { code: 'L1', wholesaleForeign: 10 },
        { code: 'L1', wholesaleForeign: 12 },
      ],
    })
    expect(res.batch.rows.length).toBe(1)
    expect(res.batch.rows[0].wholesaleForeign).toBe(12)
  })

  it('returns copies — mutating the result does not corrupt the store', () => {
    stageBatch({ supplierName: 'Colefax & Fowler', rows: rowsA })
    const snap = getStagedBatches()
    snap[0].rows.push({ code: 'HACK' })
    expect(getStagedBatches()[0].rows.length).toBe(2)
  })
})
