import { describe, it, expect } from 'vitest'
import {
  blankToNull,
  centsToDollars,
  parseDollars,
  parseTones,
  parseUrl,
  tonesToText,
  draftFrom,
  diffFields,
  bodyFrom,
  toNumber,
  toDateInput,
} from './drafts.js'

const PRODUCT_FIELDS = [
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper' },
  { key: 'composition', label: 'Composition', kind: 'text' },
  { key: 'retail_price_cents', label: 'Retail price', kind: 'money' },
  { key: 'collection_id', label: 'Collection', kind: 'ref' },
  { key: 'show_on_website', label: 'Show on the website', kind: 'bool' },
]

describe('value coercion', () => {
  it('treats whitespace-only input as a cleared column', () => {
    expect(blankToNull('   ')).toBeNull()
    expect(blankToNull('')).toBeNull()
    expect(blankToNull(undefined)).toBeNull()
    expect(blankToNull('  Linen ')).toBe('Linen')
  })

  it('round-trips cents through the dollar form', () => {
    expect(centsToDollars(18600)).toBe('186.00')
    expect(centsToDollars(null)).toBe('')
    expect(parseDollars('186.00')).toEqual({ ok: true, value: 18600 })
    // Half-cent input rounds rather than truncating to a silently lower price.
    expect(parseDollars('12.005')).toEqual({ ok: true, value: 1201 })
  })

  it('rejects a price that is not a non-negative number', () => {
    expect(parseDollars('abc').ok).toBe(false)
    expect(parseDollars('-5').ok).toBe(false)
    // Blank is a cleared price, not an invalid one.
    expect(parseDollars('')).toEqual({ ok: true, value: null })
  })

  it('parses a comma-separated tone list and rejects a malformed one', () => {
    expect(parseTones('#AABBCC, #112233')).toEqual({
      ok: true,
      value: ['#AABBCC', '#112233'],
    })
    expect(parseTones('  ')).toEqual({ ok: true, value: null })
    expect(parseTones('#AABBCC, nope').ok).toBe(false)
    expect(parseTones('AABBCC').ok).toBe(false)
    expect(tonesToText(['#AABBCC', '#112233'])).toBe('#AABBCC, #112233')
    expect(tonesToText(null)).toBe('')
  })

  it('coerces pg numeric strings', () => {
    expect(toNumber('60.00')).toBe(60)
    expect(toNumber(null)).toBe(0)
  })

  it('narrows a pg date to the YYYY-MM-DD an input wants', () => {
    expect(toDateInput('2026-07-01')).toBe('2026-07-01')
    expect(toDateInput('2026-07-01T00:00:00.000Z')).toBe('2026-07-01')
    expect(toDateInput(new Date('2026-07-01T00:00:00.000Z'))).toBe('2026-07-01')
    expect(toDateInput(null)).toBe('')
    expect(toDateInput('')).toBe('')
    expect(toDateInput('not a date')).toBe('')
    expect(toDateInput(new Date('nonsense'))).toBe('')
  })
})

describe('date fields', () => {
  const fields = [{ key: 'date_effective', label: 'Date effective', kind: 'date' }]

  it('does not report an unchanged date as an edit across Date/string forms', () => {
    const record = { date_effective: new Date('2026-07-01T00:00:00.000Z') }
    expect(diffFields(record, { date_effective: '2026-07-01' }, fields)).toEqual({ patch: {} })
  })

  it('diffs a genuine change and clears with a blank', () => {
    const record = { date_effective: '2026-07-01' }
    expect(diffFields(record, { date_effective: '2026-08-01' }, fields)).toEqual({
      patch: { date_effective: '2026-08-01' },
    })
    expect(diffFields(record, { date_effective: '' }, fields)).toEqual({
      patch: { date_effective: null },
    })
  })

  it('rejects a date the API pattern would refuse', () => {
    expect(diffFields({}, { date_effective: '01/07/2026' }, fields).error).toMatch(
      /must be a date/
    )
  })
})

describe('draftFrom', () => {
  it('formats every declared field, so no input is left uncontrolled', () => {
    const draft = draftFrom(
      {
        name: 'Ranfurly Bouclé',
        currency: 'NZD',
        composition: null,
        retail_price_cents: 18600,
        collection_id: 7,
        show_on_website: true,
      },
      PRODUCT_FIELDS
    )
    expect(draft).toEqual({
      name: 'Ranfurly Bouclé',
      currency: 'NZD',
      composition: '',
      retail_price_cents: '186.00',
      collection_id: '7',
      show_on_website: true,
    })
  })

  it('formats a missing record as empty strings rather than undefined', () => {
    const draft = draftFrom({}, PRODUCT_FIELDS)
    expect(draft.name).toBe('')
    expect(draft.retail_price_cents).toBe('')
    expect(draft.show_on_website).toBe(false)
  })
})

