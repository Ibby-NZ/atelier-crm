import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { diffFields } from '../admin/drafts.js'
import {
  LOCKED_PRODUCT_KEYS,
  LOCKED_RATE_KEYS,
  RECORD_LOCK_NOTE,
  canEditRecords,
  editableFields,
  isFieldLocked,
} from './recordLock.js'
import { ITEM_FIELDS as DECLARED_ITEM_FIELDS } from './adminPriceListItems.js'

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const PRODUCTS_SOURCE = read('AdminProducts.jsx')
// Supplier rates is three screens since 23 Sep 2026 (the client asked for every
// data-entry form on a page of its own): the list, one rate's page — which is
// the editor, so it is RATES_SOURCE — and the hand-keying page, over ONE field
// declaration in adminPriceListItems.js. Each scan reads the file its line
// lives in now; the ones that must hold everywhere read all four.
const RATES_SOURCE = read('AdminPriceListItem.jsx')
const RATE_NEW_SOURCE = read('AdminPriceListItemNew.jsx')
const RATE_DECLARATION_SOURCE = read('adminPriceListItems.js')
const RATE_SOURCES = [
  read('AdminPriceListItems.jsx'),
  RATES_SOURCE,
  RATE_NEW_SOURCE,
  read('RateFields.jsx'),
]

// The two declarations the lock is applied to, transcribed from where they are
// declared (AdminProducts.jsx; adminPriceListItems.js for the rates). The scans
// at the foot of this file are what keep them honest.
const PRODUCT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper', required: true },
  { key: 'collection_id', label: 'Collection', kind: 'ref' },
  { key: 'category', label: 'Category', kind: 'enum' },
  { key: 'product_range', label: 'Range', kind: 'text' },
  { key: 'size', label: 'Size', kind: 'text' },
  { key: 'composition', label: 'Composition', kind: 'text' },
  { key: 'width', label: 'Width', kind: 'text' },
  { key: 'rubs', label: 'Rubs', kind: 'text' },
  { key: 'application', label: 'Application', kind: 'text' },
  { key: 'price_band', label: 'Price band', kind: 'text' },
  { key: 'lead_time', label: 'Lead time', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'retail_price_cents', label: 'Retail price', kind: 'money' },
  { key: 'trade_price_cents', label: 'Trade price', kind: 'money' },
  { key: 'hi_res_asset_url', label: 'Hi-res asset URL', kind: 'text' },
  { key: 'show_on_website', label: 'Show on the website', kind: 'bool' },
])

const ITEM_FIELDS = Object.freeze([
  { key: 'category', label: 'Category', kind: 'enum', required: true },
  { key: 'code', label: 'Code', kind: 'text', required: true },
  { key: 'unit', label: 'Unit', kind: 'enum', required: true },
  { key: 'wholesale_rate', label: 'Wholesale rate', kind: 'decimal', required: true },
  { key: 'currency', label: 'Currency', kind: 'enum', required: true },
  { key: 'product_range', label: 'Brand', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'contents', label: 'Contents', kind: 'text' },
  { key: 'width', label: 'Width', kind: 'text' },
  { key: 'repeat', label: 'Horizontal repeat', kind: 'text' },
  { key: 'vertical_repeat', label: 'Vertical repeat', kind: 'text' },
  { key: 'duty_class', label: 'Duty class', kind: 'text' },
  { key: 'freight_class', label: 'Freight class', kind: 'enum' },
  { key: 'date_effective', label: 'Date effective', kind: 'date' },
])

const keysOf = (fields) => fields.map((field) => field.key)

describe('canEditRecords', () => {
  it('is the director role and nothing else', () => {
    expect(canEditRecords({ apiRole: 'director' })).toBe(true)
    // The CRM capability role maps backoffice to 'director' too, which is why
    // `apiRole` is the only thing worth asking.
    expect(canEditRecords({ apiRole: 'backoffice' })).toBe(false)
    expect(canEditRecords({ apiRole: 'trade' })).toBe(false)
  })

  it('answers false rather than throwing while there is no user', () => {
    // /auth/me is still in flight on a hard refresh, and a break-glass session
    // carries no apiRole at all — both must read as "not a director".
    expect(canEditRecords(null)).toBe(false)
    expect(canEditRecords(undefined)).toBe(false)
    expect(canEditRecords({})).toBe(false)
  })
})

describe('editableFields', () => {
  it('hands a director the declaration back untouched', () => {
    expect(editableFields(PRODUCT_FIELDS, LOCKED_PRODUCT_KEYS, true)).toBe(PRODUCT_FIELDS)
    expect(editableFields(ITEM_FIELDS, LOCKED_RATE_KEYS, true)).toBe(ITEM_FIELDS)
  })

  it('leaves a non-director the product columns that are not text or money', () => {
    expect(keysOf(editableFields(PRODUCT_FIELDS, LOCKED_PRODUCT_KEYS, false))).toEqual([
      'currency',
      'collection_id',
      'category',
      'show_on_website',
    ])
  })

  it('leaves a non-director the rate columns that classify rather than price', () => {
    expect(keysOf(editableFields(ITEM_FIELDS, LOCKED_RATE_KEYS, false))).toEqual([
      'category',
      'unit',
      'freight_class',
      'date_effective',
    ])
  })

  it('treats a missing grant as no grant', () => {
    expect(keysOf(editableFields(PRODUCT_FIELDS, LOCKED_PRODUCT_KEYS))).not.toContain('name')
  })
})

