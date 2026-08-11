import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { draftFrom } from '../admin/drafts.js'
import {
  CUSTOM_KEY_PATTERN,
  LEGACY_ENTITIES,
  MAX_CUSTOM_FIELDS,
  MAX_CUSTOM_VALUE_LENGTH,
  correctionBody,
  customDraftFrom,
  fieldState,
  panelFields,
  recordPath,
  restorePath,
} from './dynamicsCorrections.js'

const PANEL_SOURCE = readFileSync(
  new URL('../components/DynamicsCorrection.jsx', import.meta.url),
  'utf8'
)

// The API's own editable-column lists, retyped from atelier-api's
// src/legacy/read-entities.js (`columns` minus `guid`). Retyped rather than
// imported because it is another repo — which is exactly why a mirror test
// exists: a key declared here and missing there is a 422, and a `commercial`
// flag missing here is a 403.
const API_COLUMNS = {
  accounts: [
    'name', 'atelier_account_number', 'customer_type', 'is_customer', 'is_supplier',
    'primary_contact', 'primary_contact_email', 'email', 'main_phone', 'other_phone',
    'address1_city', 'province', 'territory', 'currency', 'discount', 'credit_limit',
    'payment_terms', 'owner', 'status', 'status_reason', 'xero_contact_id',
  ],
  'sales-orders': [
    'number', 'customer', 'contact', 'reference', 'order_date',
    'expected_delivery_date', 'total_ex_gst', 'gst', 'total_incl_gst', 'currency',
    'pricing_type', 'sales_order_discount_pct', 'deliver_to', 'owner', 'status',
    'status_reason',
  ],
  stock: [
    'item_code', 'name', 'supplier', 'range_name', 'item_type', 'item_measure',
    'stock_on_hand', 'stock_available', 'reserve_note', 'retail_price', 'trade_price',
    'currency', 'product_price_list', 'can_sell', 'status', 'status_reason',
  ],
  prices: [
    'code', 'description', 'range_name', 'item_type', 'pack_type', 'width', 'currency',
    'wholesale_rate', 'landed_cost_nz', 'retail_sell_price_nz', 'trade_sell_price_nz',
    'trade_sell_price_under_5m_nz', 'set_prices_manually', 'status', 'status_reason',
  ],
}

const API_COMMERCIAL = {
  accounts: ['discount', 'credit_limit', 'payment_terms'],
  'sales-orders': [
    'total_ex_gst', 'gst', 'total_incl_gst', 'sales_order_discount_pct', 'pricing_type',
  ],
  stock: ['retail_price', 'trade_price', 'product_price_list'],
  prices: [
    'wholesale_rate', 'landed_cost_nz', 'retail_sell_price_nz', 'trade_sell_price_nz',
    'trade_sell_price_under_5m_nz', 'set_prices_manually',
  ],
}

const account = (extra = {}) => ({
  guid: 'abc-123',
  name: 'Kedgley Architects',
  atelier_account_number: 'A-0042',
  customer_type: 'Trade',
  is_customer: true,
  is_supplier: null,
  primary_contact: 'Peter',
  primary_contact_email: 'peter@example.com',
  email: null,
  main_phone: '09 555 0000',
  other_phone: null,
  address1_city: 'Auckland',
  province: null,
  territory: null,
  currency: 'NZD',
  discount: '10.0000',
  credit_limit: '5000.0000',
  payment_terms: '20th of month',
  owner: 'Atelier Sales',
  status: 'Active',
  status_reason: 'Active',
  xero_contact_id: null,
  origin: 'd365',
  overridden_fields: [],
  custom_fields: {},
  archived_at: null,
  ...extra,
})

const FINANCE = { finance: true }
const NO_FINANCE = { finance: false }

// The panel's own seeding path: draft from the record, then edit it. Building a
// draft by hand omits keys, and an omitted key parses to null and lands in `set`
// as a clear nobody asked for.
const edit = (record, fields, changes = {}) => ({ ...draftFrom(record, fields), ...changes })

