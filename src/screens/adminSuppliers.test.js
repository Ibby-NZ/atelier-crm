import { describe, it, expect } from 'vitest'
import {
  DISCOUNT_METHODS,
  NEW_SUPPLIER,
  SUPPLIERS_PATH,
  SUPPLIER_FIELDS,
  archivePath,
  archiveVerb,
  chainText,
  netText,
  pctText,
  supplierFilters,
  supplierMeta,
  supplierPath,
  termsSummary,
  tierLabel,
} from './adminSuppliers.js'

// The AdminSuppliers screen cannot be rendered here (no jsdom), so everything
// that is a decision rather than a layout lives in adminSuppliers.js and is
// tested from this side.

describe('paths and verbs', () => {
  it('builds every supplier path from one base', () => {
    expect(SUPPLIERS_PATH).toBe('/admin/suppliers')
    expect(supplierPath(12)).toBe('/admin/suppliers/12')
  })

  it('offers restore to an archived supplier and archive to a live one', () => {
    expect(archiveVerb({ id: 1, archived_at: null })).toBe('archive')
    expect(archiveVerb({ id: 1, archived_at: '2026-08-06T00:00:00Z' })).toBe('restore')
    expect(archivePath({ id: 4, archived_at: null })).toBe('/admin/suppliers/4/archive')
    expect(archivePath({ id: 4, archived_at: 'x' })).toBe('/admin/suppliers/4/restore')
  })
})

describe('SUPPLIER_FIELDS', () => {
  // The API's frozen SUPPLIER_UPDATE_COLUMNS. A field declared here and missing
  // there is stripped by Ajv's removeAdditional and saves nothing, silently.
  const API_UPDATE_COLUMNS = [
    'name',
    'short_code',
    'd365_token',
    'country',
    'currency',
    'agent',
    'incoterm',
    'po_email',
    'discount_method',
  ]

  it('matches the API update whitelist exactly', () => {
    expect(SUPPLIER_FIELDS.map((field) => field.key)).toEqual(API_UPDATE_COLUMNS)
  })

  it('does not offer slug — it is server-generated and never recomputed', () => {
    expect(SUPPLIER_FIELDS.some((field) => field.key === 'slug')).toBe(false)
  })

  it('is frozen, and every field carries a label', () => {
    expect(Object.isFrozen(SUPPLIER_FIELDS)).toBe(true)
    for (const field of SUPPLIER_FIELDS) expect(field.label).toBeTruthy()
  })

  it('gives the create form a blank for every editable field', () => {
    expect(Object.keys(NEW_SUPPLIER).sort()).toEqual([...API_UPDATE_COLUMNS].sort())
  })

  it('mirrors the database CHECK vocabulary for discount_method', () => {
    expect([...DISCOUNT_METHODS]).toEqual(['averaged', 'per-brand'])
  })
})

describe('supplierFilters', () => {
  it('drops the archived flag when it is off', () => {
    // Passed as `flag || null` so buildListQuery removes it entirely. Sending
    // include_archived=false would be a different request for no reason.
    expect(supplierFilters({ term: '', showArchived: false })).toEqual({
      q: '',
      include_archived: null,
    })
  })

  it('sends the term and the flag when both are set', () => {
    expect(supplierFilters({ term: 'jv', showArchived: true })).toEqual({
      q: 'jv',
      include_archived: true,
    })
  })

  it('has a working default', () => {
    expect(supplierFilters()).toEqual({ q: '', include_archived: null })
  })
})

describe('rate formatting', () => {
  it('renders a fraction as a percentage', () => {
    expect(pctText(0.4)).toBe('40%')
    expect(pctText(0.45)).toBe('45%')
    expect(pctText(null)).toBe('—')
    expect(pctText('nope')).toBe('—')
  })

  it('renders a net multiplier, never a summed percentage', () => {
    expect(netText(0.36)).toBe('×0.36')
    expect(netText(null)).toBe('—')
  })

  it('writes a chain as its own rates in order', () => {
    expect(chainText([0.4, 0.4])).toBe('40% then 40%')
    expect(chainText([])).toBe('')
    expect(chainText(undefined)).toBe('')
  })
})

