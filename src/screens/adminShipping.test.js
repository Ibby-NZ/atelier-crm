import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pageCount } from '../admin/list.js'
import {
  SHIPPING_LIST_LIMIT,
  annotateTiers,
  describeShippingRate,
  formatQty,
  ratePatch,
  tierProblem,
  zonesOf,
} from './adminShipping.js'

// Two zones, the shape the seed produces: a 0 floor and a 20 floor each.
const tier = (id, zone, threshold_qty, rate_cents) => ({ id, zone, threshold_qty, rate_cents })
const RATES = Object.freeze([
  tier(1, 'Metro', 0, 1500),
  tier(2, 'Metro', 20, 2500),
  tier(3, 'Rural', 0, 2200),
  tier(4, 'Rural', 20, 3600),
])

describe('formatQty', () => {
  it('drops the numeric(12,2) tail pg puts on a floor', () => {
    expect(formatQty(20)).toBe('20')
    expect(formatQty('20.00')).toBe('20')
    expect(formatQty(0)).toBe('0')
  })

  it('keeps a genuine fraction', () => {
    expect(formatQty('2.50')).toBe('2.5')
  })

  it('does not print NaN at a person', () => {
    expect(formatQty(undefined)).toBe('—')
    expect(formatQty('twenty')).toBe('—')
  })
})

describe('describeShippingRate', () => {
  it('names the zone alongside the floor', () => {
    expect(describeShippingRate({ zone: 'Rural', threshold_qty: 20 })).toBe(
      'Rural (from 20 items)'
    )
  })

  it('tells two zones’ tiers at the same floor apart', () => {
    // Every zone has a tier at 0 and most have one at 20, so a name built from
    // the floor alone would ask a question three zones can answer.
    const metro = tier(2, 'Metro', 20, 2500)
    const rural = tier(4, 'Rural', 20, 3600)
    expect(metro.threshold_qty).toBe(rural.threshold_qty)
    expect(describeShippingRate(metro)).not.toBe(describeShippingRate(rural))
  })

  it('returns undefined for a zone-less row, so the kit says "That freight tier"', () => {
    expect(describeShippingRate({})).toBeUndefined()
    expect(describeShippingRate()).toBeUndefined()
    expect(describeShippingRate({ zone: '   ', threshold_qty: 0 })).toBeUndefined()
  })
})

describe('annotateTiers', () => {
  it('describes the lowest tier by its ceiling alone', () => {
    // getShippingQuote falls back to the lowest tier when the quantity is under
    // every floor, so "0 to under 20" would be a band with a gap beneath it —
    // and a lowest floor of 5 still quotes for a single item.
    const [lowest] = annotateTiers([tier(1, 'Metro', 5, 1500), tier(2, 'Metro', 20, 2500)])
    expect(lowest.band).toBe('under 20 items')
  })

  it('describes the top tier as open-ended', () => {
    const annotated = annotateTiers(RATES)
    expect(annotated.find((row) => row.id === 2).band).toBe('20 items or more')
    expect(annotated.find((row) => row.id === 4).band).toBe('20 items or more')
  })

  it('bounds a middle tier at both ends', () => {
    const annotated = annotateTiers([
      tier(1, 'Metro', 0, 1500),
      tier(2, 'Metro', 10, 2000),
      tier(3, 'Metro', 20, 2500),
    ])
    expect(annotated.map((row) => row.band)).toEqual([
      'under 10 items',
      '10 to under 20 items',
      '20 items or more',
    ])
  })

  it('flags the only tier in a zone — the one Delete will refuse', () => {
    const annotated = annotateTiers([...RATES, tier(5, 'Overseas', 0, 9000)])
    expect(annotated.find((row) => row.id === 5)).toMatchObject({
      band: 'any quantity',
      sole: true,
    })
    expect(annotated.filter((row) => row.sole)).toHaveLength(1)
  })

  it('bands each zone against its own tiers, not the whole table', () => {
    // The API returns one flat list ordered zone-then-floor; grouping by zone is
    // this function's job, and a tier banded against another zone's ladder would
    // read plausibly and be wrong.
    const annotated = annotateTiers([
      tier(1, 'Metro', 0, 1500),
      tier(2, 'Metro', 20, 2500),
      tier(3, 'Rural', 0, 2200),
    ])
    expect(annotated.find((row) => row.id === 3).band).toBe('any quantity')
    expect(annotated.find((row) => row.id === 1).band).toBe('under 20 items')
  })

  it('leaves the rows it was given alone', () => {
    const input = [tier(1, 'Metro', 0, 1500)]
    annotateTiers(input)
    expect(input[0]).toEqual(tier(1, 'Metro', 0, 1500))
  })

  it('survives an empty list', () => {
    expect(annotateTiers()).toEqual([])
    expect(annotateTiers([])).toEqual([])
  })
})