describe('the entity vocabulary', () => {
  it('is the READ spelling only, and throws on the import spelling', () => {
    // Both vocabularies are live in the same two screen files: PriceLists.jsx
    // passes entity="product_prices" to LegacyImportPanel. A copied string would
    // build a URL matching no read config, apply nothing, and raise nothing.
    expect(LEGACY_ENTITIES).toEqual(['accounts', 'sales-orders', 'stock', 'prices'])
    expect(() => recordPath('sales_orders', 'g')).toThrow(/Unknown Dynamics entity/)
    expect(() => recordPath('product_prices', 'g')).toThrow(/Unknown Dynamics entity/)
    expect(() => recordPath('stock_items', 'g')).toThrow(/Unknown Dynamics entity/)
    expect(() => panelFields('sales_orders', FINANCE)).toThrow(/Unknown Dynamics entity/)
  })

  it('builds both paths in one place', () => {
    expect(recordPath('accounts', 'abc-123')).toBe('/admin/legacy/accounts/abc-123')
    expect(restorePath('sales-orders', 'abc-123')).toBe(
      '/admin/legacy/sales-orders/abc-123/restore'
    )
  })
})

describe('the field lists mirror the API', () => {
  for (const entity of LEGACY_ENTITIES) {
    it(`declares exactly the editable ${entity} columns`, () => {
      expect(panelFields(entity, FINANCE).map((f) => f.key)).toEqual(API_COLUMNS[entity])
    })

    it(`marks exactly the commercial ${entity} columns`, () => {
      // Compared as a SET: the flags ride on the fields in column order, which
      // is not the order the API lists its `commercial` array in.
      const commercial = panelFields(entity, FINANCE)
        .filter((f) => f.commercial)
        .map((f) => f.key)
      expect([...commercial].sort()).toEqual([...API_COMMERCIAL[entity]].sort())
    })
  }

  it('never declares guid — overriding the key would re-point the record', () => {
    for (const entity of LEGACY_ENTITIES) {
      expect(panelFields(entity, FINANCE).map((f) => f.key)).not.toContain('guid')
    }
  })

  it('types a timestamp as naive and a pg numeric as canonical text', () => {
    const byKey = Object.fromEntries(
      panelFields('sales-orders', FINANCE).map((f) => [f.key, f.kind])
    )
    expect(byKey.order_date).toBe('naive')
    expect(byKey.expected_delivery_date).toBe('naive')
    // `decimal` parses to a JS Number, so '11715.4000' would diff as changed
    // against 11715.4 and re-send an untouched figure on every save.
    expect(byKey.total_incl_gst).toBe('numeric')
    // payment_terms is TEXT in the staging table, whatever the name suggests.
    const accounts = Object.fromEntries(panelFields('accounts', FINANCE).map((f) => [f.key, f.kind]))
    expect(accounts.payment_terms).toBe('text')
    expect(accounts.is_customer).toBe('tribool')
    // The staging column has no CHECK, so the export's spelling is not
    // guaranteed to be a three-letter code — 'upper' would refuse it.
    expect(accounts.currency).toBe('text')
  })
})

describe('the finance lock', () => {
  it('locks a commercial column rather than hiding it', () => {
    const locked = panelFields('accounts', NO_FINANCE)
    // Still drawn: the value is already on the screen above, so removing it
    // would read as a regression while proving nothing.
    expect(locked.map((f) => f.key)).toEqual(API_COLUMNS.accounts)
    expect(locked.find((f) => f.key === 'credit_limit').locked).toBe(true)
    expect(locked.find((f) => f.key === 'name').locked).toBe(false)
    expect(
      panelFields('accounts', FINANCE).find((f) => f.key === 'credit_limit').locked
    ).toBe(false)
  })

  it('excludes a locked column from set AND from revert', () => {
    const record = account({ overridden_fields: ['credit_limit'] })
    const fields = panelFields('accounts', NO_FINANCE)
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { credit_limit: '9999', name: 'Kedgley Ltd' }),
      revert: ['credit_limit'],
      custom: [],
    })
    // Reverting a commercial column is finance-gated at the API too, so the
    // Revert button goes with the input.
    expect(built.body).toEqual({ set: { name: 'Kedgley Ltd' } })
  })
})

