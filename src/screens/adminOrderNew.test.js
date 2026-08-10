import { describe, it, expect } from 'vitest'
import { buildOrderBody, clientLabel, NEW_ORDER } from './adminOrderNew.js'
import { draftFromColourway } from '../admin/orderFlow.js'

const line = (overrides = {}) =>
  draftFromColourway({ id: 5, sku: 'A-1' }, { qty: '2', price: '10.00', ...overrides })

const LINES = [
  { colourway_id: 5, qty: 2, unit_price_cents: 1000, cut_requirements: null },
]

describe('buildOrderBody', () => {
  it('attributes an order to a client account', () => {
    const draft = { ...NEW_ORDER, mode: 'account', user_id: 12 }
    expect(buildOrderBody(draft, [line()])).toEqual({
      ok: true,
      body: { lines: LINES, user_id: 12 },
    })
  })

  it('attributes a walk-in from contact details', () => {
    const draft = {
      ...NEW_ORDER,
      mode: 'walk_in',
      name: ' Ada Lovelace ',
      email: 'ada@example.com',
      phone: '021 555',
    }
    expect(buildOrderBody(draft, [line()]).body).toEqual({
      lines: LINES,
      contact: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '021 555' },
    })
  })

  // A blank field is absent, not an empty string: the API packs the contact into
  // `orders.notes` and an empty part would read as "Phone:" with nothing after.
  it('omits the contact fields that were left blank', () => {
    const draft = { ...NEW_ORDER, mode: 'walk_in', name: 'Ada', email: '', phone: '  ' }
    expect(buildOrderBody(draft, [line()]).body.contact).toEqual({ name: 'Ada' })
  })

  it('carries the notes when there are any, and omits the key when not', () => {
    const draft = { ...NEW_ORDER, mode: 'account', user_id: 1, notes: ' Phoned in. ' }
    expect(buildOrderBody(draft, [line()]).body.notes).toBe('Phoned in.')
    expect(buildOrderBody({ ...draft, notes: '   ' }, [line()]).body).not.toHaveProperty('notes')
  })

  // The API refuses this too (422); named here so the message points at the
  // field rather than at `user_id`.
  it('refuses an account order with nobody chosen', () => {
    const result = buildOrderBody({ ...NEW_ORDER, mode: 'account' }, [line()])
    expect(result).toEqual({ ok: false, error: 'Choose the client this order is for.' })
  })

  it('refuses a walk-in with neither a name nor an email', () => {
    const draft = { ...NEW_ORDER, mode: 'walk_in', phone: '021 555' }
    expect(buildOrderBody(draft, [line()]).error).toMatch(/at least a name or an email/)
  })

  it('accepts a walk-in named with no email at all', () => {
    const draft = { ...NEW_ORDER, mode: 'walk_in', name: 'Ada' }
    expect(buildOrderBody(draft, [line()]).ok).toBe(true)
  })

  it('refuses an email that is not one', () => {
    const draft = { ...NEW_ORDER, mode: 'walk_in', name: 'Ada', email: 'ada at example' }
    expect(buildOrderBody(draft, [line()]).error).toMatch(/does not look right/)
  })

  it('refuses an order with no lines, before looking at the client', () => {
    expect(buildOrderBody({ ...NEW_ORDER, mode: 'account', user_id: 1 }, [])).toEqual({
      ok: false,
      error: 'Add at least one line.',
    })
  })

  it('passes a bad line through with the SKU named', () => {
    const bad = draftFromColourway({ id: 5, sku: 'A-1' }, { qty: '0', price: '1.00' })
    const result = buildOrderBody({ ...NEW_ORDER, mode: 'account', user_id: 1 }, [bad])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^A-1: /)
  })
})

describe('clientLabel', () => {
  // A name is optional on an account; the email is what always identifies one.
  it('falls back to the email when there is no name', () => {
    expect(clientLabel({ name: 'Ada', email: 'a@b.nz' })).toBe('Ada — a@b.nz')
    expect(clientLabel({ name: null, email: 'a@b.nz' })).toBe('a@b.nz')
    expect(clientLabel({})).toBe('')
  })
})