describe('diffFields', () => {
  const product = Object.freeze({
    name: 'Ranfurly Bouclé',
    currency: 'NZD',
    composition: '100% NZ Wool',
    retail_price_cents: 18600,
    collection_id: 7,
    show_on_website: true,
  })

  it('sends only the changed keys', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    const result = diffFields(product, { ...draft, name: 'Ranfurly Boucle' }, PRODUCT_FIELDS)
    expect(result).toEqual({ patch: { name: 'Ranfurly Boucle' } })
  })

  it('returns an empty patch when nothing moved', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    expect(diffFields(product, draft, PRODUCT_FIELDS)).toEqual({ patch: {} })
  })

  it('keeps an explicit clear distinct from untouched', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    const result = diffFields(product, { ...draft, composition: '' }, PRODUCT_FIELDS)
    // null, not absent — the column is being cleared on purpose.
    expect(result.patch).toEqual({ composition: null })
    expect(Object.hasOwn(result.patch, 'composition')).toBe(true)
  })

  it('clears a reference with a blank select value', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    expect(diffFields(product, { ...draft, collection_id: '' }, PRODUCT_FIELDS)).toEqual({
      patch: { collection_id: null },
    })
  })

  it('does not diff a reference that only changed string/number form', () => {
    // The draft holds '7' while the record holds 7 — same collection.
    const draft = draftFrom(product, PRODUCT_FIELDS)
    expect(diffFields(product, draft, PRODUCT_FIELDS).patch).not.toHaveProperty(
      'collection_id'
    )
  })

  it('uppercases a currency and rejects one that is not three letters', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    expect(diffFields(product, { ...draft, currency: 'aud' }, PRODUCT_FIELDS)).toEqual({
      patch: { currency: 'AUD' },
    })
    expect(diffFields(product, { ...draft, currency: 'AU' }, PRODUCT_FIELDS).error).toMatch(
      /three-letter currency/
    )
  })

  it('names the offending field in a price error', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    const result = diffFields(
      product,
      { ...draft, retail_price_cents: 'free' },
      PRODUCT_FIELDS
    )
    expect(result.error).toBe('Retail price must be an amount in dollars, e.g. 129.50.')
  })

  it('refuses to clear a required field', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    expect(diffFields(product, { ...draft, name: '  ' }, PRODUCT_FIELDS).error).toBe(
      'Name is required.'
    )
  })

  it('diffs a boolean both ways', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    expect(
      diffFields(product, { ...draft, show_on_website: false }, PRODUCT_FIELDS)
    ).toEqual({ patch: { show_on_website: false } })
  })

  it('diffs tones by content, not by array identity', () => {
    const fields = [{ key: 'hex_tones', label: 'Tones', kind: 'tones' }]
    const record = { hex_tones: ['#AABBCC'] }
    expect(diffFields(record, { hex_tones: '#AABBCC' }, fields)).toEqual({ patch: {} })
    expect(diffFields(record, { hex_tones: '#AABBCC, #112233' }, fields)).toEqual({
      patch: { hex_tones: ['#AABBCC', '#112233'] },
    })
    expect(diffFields(record, { hex_tones: '#AABBCC, oops' }, fields).error).toMatch(
      /hex codes/
    )
  })

  it('does not mutate the record it diffs against', () => {
    const draft = draftFrom(product, PRODUCT_FIELDS)
    diffFields(product, { ...draft, name: 'Something else' }, PRODUCT_FIELDS)
    expect(product.name).toBe('Ranfurly Bouclé')
  })
})

describe('bodyFrom', () => {
  const CREATE_FIELDS = [
    { key: 'name', label: 'Name', kind: 'text', required: true },
    { key: 'currency', label: 'Currency', kind: 'upper', required: true },
    { key: 'composition', label: 'Composition', kind: 'text' },
    { key: 'wholesale_rate', label: 'Wholesale rate', kind: 'decimal', required: true },
  ]

  it('includes every field, unchanged ones as null', () => {
    const result = bodyFrom(
      { name: 'Argento', currency: 'eur', composition: '', wholesale_rate: '42.5' },
      CREATE_FIELDS
    )
    expect(result).toEqual({
      body: {
        name: 'Argento',
        currency: 'EUR',
        composition: null,
        wholesale_rate: 42.5,
      },
    })
  })

  it('reports a missing required field instead of posting a blank', () => {
    const result = bodyFrom({ name: '', currency: 'EUR', wholesale_rate: '1' }, CREATE_FIELDS)
    expect(result.error).toBe('Name is required.')
  })

  it('reports an unparseable number instead of posting NaN', () => {
    const result = bodyFrom(
      { name: 'Argento', currency: 'EUR', wholesale_rate: 'on application' },
      CREATE_FIELDS
    )
    expect(result.error).toMatch(/Wholesale rate must be a number/)
  })
})

describe('parseUrl', () => {
  it('accepts an absolute http(s) URL and clears on blank', () => {
    expect(parseUrl('https://www.pierrefrey.com')).toEqual({
      ok: true,
      value: 'https://www.pierrefrey.com',
    })
    expect(parseUrl('  ')).toEqual({ ok: true, value: null })
  })

  // The value ends up as a public storefront href — a schemeless or
  // javascript: value must be refused, matching the API's 422.
  it('refuses schemeless and non-http values', () => {
    expect(parseUrl('pierrefrey.com').ok).toBe(false)
    expect(parseUrl('javascript:alert(1)').ok).toBe(false)
  })

  it('is wired in as the url kind with a human hint', () => {
    const fields = [{ key: 'website_url', label: 'Website', kind: 'url' }]
    const result = diffFields({ website_url: null }, { website_url: 'not a url' }, fields)
    expect(result.error).toMatch(/Website must be a full web address/)
    const changed = diffFields(
      { website_url: null },
      { website_url: 'https://www.dedar.com' },
      fields
    )
    expect(changed).toEqual({ patch: { website_url: 'https://www.dedar.com' } })
  })
})