describe('correctionBody', () => {
  const fields = panelFields('accounts', FINANCE)

  it('sends only what changed', () => {
    const record = account()
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { main_phone: '09 555 1111' }),
      revert: [],
      custom: [],
    })
    expect(built.body).toEqual({ set: { main_phone: '09 555 1111' } })
  })

  it('reports nothing to send rather than posting an empty body', () => {
    const record = account()
    expect(
      correctionBody(record, fields, { draft: edit(record, fields), revert: [], custom: [] })
    ).toEqual({ empty: true })
  })

  it('does not re-send an untouched pg numeric', () => {
    // '5000.0000' formats as '5000.0000' and parses back as the same canonical
    // text; the numeric comparison is what stops it being reported as an edit.
    const record = account()
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { credit_limit: '5000' }),
      revert: [],
      custom: [],
    })
    expect(built).toEqual({ empty: true })
  })

  it('keeps a deliberate clear distinct from a revert', () => {
    const record = account({ overridden_fields: ['name'] })
    // Blank input = override TO EMPTY. That is a correction, not an undo.
    expect(
      correctionBody(record, fields, {
        draft: edit(record, fields, { name: '' }),
        revert: [],
        custom: [],
      }).body
    ).toEqual({ set: { name: null } })
    // Revert = drop the correction and take whatever Dynamics now says.
    expect(
      correctionBody(record, fields, {
        draft: edit(record, fields),
        revert: ['name'],
        custom: [],
      }).body
    ).toEqual({ revert: ['name'] })
  })

  it('treats a lone revert as a real request, not an empty patch', () => {
    // The value is unchanged, so the diff is empty — a diff-derived revert (or
    // an emptiness test over `set` alone) would silently swallow this.
    const record = account({ overridden_fields: ['name'] })
    const built = correctionBody(record, fields, {
      draft: edit(record, fields),
      revert: ['name'],
      custom: [],
    })
    expect(built.body).toEqual({ revert: ['name'] })
    expect(built.empty).toBeUndefined()
  })

  it('never names a column in both set and revert', () => {
    // A stale input still sits in the reverted field; the API 422s the pair
    // rather than applying a precedence rule, so it must be unconstructable.
    const record = account({ overridden_fields: ['name'] })
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { name: 'Something else', owner: 'Charlotte' }),
      revert: ['name'],
      custom: [],
    })
    expect(built.body).toEqual({ set: { owner: 'Charlotte' }, revert: ['name'] })
  })

  it('mixes all four verbs in one body', () => {
    const record = account({ custom_fields: { old_note: 'drop me', keep: 'same' } })
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { owner: 'Charlotte' }),
      revert: ['main_phone'],
      custom: [
        { key: 'keep', value: 'same' },
        { key: 'fabric_room', value: 'Bay 3' },
      ],
    })
    expect(built.body).toEqual({
      set: { owner: 'Charlotte' },
      revert: ['main_phone'],
      custom: { fabric_room: 'Bay 3' },
      revert_custom: ['old_note'],
    })
  })

  it('never invents a correction on a field the user did not touch', () => {
    // Both of these come back ALTERED from the parsers on their own: blankToNull
    // trims '  Ana  ' and maps '' to null. Parsing every field on every save
    // would therefore write a durable override — one that survives every
    // re-import and masks Dynamics indefinitely — for a record whose owner only
    // ever edited the phone number.
    const record = account({ primary_contact: '  Ana  ', territory: '' })
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { main_phone: '09 555 1111' }),
      revert: [],
      custom: [],
    })
    expect(built.body).toEqual({ set: { main_phone: '09 555 1111' } })
  })

  it('still clears a populated field the user actually blanked', () => {
    // The other half of the rule above: blank input on a field that HELD
    // something is an override to empty, and must stay expressible.
    const record = account({ primary_contact: '  Ana  ' })
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { primary_contact: '' }),
      revert: [],
      custom: [],
    })
    expect(built.body).toEqual({ set: { primary_contact: null } })
  })

  it('reports a bad value as a sentence rather than letting it reach the API', () => {
    const record = account()
    const built = correctionBody(record, fields, {
      draft: edit(record, fields, { credit_limit: 'lots' }),
      revert: [],
      custom: [],
    })
    expect(built.error).toMatch(/Credit limit/)
  })
})

