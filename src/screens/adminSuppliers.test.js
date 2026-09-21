import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  NEW_TERMS,
  brandLinkPath,
  brandTermsPath,
  buildDefaultDiscountBody,
  buildTermsBody,
  buildTermsPatch,
  buildTierBody,
  chainPreview,
  defaultDiscountNote,
  defaultDiscountPath,
  draftFromTerms,
  isFinanceRefusal,
  linkableBrands,
  parseChain,
  parseMarkup,
  parseRate,
  termsRowPath,
  termsSavedNote,
  tierPath,
  tiersPath,
} from './adminSuppliers.js'
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
    'phone',
    'address',
    'website_url',
    'notes',
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

  // Which houses a supplier invoices was readable only by expanding its row.
  // The count rides the list read, and 0 is the state worth seeing: a supplier
  // nobody has linked cannot have a purchase order raised against a house.
  it('counts the houses linked to a supplier, and says when none are', () => {
    expect(supplierMeta({ country: 'Italy', currency: 'EUR', brand_count: 4 })).toBe(
      'Italy · EUR · 4 houses'
    )
    expect(supplierMeta({ currency: 'EUR', brand_count: 1 })).toBe('EUR · 1 house')
    expect(supplierMeta({ currency: 'EUR', brand_count: 0 })).toBe('EUR · No houses linked')
    // An older list read that does not carry the count says nothing about it.
    expect(supplierMeta({ currency: 'EUR' })).toBe('EUR')
  })

  it('names the fallback tier for what it is', () => {
    expect(tierLabel({ label: 'Wallpapers', is_fallback: false })).toBe('Wallpapers')
    expect(tierLabel({ label: 'Everything else', is_fallback: true })).toBe(
      'Everything else (fallback)'
    )
  })
})

// --- W23: terms are writable ------------------------------------------------

describe('terms paths', () => {
  it('builds the nested paths from one base', () => {
    expect(brandTermsPath(7)).toBe('/admin/suppliers/7/brand-terms')
    expect(termsRowPath(7, 3)).toBe('/admin/suppliers/7/brand-terms/3')
    expect(tiersPath(7, 3)).toBe('/admin/suppliers/7/brand-terms/3/tiers')
    expect(tierPath(7, 3, 9)).toBe('/admin/suppliers/7/brand-terms/3/tiers/9')
  })

  // The ONLY place in the CRM that writes brands.supplier_id.
  it('links a house through the brand, not through the supplier', () => {
    expect(brandLinkPath(12)).toBe('/admin/brands/12')
  })
})

describe('rates are fractions off list', () => {
  it('takes a fraction and leaves a blank as null', () => {
    expect(parseRate('0.4')).toEqual({ ok: true, value: 0.4 })
    expect(parseRate('')).toEqual({ ok: true, value: null })
    expect(parseRate('0')).toEqual({ ok: true, value: 0 })
  })

  // The column is numeric(6,4) CHECK (>= 0 AND < 1); 1 would be a free metre.
  // Refused here in the API's own words, because a round trip adds nothing.
  it('refuses a rate at or above 1, and a percentage typed as one', () => {
    expect(parseRate('1').ok).toBe(false)
    expect(parseRate('40').ok).toBe(false)
    expect(parseRate('-0.1').ok).toBe(false)
    expect(parseRate('lots').ok).toBe(false)
  })

  it('takes a markup, which multiplies and so must be above 0', () => {
    expect(parseMarkup('2.2')).toEqual({ ok: true, value: 2.2 })
    expect(parseMarkup('')).toEqual({ ok: true, value: null })
    expect(parseMarkup('0').ok).toBe(false)
  })
})

