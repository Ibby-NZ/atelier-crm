import { describe, it, expect } from 'vitest'
import {
  REPORT_CATEGORIES,
  EMPTY_REPORT_FILTERS,
  buildReportQuery,
  reportFilterError,
  reportFiltersFromParams,
  reportSearchParams,
  hasReportFilters,
} from './reportFilters.js'
import { CATEGORY_OPTIONS, CATEGORY_VALUES, categoryLabel } from '../lib/categories.js'

describe('buildReportQuery', () => {
  it('builds nothing at all from an empty filter set', () => {
    expect(buildReportQuery()).toBe('')
    expect(buildReportQuery({})).toBe('')
    expect(buildReportQuery(EMPTY_REPORT_FILTERS)).toBe('')
  })

  // The API treats an empty value as no filter, but a URL saying `?brand_code=`
  // reads as one that filtered — so a blank is absent, never sent empty.
  it('leaves a blank or whitespace-only value out entirely', () => {
    expect(buildReportQuery({ category: '', from: '  ', brand_code: '\t', range: '' })).toBe('')
    expect(buildReportQuery({ category: 'fabric', range: '   ' })).toBe('?category=fabric')
  })

  it('emits every set filter, in one fixed key order whatever the input order', () => {
    const query = buildReportQuery({
      range: 'TREND',
      brand_code: 'CF',
      to: '2026-08-31',
      from: '2026-01-01',
      category: 'wallpaper',
    })
    expect(query).toBe('?category=wallpaper&from=2026-01-01&to=2026-08-31&brand_code=CF&range=TREND')
  })

  it('trims what the office typed before sending it', () => {
    expect(buildReportQuery({ brand_code: '  CF  ' })).toBe('?brand_code=CF')
  })

  // `range` is free text — `RAMM, SON & CROCKER` is a real value the office
  // holds, and an unencoded ampersand would become a second parameter.
  it('encodes free text so it survives the URL round trip', () => {
    const query = buildReportQuery({ range: 'RAMM, SON & CROCKER' })
    expect(query.startsWith('?range=')).toBe(true)
    expect(new URLSearchParams(query.slice(1)).get('range')).toBe('RAMM, SON & CROCKER')
    // Not two parameters.
    expect([...new URLSearchParams(query.slice(1)).keys()]).toEqual(['range'])
  })

  it('ignores a key the vocabulary does not know, the way the API whitelist does', () => {
    expect(buildReportQuery({ salesperson: 'rebecca', category: 'fabric' })).toBe(
      '?category=fabric'
    )
  })
})

describe('reportFilterError', () => {
  it('accepts an empty set, a one-sided range and an equal-day range', () => {
    expect(reportFilterError()).toBe('')
    expect(reportFilterError({ from: '2026-01-01' })).toBe('')
    expect(reportFilterError({ to: '2026-01-01' })).toBe('')
    expect(reportFilterError({ from: '2026-08-06', to: '2026-08-06' })).toBe('')
  })

  // The API refuses this too, but a backwards range's symptom over there is a
  // 400 after a round trip — catching it here names the mistake immediately,
  // the same posture drafts.js takes with a malformed URL.
  it('refuses a backwards range, naming both dates', () => {
    const message = reportFilterError({ from: '2026-08-06', to: '2026-01-01' })
    expect(message).toContain('2026-08-06')
    expect(message).toContain('2026-01-01')
  })
})