describe('naive timestamps', () => {
  const fields = panelFields('sales-orders', FINANCE)
  const order = (extra = {}) => ({
    guid: 'so-1',
    number: 'SO-1',
    customer: 'Kedgley',
    contact: null,
    reference: null,
    order_date: '2026-03-12 09:00:00',
    expected_delivery_date: null,
    total_ex_gst: '100.0000',
    gst: '15.0000',
    total_incl_gst: '115.0000',
    currency: 'NZD',
    pricing_type: 'Trade',
    sales_order_discount_pct: null,
    deliver_to: null,
    owner: null,
    status: 'Active',
    status_reason: 'Sent to Xero',
    overridden_fields: [],
    custom_fields: {},
    ...extra,
  })

  it('refuses anything carrying a Z or an offset', () => {
    // Postgres DISCARDS the offset on a ::timestamp cast, so accepting what
    // toISOString() produces would move every corrected date by the NZ offset.
    const record = order()
    for (const bad of ['2026-03-12T09:00:00.000Z', '2026-03-12T09:00:00+13:00']) {
      const built = correctionBody(record, fields, {
        draft: edit(record, fields, { order_date: bad }),
        revert: [],
        custom: [],
      })
      expect(built.error).toMatch(/Order date/)
    }
  })

  it('accepts the API’s own naive shapes', () => {
    const record = order()
    expect(
      correctionBody(record, fields, {
        draft: edit(record, fields, { order_date: '2026-04-01' }),
        revert: [],
        custom: [],
      }).body
    ).toEqual({ set: { order_date: '2026-04-01' } })
    expect(
      correctionBody(record, fields, {
        draft: edit(record, fields, { order_date: '2026-04-01 14:30' }),
        revert: [],
        custom: [],
      }).body
    ).toEqual({ set: { order_date: '2026-04-01 14:30' } })
  })

  it('does not report an untouched date as an edit', () => {
    // The record holds the Date form pg serialised; the draft holds the local
    // naive one. Comparing the raw strings would diff on every render.
    const record = order({ order_date: new Date(2026, 2, 12, 9, 0).toISOString() })
    expect(
      correctionBody(record, fields, { draft: edit(record, fields), revert: [], custom: [] })
    ).toEqual({ empty: true })
  })
})

describe('tri-state booleans', () => {
  const fields = panelFields('accounts', FINANCE)

  it('holds null apart from false in both directions', () => {
    // A checkbox cannot draw three states, and PARSERS.bool would collapse the
    // unset column to an explicit false and save it as one.
    const record = account({ is_supplier: null })
    expect(draftFrom(record, fields).is_supplier).toBe('')
    expect(
      correctionBody(record, fields, { draft: edit(record, fields), revert: [], custom: [] })
    ).toEqual({ empty: true })
    expect(
      correctionBody(record, fields, {
        draft: edit(record, fields, { is_supplier: 'false' }),
        revert: [],
        custom: [],
      }).body
    ).toEqual({ set: { is_supplier: false } })
    // And back to unset is a deliberate override to empty.
    const set = account({ is_supplier: false })
    expect(
      correctionBody(set, fields, {
        draft: edit(set, fields, { is_supplier: '' }),
        revert: [],
        custom: [],
      }).body
    ).toEqual({ set: { is_supplier: null } })
  })
})