describe('isFieldLocked', () => {
  it('locks nothing for a director', () => {
    expect(isFieldLocked('retail_price_cents', LOCKED_PRODUCT_KEYS, true)).toBe(false)
    expect(isFieldLocked('wholesale_rate', LOCKED_RATE_KEYS, true)).toBe(false)
  })

  it('locks the named columns for everyone else', () => {
    expect(isFieldLocked('retail_price_cents', LOCKED_PRODUCT_KEYS, false)).toBe(true)
    expect(isFieldLocked('description', LOCKED_RATE_KEYS, false)).toBe(true)
  })

  it('leaves an unlisted column alone', () => {
    expect(isFieldLocked('category', LOCKED_PRODUCT_KEYS, false)).toBe(false)
    expect(isFieldLocked('freight_class', LOCKED_RATE_KEYS, false)).toBe(false)
  })
})

// The whole point of switching the list rather than only the styling: a value
// edited into a locked box — by a stale draft, or by a control left wired —
// cannot reach the PATCH body, because diffFields never looks at a key its
// field list does not declare.
describe('a locked column cannot reach a patch', () => {
  const product = Object.freeze({
    name: 'Galata',
    currency: 'NZD',
    retail_price_cents: 18600,
    category: 'fabric',
    show_on_website: false,
  })

  it('drops a moved price and a renamed design from a non-director save', () => {
    const draft = {
      name: 'Galata Bath Towel',
      currency: 'NZD',
      collection_id: '',
      retail_price_cents: '1.00',
      category: 'bed-linen',
      show_on_website: false,
    }
    const { patch } = diffFields(
      product,
      draft,
      editableFields(PRODUCT_FIELDS, LOCKED_PRODUCT_KEYS, false)
    )
    expect(patch).toEqual({ category: 'bed-linen' })
  })

  it('sends both when the same draft is saved by a director', () => {
    const draft = {
      name: 'Galata Bath Towel',
      currency: 'NZD',
      collection_id: '',
      category: 'bed-linen',
      product_range: '',
      size: '',
      composition: '',
      width: '',
      rubs: '',
      application: '',
      price_band: '',
      lead_time: '',
      description: '',
      retail_price_cents: '1.00',
      trade_price_cents: '',
      hi_res_asset_url: '',
      show_on_website: false,
    }
    const { patch } = diffFields(
      product,
      draft,
      editableFields(PRODUCT_FIELDS, LOCKED_PRODUCT_KEYS, true)
    )
    expect(patch.name).toBe('Galata Bath Towel')
    expect(patch.retail_price_cents).toBe(100)
  })

  it('drops a moved wholesale rate from a non-director save', () => {
    const item = Object.freeze({
      category: 'fabric',
      code: 'A-1',
      wholesale_rate: '48.0000',
      currency: 'EUR',
      unit: 'metre',
    })
    const draft = {
      category: 'fabric',
      code: 'A-2',
      wholesale_rate: '1',
      currency: 'USD',
      unit: 'yard',
      date_effective: '',
    }
    const { patch } = diffFields(
      item,
      draft,
      editableFields(ITEM_FIELDS, LOCKED_RATE_KEYS, false)
    )
    expect(patch).toEqual({ unit: 'yard' })
  })
})

// There is no jsdom here, so the screens are held to the rule by reading them.
describe('the screens apply the lock', () => {
  it('names every locked product column in AdminProducts', () => {
    // A key typoed into the list would lock nothing and fail nowhere else.
    for (const key of LOCKED_PRODUCT_KEYS) {
      expect(PRODUCTS_SOURCE).toContain(`key: '${key}'`)
    }
  })

  it('names every locked rate column in the rate declaration', () => {
    for (const key of LOCKED_RATE_KEYS) {
      expect(RATE_DECLARATION_SOURCE).toContain(`key: '${key}'`)
    }
  })

  it('transcribed the rate declaration faithfully', () => {
    // The declaration moved out of the .jsx into a pure module when the rate
    // got pages of its own, so the copy at the top of this file can be checked
    // against the real one rather than trusted.
    expect(DECLARED_ITEM_FIELDS).toEqual(ITEM_FIELDS)
  })

  it('diffs the SHORTENED list on both screens', () => {
    expect(PRODUCTS_SOURCE).toContain('diffFields(product, productDraft, editableProductFields)')
    expect(RATES_SOURCE).toContain('diffFields(item, itemDraft, editableItemFields)')
  })

  it('still builds a create body from the FULL declaration', () => {
    // Deliberate asymmetry: name/code/wholesale_rate/currency are required on
    // the POST schemas, so a shortened create body is a 400 — the lock would
    // read as "adding a row is broken" rather than as a restriction.
    expect(PRODUCTS_SOURCE).toContain('bodyFrom(newProduct, PRODUCT_FIELDS)')
    expect(RATE_NEW_SOURCE).toContain('bodyFrom(newItem, ITEM_FIELDS)')
    // …and the hand-keying page never reaches for the lock at all.
    expect(RATE_NEW_SOURCE).not.toContain('editableFields')
  })

  it('says why, once, on each editor', () => {
    expect(PRODUCTS_SOURCE).toContain('{RECORD_LOCK_NOTE}')
    expect(RATES_SOURCE).toContain('{RECORD_LOCK_NOTE}')
    expect(RECORD_LOCK_NOTE).toMatch(/director/)
  })

  it('asks the API role, never the CRM capability map', () => {
    // roles.js CAPS map backoffice and director onto the same capability set,
    // so a RequireCap here would lock nobody out.
    for (const source of [PRODUCTS_SOURCE, RATES_SOURCE]) {
      expect(source).toContain('canEditRecords(useAuth().user)')
    }
    for (const source of [PRODUCTS_SOURCE, ...RATE_SOURCES]) {
      expect(source).not.toContain('RequireCap')
    }
  })
})