describe('the discount chain', () => {
  it('reads a comma-separated list of fractions', () => {
    expect(parseChain('0.4, 0.4')).toEqual({ ok: true, value: [0.4, 0.4] })
    expect(parseChain('0.4,0.1,0.05').value).toEqual([0.4, 0.1, 0.05])
  })

  // The column is NOT NULL: "no chain" is [], never absent.
  it('is an empty array when nothing was typed, never null', () => {
    expect(parseChain('')).toEqual({ ok: true, value: [] })
    expect(parseChain('  ,  ')).toEqual({ ok: true, value: [] })
  })

  it('names the element that is not a rate', () => {
    expect(parseChain('0.4, forty').ok).toBe(false)
    expect(parseChain('0.4, forty').error).toContain('forty')
  })

  // A typed 0.04 must be visible as 4% before it is saved.
  it('echoes each rate as a percentage', () => {
    expect(chainPreview('0.4, 0.4')).toBe('40% then 40%')
    expect(chainPreview('0.04')).toBe('4%')
    expect(chainPreview('')).toBe('')
    expect(chainPreview('rubbish')).toBe('')
  })

  // THE rule. atelier-api's discount-chain.js is the only evaluator there is;
  // a second one in the browser would disagree the first time either changed,
  // and summing a chain would undercharge Atelier by 44% of list on every metre.
  it('never multiplies a chain out — the server resolves it', () => {
    const source = readFileSync(new URL('./adminSuppliers.js', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
    expect(source).not.toMatch(/reduce\(/)
    expect(source).not.toMatch(/\*=/)
  })
})

describe('building a terms write', () => {
  it('sends the house on a create, because it is the row’s identity', () => {
    expect(buildTermsBody({ ...NEW_TERMS, brand_id: '4', discount_chain: '0.4, 0.4' })).toEqual({
      ok: true,
      body: {
        brand_id: 4,
        discount: null,
        discount_chain: [0.4, 0.4],
        markup: null,
        indicative: false,
        note: null,
      },
    })
  })

  it('refuses a create with no house', () => {
    expect(buildTermsBody(NEW_TERMS).ok).toBe(false)
  })

  // brand_id is absent from the patch on purpose: moving terms to another
  // maison is a delete and a re-create, not an edit.
  it('never patches the house', () => {
    const terms = { brand_id: 4, discount: 0.4, discount_chain: [], markup: null, indicative: false, note: null }
    const built = buildTermsPatch(terms, { ...draftFromTerms(terms), brand_id: '99', discount: '0.3' })
    expect(built.patch).toEqual({ discount: 0.3 })
  })

  it('sends only what moved — the route demands at least one key', () => {
    const terms = { brand_id: 4, discount: null, discount_chain: [0.4, 0.4], markup: null, indicative: true, note: 'x' }
    expect(buildTermsPatch(terms, draftFromTerms(terms)).patch).toEqual({})
  })

  it('clears a chain back to an empty array rather than to null', () => {
    const terms = { discount_chain: [0.4], discount: null, markup: null, indicative: false, note: null }
    expect(buildTermsPatch(terms, { ...draftFromTerms(terms), discount_chain: '' }).patch).toEqual({
      discount_chain: [],
    })
  })

  it('builds a tier, and refuses one with no label or no rate', () => {
    expect(buildTierBody({ label: ' Wallcoverings ', pct: '0.35', is_fallback: true })).toEqual({
      ok: true,
      body: { label: 'Wallcoverings', pct: 0.35, is_fallback: true },
    })
    expect(buildTierBody({ label: '', pct: '0.3' }).ok).toBe(false)
    expect(buildTierBody({ label: 'x', pct: '' }).ok).toBe(false)
  })
})

describe('the net multiplier is shown back the moment a write lands', () => {
  // {0.4, 0.4} is ×0.36, not −80%. It is the one field nobody can check by eye,
  // and every write response carries the resolved figure for exactly this.
  it('quotes the server’s net after a chain is saved', () => {
    expect(
      termsSavedNote({
        brand_name: 'Rubelli',
        discount_chain: [0.4, 0.4],
        net_multiplier: 0.36,
      })
    ).toBe('Rubelli: saved — net ×0.36 (40% then 40%, compounded).')
  })

  it('names the tier a resolved rate came from', () => {
    expect(
      termsSavedNote({ brand_name: 'Larsen', discount_chain: [], net_multiplier: 0.65, net_label: 'Wallcoverings' })
    ).toBe('Larsen: saved — net ×0.65 via “Wallcoverings”.')
  })

  // A row the API could not evaluate arrives with invalid_reason instead of a
  // rate, and saying "saved" alone would hide that.
  it('says so when the row cannot be resolved', () => {
    expect(termsSavedNote({ brand_name: 'Larsen', invalid_reason: 'a rate is out of range' })).toMatch(
      /cannot be resolved — a rate is out of range/
    )
  })

  it('does not invent a rate for a row that carries none', () => {
    expect(termsSavedNote({ brand_name: 'Larsen', net_multiplier: null })).toBe(
      'Larsen: saved. No rate on file yet.'
    )
  })
})

describe('linking a house', () => {
  const brands = [
    { id: 1, name: 'Rubelli', supplier_id: 7, supplier_name: 'Rubelli Venezia' },
    { id: 2, name: 'Larsen', supplier_id: null, supplier_name: null },
    { id: 3, name: 'Kieffer', supplier_id: 9, supplier_name: 'Rubelli Venezia' },
  ]

  it('offers every house not already on this supplier', () => {
    expect(linkableBrands(brands, 7).map((option) => option.id)).toEqual([2, 3])
  })

  // Linking a house that already points elsewhere re-points it, which is a
  // bigger act than linking an unlinked one and has to say so — by NAME, since
  // which supplier it is being taken off is the whole of the decision.
  it('names the supplier a house is being taken off', () => {
    const options = linkableBrands(brands, 7)
    expect(options.find((option) => option.id === 2).label).toBe('Larsen')
    expect(options.find((option) => option.id === 3).label).toBe(
      'Kieffer — invoiced by Rubelli Venezia'
    )
  })

  // A list read that did not carry the name still has to say the house is
  // spoken for, rather than offering it as if it were free.
  it('falls back to “another supplier” when the list carried no name', () => {
    const options = linkableBrands([{ id: 4, name: 'Boussac', supplier_id: 9 }], 7)
    expect(options[0].label).toBe('Boussac — invoiced by another supplier')
  })
})

// The supplier's own averaged rate — one column, applying to every house it
// invoices that has no terms row of its own. The two are a FALLBACK, never a
// sum; the API resolves per-house terms first.
describe('the supplier discount', () => {
  it('addresses the finance-gated route, not the supplier form', () => {
    expect(defaultDiscountPath(12)).toBe('/admin/suppliers/12/default-discount')
  })

  it('sends a fraction off list, and refuses anything that is not one', () => {
    expect(buildDefaultDiscountBody('0.05')).toEqual({ ok: true, body: { default_discount: 0.05 } })
    expect(buildDefaultDiscountBody('1')).toMatchObject({ ok: false })
    expect(buildDefaultDiscountBody('half')).toMatchObject({ ok: false })
  })

  // Blank CLEARS the rate; 0 records one. "Their prices arrive already net" and
  // "nobody has asked them yet" are different answers and must stay so.
  it('keeps a cleared rate distinct from a recorded zero', () => {
    expect(buildDefaultDiscountBody('')).toEqual({ ok: true, body: { default_discount: null } })
    expect(buildDefaultDiscountBody('0')).toEqual({ ok: true, body: { default_discount: 0 } })
  })

  it('says what the saved rate covers, because the number alone does not', () => {
    expect(defaultDiscountNote({ name: 'Pierre Frey', default_discount: 0.05 })).toBe(
      'Pierre Frey: 5% off list on every house with no terms of its own.'
    )
    expect(defaultDiscountNote({ name: 'Pierre Frey', default_discount: null })).toBe(
      'Pierre Frey: supplier discount cleared. Houses with no terms of their own now have no rate.'
    )
  })
})

describe('the finance gate', () => {
  // The terms routes need can_view_finance on top of the backoffice role: it
  // covers the showroom as well as the accounts desk. A 403 there is a policy
  // answer with a written reason, not a fault.
  it('reads a 403 as the gate and everything else as a failure', () => {
    expect(isFinanceRefusal({ status: 403 })).toBe(true)
    expect(isFinanceRefusal({ status: 404 })).toBe(false)
    expect(isFinanceRefusal({ status: 0 })).toBe(false)
    expect(isFinanceRefusal(null)).toBe(false)
  })

  it('renders that refusal as a LockedPanel carrying the API’s own sentence', () => {
    const panel = readFileSync(new URL('./SupplierTermsPanel.jsx', import.meta.url), 'utf8')
    expect(panel).toContain('LockedPanel')
    expect(panel).toContain('isFinanceRefusal')
    expect(panel).toContain('reason={refusal}')
  })
})

// --- contact people + the contact log (W-feedback: supplier contacts) --------

import {
  CONTACT_FIELDS,
  CONTACT_METHODS,
  NEW_CONTACT,
  NEW_LOG_ENTRY,
  buildLogBody,
  contactLogPath,
  contactPath,
  contactsPath,
  lastContactText,
} from './adminSuppliers.js'

describe('contact paths', () => {
  it('builds the nested contact and log endpoints in one place', () => {
    expect(contactsPath(12)).toBe('/admin/suppliers/12/contacts')
    expect(contactPath(12, 3)).toBe('/admin/suppliers/12/contacts/3')
    expect(contactLogPath(12)).toBe('/admin/suppliers/12/contact-log')
  })
})

describe('the supplier form carries the new detail fields', () => {
  it('declares phone, address, website_url and notes', () => {
    const keys = SUPPLIER_FIELDS.map((field) => field.key)
    for (const key of ['phone', 'address', 'website_url', 'notes']) {
      expect(keys).toContain(key)
      expect(NEW_SUPPLIER[key]).toBe('')
    }
  })

  it('declares the contact-person fields with name required', () => {
    const name = CONTACT_FIELDS.find((field) => field.key === 'name')
    expect(name.required).toBe(true)
    expect(CONTACT_FIELDS.map((f) => f.key)).toEqual(['name', 'role', 'email', 'phone', 'note'])
    expect(Object.keys(NEW_CONTACT)).toEqual(['name', 'role', 'email', 'phone', 'note'])
  })
})

describe('buildLogBody', () => {
  it('mirrors the API vocabulary for methods', () => {
    expect([...CONTACT_METHODS]).toEqual(['call', 'email', 'visit', 'showroom'])
  })

  it('requires a method', () => {
    expect(buildLogBody({ ...NEW_LOG_ENTRY }).ok).toBe(false)
  })

  it('omits a blank contacted_on so the server dates the entry today', () => {
    const built = buildLogBody({ ...NEW_LOG_ENTRY, method: 'call', note: '  Chased.  ' })
    expect(built.ok).toBe(true)
    expect(built.body).toEqual({ method: 'call', note: 'Chased.' })
    expect('contacted_on' in built.body).toBe(false)
  })

  it('carries typed dates and refuses a malformed one', () => {
    const built = buildLogBody({
      method: 'visit',
      contacted_on: '2026-09-02',
      note: '',
      follow_up_on: '2026-09-20',
    })
    expect(built.ok).toBe(true)
    expect(built.body).toEqual({
      method: 'visit',
      contacted_on: '2026-09-02',
      follow_up_on: '2026-09-20',
    })

    expect(buildLogBody({ method: 'visit', contacted_on: 'next tuesday' }).ok).toBe(false)
  })
})

describe('lastContactText', () => {
  it('reads the at-a-glance line off a list row', () => {
    expect(
      lastContactText({
        contacted_on: '2026-09-02',
        method: 'call',
        staff_name: 'Rebecca',
        follow_up_on: null,
      })
    ).toBe('2 Sep 2026 · call · Rebecca')
  })

  it('names the follow-up when one is set', () => {
    expect(
      lastContactText({
        contacted_on: '2026-09-02',
        method: 'visit',
        staff_name: 'Jenette',
        follow_up_on: '2026-09-20',
      })
    ).toBe('2 Sep 2026 · visit · Jenette · follow up 20 Sep 2026')
  })

  it('says so when a supplier has gone quiet', () => {
    expect(lastContactText(null)).toBe('No contact yet')
    expect(lastContactText(undefined)).toBe('No contact yet')
  })
})