describe('termsSummary', () => {
  it('reads a {0.4, 0.4} chain as ×0.36, never as −80%', () => {
    // The whole reason the chain is stored as an array. Summing it undercharges
    // Atelier by 44% of list on every metre.
    const summary = termsSummary({
      discount: null,
      discount_chain: [0.4, 0.4],
      markup: null,
      tiers: [],
      net_multiplier: 0.36,
      invalid_reason: null,
    })
    expect(summary.value).toBe('40% then 40%')
    expect(summary.note).toContain('×0.36')
    expect(summary.note).not.toContain('80')
    expect(summary.rateFree).toBe(false)
    // The note quotes the rate in prose, so it needs a masked twin.
    expect(summary.maskedNote).toBeTruthy()
  })

  it('states a tier COUNT, which is a method and not a rate', () => {
    const summary = termsSummary({
      discount: null,
      discount_chain: [],
      tiers: [
        { id: 1, label: 'New collections', pct: 0.45, is_fallback: false },
        { id: 2, label: 'Everything else', pct: 0.5, is_fallback: true },
      ],
      net_multiplier: 0.5,
      invalid_reason: null,
    })
    expect(summary.value).toBe('2 discount tiers')
    expect(summary.rateFree).toBe(true)
  })

  it('singularises a lone tier', () => {
    const summary = termsSummary({
      discount_chain: [],
      tiers: [{ id: 1, label: 'All', pct: 0.5, is_fallback: true }],
    })
    expect(summary.value).toBe('1 discount tier')
  })

  it('reads a flat rate and a markup', () => {
    expect(termsSummary({ discount: 0.5, discount_chain: [], tiers: [] }).value).toBe('−50%')
    expect(termsSummary({ discount: null, discount_chain: [], tiers: [], markup: 2.5 }).value).toBe(
      '×2.5'
    )
  })

  it('says so when there are no terms at all', () => {
    const summary = termsSummary(null)
    expect(summary.value).toBe('Supplier default')
    expect(summary.rateFree).toBe(true)
    expect(summary.invalid).toBe(false)
  })

  it('badges a row the API could not evaluate', () => {
    // A discount_chain element outside [0, 1). No CHECK can catch it (a
    // constraint cannot hold a subquery), so the API reports it per row rather
    // than failing the whole supplier read.
    const summary = termsSummary({
      discount_chain: [1.4],
      tiers: [],
      net_multiplier: null,
      invalid_reason: 'discount chain rate 1.4 is out of range',
    })
    expect(summary.invalid).toBe(true)
    expect(summary.note).toContain('1.4')
    expect(summary.maskedNote).not.toContain('1.4')
  })

  it('never lets a rate through on a rate-free value', () => {
    // The masking invariant: `rateFree` promises the headline states a METHOD.
    // If one ever quoted a figure, a login without FINANCE_VIEW would read it.
    const fixtures = [
      null,
      { discount_chain: [], tiers: [] },
      { discount_chain: [], tiers: [{ id: 1, label: 'All', pct: 0.5, is_fallback: true }] },
      { discount_chain: [], tiers: [], invalid_reason: 'rate 1.4 out of range' },
    ]
    for (const terms of fixtures) {
      const summary = termsSummary(terms)
      if (summary.rateFree) expect(summary.value).not.toMatch(/[%×]/)
    }
  })

  it('supplies a masked twin wherever the note itself quotes a rate', () => {
    const quoting = [
      { discount_chain: [0.4, 0.4], tiers: [], net_multiplier: 0.36 },
      { discount_chain: [], tiers: [], invalid_reason: 'rate 1.4 out of range' },
    ]
    for (const terms of quoting) {
      const summary = termsSummary(terms)
      expect(summary.note).toMatch(/[\d]/)
      expect(summary.maskedNote).toBeTruthy()
      expect(summary.maskedNote).not.toMatch(/\d/)
    }
  })
})

describe('presentation helpers', () => {
  it('summarises a supplier by what it invoices in and how it is rated', () => {
    expect(supplierMeta({ country: 'Italy', currency: 'EUR', discount_method: 'per-brand' })).toBe(
      'Italy · EUR · per-brand'
    )
    // currency is nullable on purpose — blank means "no invoice on file yet".
    expect(supplierMeta({ country: 'Thailand', currency: null, discount_method: null })).toBe(
      'Thailand'
    )
    expect(supplierMeta({})).toBe('No commercial details on file')
  })

  it('names the fallback tier for what it is', () => {
    expect(tierLabel({ label: 'Wallpapers', is_fallback: false })).toBe('Wallpapers')
    expect(tierLabel({ label: 'Everything else', is_fallback: true })).toBe(
      'Everything else (fallback)'
    )
  })
})
