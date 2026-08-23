import { describe, it, expect } from 'vitest'
import {
  REPORT_CATEGORIES,
  EMPTY_REPORT_FILTERS,
  buildReportQuery,
  reportFilterError,
  hasReportFilters,
} from './reportFilters.js'

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
  // A boundary copy of the API's four-value CHECK (atelier-api
  // PRODUCT_CATEGORIES). The API stays the authority — this is what lets the
  // select be drawn without a round trip, and this test is the tripwire when
  // the vocabulary widens on one side only.
  it('matches the API vocabulary, in its order', () => {
    expect(REPORT_CATEGORIES.map((option) => option.value)).toEqual([
      'fabric',
      'wallpaper',
      'trimming',
      'accessory',
    ])
  })

  it('labels every option for the select', () => {
    for (const option of REPORT_CATEGORIES) {
      expect(option.label).toBeTruthy()
      expect(option.label.toLowerCase()).toBe(option.value)
    }
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
