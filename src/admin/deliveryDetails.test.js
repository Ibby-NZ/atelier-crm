import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  DELIVERY_FIELDS,
  DELIVERY_NEEDS_WHERE,
  buildDeliveryPatch,
  canEditDelivery,
  deliveryDraftFrom,
} from './deliveryDetails.js'

const ADDRESS = Object.freeze({
  name: 'Designers Collection',
  line1: 'c/o The Foundation',
  line2: '8 George Street, Newmarket',
  city: 'Auckland',
  state: null,
  postal_code: '1023',
  country: 'New Zealand',
})

describe('canEditDelivery', () => {
  it('is open until the order ships — paid included', () => {
    for (const status of ['quote_requested', 'back_order', 'pending_payment', 'paid']) {
      expect(canEditDelivery({ status, archived_at: null })).toBe(true)
    }
  })

  it('is closed once shipped or cancelled, on an archived order, and with no order', () => {
    expect(canEditDelivery({ status: 'shipped' })).toBe(false)
    expect(canEditDelivery({ status: 'cancelled' })).toBe(false)
    expect(canEditDelivery({ status: 'completed' })).toBe(false)
    expect(canEditDelivery({ status: 'paid', archived_at: '2026-09-20T00:00:00Z' })).toBe(false)
    expect(canEditDelivery(null)).toBe(false)
  })
})

describe('deliveryDraftFrom', () => {
  it('seeds every field as a string, blank where the address has none', () => {
    const draft = deliveryDraftFrom(ADDRESS)
    expect(Object.keys(draft)).toEqual(DELIVERY_FIELDS.map((field) => field.key))
    expect(draft.line1).toBe('c/o The Foundation')
    expect(draft.state).toBe('')
    expect(draft.phone).toBe('')
  })

  it('starts empty for an order with no address', () => {
    expect(Object.values(deliveryDraftFrom(null)).every((value) => value === '')).toBe(true)
  })
})

describe('buildDeliveryPatch', () => {
  it('sends nothing when nothing moved (whitespace included)', () => {
    const draft = { ...deliveryDraftFrom(ADDRESS), city: ' Auckland ' }
    expect(buildDeliveryPatch(ADDRESS, draft)).toEqual({ ok: true, patch: null })
  })

  it('sends the whole address, trimmed, with blanks as null', () => {
    const draft = {
      ...deliveryDraftFrom(ADDRESS),
      line2: '  ',
      phone: ' 09 307 7839 ',
      instructions: 'Mark parcel: Lounge',
    }
    expect(buildDeliveryPatch(ADDRESS, draft)).toEqual({
      ok: true,
      patch: {
        shipping_address: {
          name: 'Designers Collection',
          line1: 'c/o The Foundation',
          line2: null,
          city: 'Auckland',
          postal_code: '1023',
          state: null,
          country: 'New Zealand',
          phone: '09 307 7839',
          instructions: 'Mark parcel: Lounge',
        },
      },
    })
  })

  it('adds an address to an order that had none', () => {
    const draft = { ...deliveryDraftFrom(null), line1: '16 York Street', city: 'Auckland' }
    const built = buildDeliveryPatch(null, draft)
    expect(built.ok).toBe(true)
    expect(built.patch.shipping_address).toMatchObject({ line1: '16 York Street', city: 'Auckland' })
  })

  it('removes the address when every field is cleared', () => {
    expect(buildDeliveryPatch(ADDRESS, deliveryDraftFrom(null))).toEqual({
      ok: true,
      patch: { shipping_address: null },
    })
  })

  // The API answers 422 to the same body; saying so before the request keeps
  // the words ours.
  it('refuses a delivery that names neither a street nor a town', () => {
    const draft = { ...deliveryDraftFrom(null), name: 'Designers Collection', phone: '09 307 7839' }
    expect(buildDeliveryPatch(null, draft)).toEqual({ ok: false, error: DELIVERY_NEEDS_WHERE })
  })
})

describe('the fields', () => {
  // Each key must be one the API's SHIPPING_ADDRESS_SCHEMA declares: its
  // additionalProperties:false would refuse anything else with a 400.
  it('are exactly the API address keys, with its length limits', () => {
    expect(
      Object.fromEntries(DELIVERY_FIELDS.map((field) => [field.key, field.max]))
    ).toEqual({
      name: 200,
      line1: 200,
      line2: 200,
      city: 100,
      postal_code: 20,
      state: 100,
      country: 100,
      phone: 50,
      instructions: 500,
    })
  })
})

describe('the order page', () => {
  const page = readFileSync(new URL('../screens/AdminOrder.jsx', import.meta.url), 'utf8')

  it('offers the edit only where the API would take it, and sends the delivery alone', () => {
    expect(page).toContain('canEditDelivery(order)')
    expect(page).toContain('buildDeliveryPatch(order.shipping_address, deliveryDraft)')
    expect(page).toMatch(/apiSend\('PATCH', `\/admin\/orders\/\$\{order\.id\}`, built\.patch\)/)
  })
})