describe('custom fields', () => {
  const fields = panelFields('accounts', FINANCE)

  it('lists them sorted and stringified', () => {
    expect(customDraftFrom(account({ custom_fields: { zebra: 2, alpha: null } }))).toEqual([
      { key: 'alpha', value: '' },
      { key: 'zebra', value: '2' },
    ])
    expect(customDraftFrom(account())).toEqual([])
  })

  it('does not re-send a number-valued field just because the input is a string', () => {
    const record = account({ custom_fields: { shelf_number: 12 } })
    expect(
      correctionBody(record, fields, {
        draft: edit(record, fields),
        revert: [],
        custom: customDraftFrom(record),
      })
    ).toEqual({ empty: true })
  })

  it('treats a blank value as null and a removed row as revert_custom', () => {
    const record = account({ custom_fields: { shelf: 'Bay 3', gone: 'x' } })
    const built = correctionBody(record, fields, {
      draft: edit(record, fields),
      revert: [],
      custom: [{ key: 'shelf', value: '' }],
    })
    // Blank = the field exists with no value; removing it is the other verb.
    expect(built.body).toEqual({ custom: { shelf: null }, revert_custom: ['gone'] })
  })

  it('accepts a key in the API’s vocabulary', () => {
    const record = account()
    for (const key of ['a', 'fabric_room', 'a1_b2', 'a'.repeat(40)]) {
      expect(CUSTOM_KEY_PATTERN.test(key)).toBe(true)
      const built = correctionBody(record, fields, {
        draft: edit(record, fields),
        revert: [],
        custom: [{ key, value: 'x' }],
      })
      expect(built.body).toEqual({ custom: { [key]: 'x' } })
    }
  })

  it('refuses a key the API would refuse', () => {
    const record = account()
    const refuse = (key) =>
      correctionBody(record, fields, {
        draft: edit(record, fields),
        revert: [],
        custom: [{ key, value: 'x' }],
      }).error
    for (const key of ['Shelf', '1shelf', 'fabric room', 'shelf-number', '', 'a'.repeat(41)]) {
      expect(refuse(key)).toMatch(/not a valid custom field name/)
    }
  })

  it('refuses a key that shadows a Dynamics column, locked or not', () => {
    const record = account()
    const shadow = (key, viewer) =>
      correctionBody(record, panelFields('accounts', viewer), {
        draft: edit(record, panelFields('accounts', viewer)),
        revert: [],
        custom: [{ key, value: 'x' }],
      }).error
    expect(shadow('name', FINANCE)).toMatch(/already a Dynamics column/)
    expect(shadow('guid', FINANCE)).toMatch(/already a Dynamics column/)
    // A commercial column is still a column for a viewer who may not edit it.
    expect(shadow('credit_limit', NO_FINANCE)).toMatch(/already a Dynamics column/)
  })

  it('refuses a duplicate key rather than letting the last one win', () => {
    const record = account()
    const built = correctionBody(record, fields, {
      draft: edit(record, fields),
      revert: [],
      custom: [
        { key: 'shelf', value: 'Bay 3' },
        { key: 'shelf', value: 'Bay 4' },
      ],
    })
    expect(built.error).toMatch(/listed twice/)
  })

  it('enforces the value length and field-count caps', () => {
    const record = account()
    const long = correctionBody(record, fields, {
      draft: edit(record, fields),
      revert: [],
      custom: [{ key: 'note', value: 'x'.repeat(MAX_CUSTOM_VALUE_LENGTH + 1) }],
    })
    expect(long.error).toMatch(new RegExp(String(MAX_CUSTOM_VALUE_LENGTH)))
    expect(
      correctionBody(record, fields, {
        draft: edit(record, fields),
        revert: [],
        custom: [{ key: 'note', value: 'x'.repeat(MAX_CUSTOM_VALUE_LENGTH) }],
      }).body
    ).toBeTruthy()

    const many = Array.from({ length: MAX_CUSTOM_FIELDS + 1 }, (_, i) => ({
      key: `field_${i}`,
      value: 'x',
    }))
    expect(correctionBody(record, fields, { draft: edit(record, fields), revert: [], custom: many }).error)
      .toMatch(new RegExp(String(MAX_CUSTOM_FIELDS)))
  })
})

