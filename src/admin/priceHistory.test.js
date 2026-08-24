import { describe, it, expect } from 'vitest'
import {
  asAtLookup,
  dayOf,
  isDenied,
  priceMoveText,
  productHistoryPath,
  rateHistoryPath,
  rateMove,
  sourceLabel,
} from './priceHistory.js'

describe('paths', () => {
  it('addresses each history by its row', () => {
    expect(productHistoryPath(7)).toBe('/admin/products/7/price-history')
    expect(rateHistoryPath(19_401)).toBe('/admin/price-list-items/19401/price-history')
  })
})

describe('asAtLookup', () => {
  it('builds the as-at query for a full date', () => {
    expect(asAtLookup(41, '2023-06-01')).toEqual({
      path: '/admin/price-list-items/41/rate?as_at=2023-06-01',
    })
  })

  it('asks for a date before asking the API', () => {
    // The querystring schema requires as_at, so sending nothing would be a 400
    // phrased for a machine; these are the two person-sized mistakes.
    expect(asAtLookup(41, '')).toEqual({ error: 'Choose a date to look up first.' })
    expect(asAtLookup(41, '  ')).toEqual({ error: 'Choose a date to look up first.' })
    expect(asAtLookup(41, 'June 2023').error).toMatch(/full date/)
    expect(asAtLookup(41, '2023-6-1').error).toMatch(/full date/)
  })
})

describe('isDenied', () => {
  it('separates the finance gate from a fault', () => {
    // A 403 carries the API's own "needs finance access. Ask a director."
    // sentence and renders as the masked note; anything else is an error line.
    expect(isDenied({ status: 403 })).toBe(true)
    expect(isDenied({ status: 404 })).toBe(false)
    expect(isDenied({ status: 0 })).toBe(false)
    expect(isDenied(null)).toBe(false)
  })
})

describe('dayOf', () => {
  it('reads the LOCAL calendar day, not the UTC one', () => {
    // changed_at is a timestamptz serialised in UTC; slicing the ISO string
    // would date a NZ afternoon's change tomorrow. Built from a local Date so
    // the assertion holds in any timezone the tests run in.
    const local = new Date(2026, 7, 12, 9, 30)
    expect(dayOf(local)).toBe('2026-08-12')
    expect(dayOf(local.toISOString())).toBe('2026-08-12')
  })

  it('shows nothing rather than "Invalid Date"', () => {
    expect(dayOf(null)).toBe('')
    expect(dayOf('')).toBe('')
    expect(dayOf('not a time')).toBe('')
  })
})

describe('sourceLabel', () => {
  it('names the file for an import and the person for a manual edit', () => {
    expect(
      sourceLabel({ source: 'import', source_file: 'BOUSSAC FABRIC PL 2026.csv' })
    ).toBe('Import — BOUSSAC FABRIC PL 2026.csv')
    expect(sourceLabel({ source: 'manual', changed_by_name: 'Liz Harrison' })).toBe(
      'Manual — Liz Harrison'
    )
  })

  it('still reads when the file or the login is gone', () => {
    expect(sourceLabel({ source: 'import', source_file: null })).toBe('Import')
    expect(sourceLabel({ source: 'manual', changed_by_name: null })).toBe('Manual')
    expect(sourceLabel({})).toBe('—')
  })
})

describe('rateMove', () => {
  it('states the move once, in the row currency', () => {
    expect(rateMove({ old_rate: 58.5, new_rate: 60, currency: 'EUR' })).toBe('58.5 → 60 EUR')
  })
})

describe('priceMoveText', () => {
  it('draws a moved figure as a move, in dollars', () => {
    expect(priceMoveText(18600, 19200)).toEqual({ text: '186.00 → 192.00', moved: true })
  })

  it('draws the figure that rode along unchanged as itself', () => {
    // Both prices ride on every history row; only the one that moved is drawn
    // as a change, or every row would look like two edits.
    expect(priceMoveText(9900, 9900)).toEqual({ text: '99.00', moved: false })
    expect(priceMoveText(null, null)).toEqual({ text: '—', moved: false })
  })

  it('treats a price being set or cleared as a move', () => {
    expect(priceMoveText(null, 18600)).toEqual({ text: '— → 186.00', moved: true })
    expect(priceMoveText(18600, null)).toEqual({ text: '186.00 → —', moved: true })
  })
})