describe('zonesOf', () => {
  it('reads the zones off the tiers, once each, in the API’s order', () => {
    // A zone is not a table: it exists only while it has tiers, so this is the
    // only place the current set can come from.
    expect(zonesOf(RATES)).toEqual(['Metro', 'Rural'])
    expect(zonesOf([])).toEqual([])
  })
})

describe('ratePatch', () => {
  const row = tier(1, 'Metro', 0, 1500)

  it('sends only the changed rate, in whole cents', () => {
    expect(ratePatch(row, '18.40')).toEqual({ patch: { rate_cents: 1840 } })
  })

  it('sends nothing when the box still holds the stored figure', () => {
    expect(ratePatch(row, '15.00')).toEqual({ patch: {} })
    expect(ratePatch(row, '15')).toEqual({ patch: {} })
  })

  it('refuses a blank rather than sending it as a clear', () => {
    // rate_cents is NOT NULL and the PATCH names it `required` — there is no
    // second editable column, so an empty body would be a 400 with nothing to
    // say why.
    expect(ratePatch(row, '')).toHaveProperty('error')
    expect(ratePatch(row, '   ')).toHaveProperty('error')
  })

  it('refuses an amount that is not money', () => {
    expect(ratePatch(row, 'free')).toHaveProperty('error')
    expect(ratePatch(row, '-4')).toHaveProperty('error')
  })

  it('accepts a zero rate — free freight is a real tier', () => {
    expect(ratePatch(row, '0')).toEqual({ patch: { rate_cents: 0 } })
  })

  it('compares against pg’s string form of the stored figure', () => {
    expect(ratePatch({ rate_cents: '1500' }, '15.00')).toEqual({ patch: {} })
  })
})

describe('tierProblem', () => {
  it('passes a floor of 0, which is what every zone needs', () => {
    expect(tierProblem({ zone: 'Metro', threshold_qty: 0, rate_cents: 1500 })).toBeNull()
    expect(tierProblem({ threshold_qty: 20 })).toBeNull()
  })

  it('catches a negative floor before the API’s schema does', () => {
    expect(tierProblem({ threshold_qty: -1 })).toBe('Quantity from must be 0 or more.')
    expect(tierProblem({})).toBe('Quantity from must be 0 or more.')
  })
})

describe('SHIPPING_LIST_LIMIT', () => {
  it('keeps an unpaged answer at one page', () => {
    // /admin/shipping-rates returns every tier with no meta and declares no
    // querystring schema at all, so a second page could never be fetched. The
    // kit's default 25 would report two pages over 30 tiers.
    expect(pageCount(30, SHIPPING_LIST_LIMIT)).toBe(1)
    expect(pageCount(30, 25)).toBe(2)
  })
})

// "Create, edit rate, delete a tier" and "the last-tier 409 is surfaced as a
// readable refusal" are acceptance criteria about a screen, and with no jsdom a
// source scan is the only way to hold them — the same idiom
// src/admin/useCrudScreen.test.js uses on the kit itself.
const source = readFileSync(new URL('./AdminShipping.jsx', import.meta.url), 'utf8')

describe('AdminShipping.jsx', () => {
  it('deletes through the kit', () => {
    expect(source).toContain('useCrudScreen')
    expect(source).toContain('ConfirmDialog')
    expect(source).toContain('remove.ask')
  })

  it('owns no part of the delete flow itself', () => {
    expect(source).not.toContain('apiDelete')
    expect(source).not.toContain('attemptDelete')
    expect(source).not.toContain('describeBlockers')
    expect(source).not.toContain('deleteDialog')
    expect(source).not.toContain('role="dialog"')
  })

  it('offers no archive escape, because a freight tier has none', () => {
    // shipping_rates has no archived_at column and the API's refusal says
    // archivable: false, so there is no endpoint to point a second button at.
    // Scanned as the path fragment rather than the word: the file's own prose
    // explains the absence.
    expect(source).not.toContain('/archive')
    expect(source).not.toContain('archiveInsteadPath')
  })

  it('adds no paginator', () => {
    expect(source).not.toContain('Pagination')
    expect(source).not.toMatch(/Previous/)
  })

  it('offers create, rate edit and delete, and nothing that moves the identity key', () => {
    // (zone, threshold_qty) is what the quote resolves against; PATCH accepts
    // rate_cents alone, so the row's only input is the rate.
    expect(source).toContain("apiSend('POST', '/admin/shipping-rates'")
    expect(source).toContain("apiSend('PATCH', `/admin/shipping-rates/${rate.id}`")
    expect(source).toContain('ratePatch')
    expect(source).toContain('TIER_FIELDS')
  })
})