describe('fieldState', () => {
  it('reads server truth only, and stale beats corrected', () => {
    const record = account({
      overridden_fields: ['name', 'owner'],
      override: { stale_fields: ['owner'] },
    })
    expect(fieldState(record, 'name')).toBe('corrected')
    expect(fieldState(record, 'owner')).toBe('stale')
    expect(fieldState(record, 'main_phone')).toBe('upstream')
    // A list row carries neither `override` nor a stale list.
    expect(fieldState(account(), 'name')).toBe('upstream')
    expect(fieldState(undefined, 'name')).toBe('upstream')
  })
})

describe('the panel composes the kit', () => {
  it('names no endpoint of its own and calls no fetch', () => {
    // Anchored on the opening quote, so a relative import is not mistaken for
    // an endpoint.
    expect(PANEL_SOURCE.match(/['"`]\/admin\/[a-z-]+/g) ?? []).toEqual([])
    expect(PANEL_SOURCE).toContain('recordPath')
    expect(PANEL_SOURCE).toContain('restorePath')
    expect(PANEL_SOURCE).not.toMatch(/\bfetch\(/)
    expect(PANEL_SOURCE).not.toContain('alert(')
  })

  it('uses the shared mutation cycle and the real finance flag', () => {
    expect(PANEL_SOURCE).toContain('useMutation')
    expect(PANEL_SOURCE).toContain('<ErrorLine')
    expect(PANEL_SOURCE).toContain('<ToastLine')
    expect(PANEL_SOURCE).toContain('correctionBody')
    // useCan(CAPS.FINANCE_VIEW) is the demo role map and disagrees with the
    // API's 403; useAccess().finance is the derived report_access.
    expect(PANEL_SOURCE).toContain('useAccess')
    expect(PANEL_SOURCE).not.toContain('FINANCE_VIEW')
  })

  it('offers Restore but not Suppress', () => {
    // Suppression is director-only and cannot ship alone: neither list screen
    // sends include_archived, so a suppressed row vanishes from the very list
    // whose row would offer Restore.
    expect(PANEL_SOURCE).toContain('restorePath')
    expect(PANEL_SOURCE).not.toContain('apiDelete')
  })

  // A scan that read nothing passes every per-file check vacuously.
  it('read the panel', () => {
    expect(PANEL_SOURCE.length).toBeGreaterThan(0)
  })
})

describe('every Dynamics screen mounts the panel', () => {
  // The panel is only worth anything where it is drawn, and each screen was
  // wired by a different agent — nothing but this scan says all four kept it.
  const SCREENS = ['ClientAccount.jsx', 'SalesOrder.jsx', 'PriceLists.jsx', 'Reserves.jsx'].map(
    (file) => [file, readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')]
  )

  it('read all four screens', () => {
    expect(SCREENS.length).toBe(4)
    for (const [file, source] of SCREENS) expect(source.length, file).toBeGreaterThan(0)
  })

  for (const [file, source] of SCREENS) {
    it(`${file} draws DynamicsCorrection and no longer claims to be read-only`, () => {
      // The JSX MOUNT, not the string. `toContain('DynamicsCorrection')` is
      // satisfied by the import line alone — and by a header comment in three of
      // these four files — so deleting the element would leave this green, with
      // no linter in this repo to notice the now-unused import.
      expect(source).toMatch(/<DynamicsCorrection[\s/>]/)
      // Every one of these files carried "read-only by design" before the
      // correction feature; the sentence surviving means a screen states one
      // thing and does another.
      expect(source).not.toMatch(/read-only by design/i)
    })
  }
})