describe('the category vocabulary', () => {
  // The bar draws the ONE list this repo states, never a copy of it. It was a
  // four-value copy while the API held nine, and the symptom was a BLANK
  // select: a drill-down puts the clicked row's own category into the bar, so
  // `cushion` narrowed the table while the control it should have selected did
  // not exist. A controlled select whose value has no option shows nothing.
  it('offers the shared vocabulary itself, not a copy of it', () => {
    expect(REPORT_CATEGORIES).toBe(CATEGORY_OPTIONS)
    expect(REPORT_CATEGORIES.map((option) => option.value)).toEqual([...CATEGORY_VALUES])
    expect(REPORT_CATEGORIES).toHaveLength(9)
  })

  it('labels every option for the select', () => {
    for (const option of REPORT_CATEGORIES) {
      expect(option.label).toBeTruthy()
      expect(option.label).toBe(categoryLabel(option.value))
    }
  })

  // The five the vocabulary grew by are exactly the ones the old copy could not
  // draw, and each of them can arrive from a product-performance row.
  it('draws every category a drill-down can arrive with', () => {
    for (const value of ['bed-linen', 'towel', 'cushion', 'throw', 'misc']) {
      const applied = reportFiltersFromParams(new URLSearchParams(`r=orders&category=${value}`))
      expect(applied.category).toBe(value)
      expect(REPORT_CATEGORIES.some((option) => option.value === applied.category)).toBe(true)
    }
  })
})

// The bar in the URL — what makes a drill-down from another report's row land
// with its filter already applied (Userback 8287873).
describe('reportFiltersFromParams', () => {
  const params = (query) => new URLSearchParams(query)

  it('reads a bare URL as the cleared bar', () => {
    expect(reportFiltersFromParams(params(''))).toEqual(EMPTY_REPORT_FILTERS)
    expect(reportFiltersFromParams()).toEqual(EMPTY_REPORT_FILTERS)
  })

  it('reads every filter the bar draws, and nothing else', () => {
    const filters = reportFiltersFromParams(
      params('r=orders&category=fabric&from=2026-01-01&to=2026-08-31&brand_code=CF&range=TREND&owner=rebecca')
    )
    expect(filters).toEqual({
      category: 'fabric',
      from: '2026-01-01',
      to: '2026-08-31',
      brand_code: 'CF',
      range: 'TREND',
    })
  })

  it('treats a whitespace-only parameter as unset', () => {
    expect(reportFiltersFromParams(params('brand_code=+++')).brand_code).toBe('')
  })

  // The same rule orderSearchFromParams applies to `status`: a value the closed
  // select cannot draw is no filter at all. Forwarded, it would be a 400 from
  // the API's enum — which kills the whole report — under a blank select.
  it('drops a category the vocabulary does not hold', () => {
    expect(reportFiltersFromParams(params('category=curtain')).category).toBe('')
    expect(reportFiltersFromParams(params('category=Fabric')).category).toBe('')
    // The rest of the bar still applies; one bad filter is not a cleared bar.
    const filters = reportFiltersFromParams(params('category=curtain&from=2026-08-01'))
    expect(filters.from).toBe('2026-08-01')
  })

  // The round trip is what the screen actually does: apply writes the URL, the
  // next render reads it back, and the two must not drift.
  it('round-trips a filter set through the URL and back', () => {
    const filters = { ...EMPTY_REPORT_FILTERS, category: 'wallpaper', range: 'RAMM, SON & CROCKER' }
    const search = new URLSearchParams(reportSearchParams('orders', filters))
    expect(reportFiltersFromParams(search)).toEqual(filters)
    expect(search.get('r')).toBe('orders')
  })
})

describe('reportSearchParams', () => {
  it('names the report on its own when nothing is filtered', () => {
    expect(reportSearchParams('stock')).toEqual({ r: 'stock' })
    expect(reportSearchParams('stock', EMPTY_REPORT_FILTERS)).toEqual({ r: 'stock' })
  })

  // A URL saying `?brand_code=` reads as one that filtered — the same rule
  // buildReportQuery follows on the way to the API.
  it('leaves a blank filter out rather than writing an empty parameter', () => {
    expect(reportSearchParams('orders', { category: 'fabric', brand_code: '  ' })).toEqual({
      r: 'orders',
      category: 'fabric',
    })
  })
})

describe('hasReportFilters', () => {
  it('is false for nothing and for whitespace, true the moment one filter is set', () => {
    expect(hasReportFilters()).toBe(false)
    expect(hasReportFilters(EMPTY_REPORT_FILTERS)).toBe(false)
    expect(hasReportFilters({ range: '   ' })).toBe(false)
    expect(hasReportFilters({ category: 'fabric' })).toBe(true)
  })
})
