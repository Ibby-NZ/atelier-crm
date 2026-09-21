import { describe, it, expect } from 'vitest'
import {
  buildClientBody,
  buildOrderBody,
  clientAddress,
  clientFrom,
  clientLabel,
  clientLine,
  clientReference,
  clientUserId,
  NEW_CLIENT,
  NEW_ORDER,
} from './adminOrderNew.js'
import { draftFromColourway } from '../admin/orderFlow.js'

const line = (overrides = {}) =>
  draftFromColourway({ id: 5, sku: 'A-1' }, { qty: '2', price: '10.00', ...overrides })

const LINES = [
  { colourway_id: 5, qty: 2, unit_price_cents: 1000, cut_requirements: null },
]

// A row as GET /admin/trade-accounts serves one.
const ACCOUNT = Object.freeze({
  id: 7,
  company_name: 'Kedgley Architects',
  account_number: 'ACC-0042',
  primary_contact_name: 'Ada Lovelace',
  email: 'accounts@kedgley.nz',
  phone: '09 555 0000',
  address: '12 Sale Street',
  city: 'Auckland',
  country: 'New Zealand',
  users: [],
})

const orderFor = (account, extra = {}) =>
  buildOrderBody({ ...NEW_ORDER, client: clientFrom(account), ...extra }, [line()])

describe('buildOrderBody', () => {
  // The common case since the cutover merge: a company with no portal login, so
  // its own details are the API's `contact` and the reference line is what says
  // the order was raised for a client on the roster rather than a stranger.
  it('sends a client with no login as contact details plus a reference', () => {
    expect(orderFor(ACCOUNT).body).toEqual({
      lines: LINES,
      contact: {
        name: 'Kedgley Architects',
        email: 'accounts@kedgley.nz',
        phone: '09 555 0000',
      },
      notes: 'Client: Kedgley Architects (ACC-0042) · attn Ada Lovelace',
      shipping_address: {
        name: 'Kedgley Architects',
        line1: '12 Sale Street',
        line2: null,
        city: 'Auckland',
        country: 'New Zealand',
      },
    })
  })

  // One login is the company's login, so the order belongs to it and the client
  // sees it in their portal. The API writes no guest_email in that case.
  it('attributes an order to the client’s login when they have exactly one', () => {
    const body = orderFor({ ...ACCOUNT, users: [{ id: 12, email: 'ada@kedgley.nz' }] }).body
    expect(body.user_id).toBe(12)
    expect(body).not.toHaveProperty('contact')
  })

  // Several people at one firm: attributing to one of them on row order alone
  // would put the order in their portal and nobody else's.
  it('falls back to contact details when the client has several logins', () => {
    const body = orderFor({ ...ACCOUNT, users: [{ id: 12 }, { id: 13 }] }).body
    expect(body).not.toHaveProperty('user_id')
    expect(body.contact.name).toBe('Kedgley Architects')
  })

  it('carries the delivery address only when the client record says where', () => {
    const noWhere = { ...ACCOUNT, address: '  ', city: null }
    expect(orderFor(noWhere).body).not.toHaveProperty('shipping_address')
    expect(orderFor({ ...ACCOUNT, address: null }).body.shipping_address).toMatchObject({
      line1: null,
      city: 'Auckland',
    })
  })

  it('keeps the reference above whatever the office typed', () => {
    expect(orderFor(ACCOUNT, { notes: ' Rang about the hallway runner. ' }).body.notes).toBe(
      'Client: Kedgley Architects (ACC-0042) · attn Ada Lovelace\nRang about the hallway runner.'
    )
  })

  // The API refuses this too (422); named here so the message points at the
  // field rather than at `user_id`.
  it('refuses an order with nobody chosen', () => {
    expect(buildOrderBody(NEW_ORDER, [line()])).toEqual({
      ok: false,
      error: 'Choose the client this order is for.',
    })
  })

  it('refuses a client record with neither a name nor an email', () => {
    const empty = { ...ACCOUNT, company_name: '  ', email: null }
    expect(orderFor(empty).error).toMatch(/no name or email on file/)
  })

  it('refuses an email that is not one', () => {
    expect(orderFor({ ...ACCOUNT, email: 'ada at example' }).error).toMatch(/does not look right/)
  })

  it('refuses an order with no lines, before looking at the client', () => {
    expect(buildOrderBody({ ...NEW_ORDER, client: clientFrom(ACCOUNT) }, [])).toEqual({
      ok: false,
      error: 'Add at least one line.',
    })
  })

  it('passes a bad line through with the SKU named', () => {
    const bad = draftFromColourway({ id: 5, sku: 'A-1' }, { qty: '0', price: '1.00' })
    const result = buildOrderBody({ ...NEW_ORDER, client: clientFrom(ACCOUNT) }, [bad])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^A-1: /)
  })
})

describe('a picked client', () => {
  it('reads as name, account number and city, leaving out what is absent', () => {
    expect(clientLine(clientFrom(ACCOUNT))).toBe('Kedgley Architects — ACC-0042 — Auckland')
    expect(clientLine(clientFrom({ company_name: 'Studio Nine', city: 'Napier' }))).toBe(
      'Studio Nine — Napier'
    )
  })

  it('leaves the sparse parts out of the reference line', () => {
    expect(clientReference({ name: 'Studio Nine' })).toBe('Client: Studio Nine')
    expect(clientReference({})).toBe('Client: (unnamed client)')
  })

  it('counts a single login and nothing else as the order’s account', () => {
    expect(clientUserId({ users: [{ id: 3 }] })).toBe(3)
    expect(clientUserId({ users: [] })).toBeNull()
    expect(clientUserId({ users: [{ id: 3 }, { id: 4 }] })).toBeNull()
    expect(clientUserId()).toBeNull()
  })

  // A name with no street and no city is the absence of an address.
  it('takes an address only from a record that says where', () => {
    expect(clientAddress({ company_name: 'Studio Nine' })).toBeNull()
    expect(clientAddress({ company_name: 'Studio Nine', city: 'Napier' })).toEqual({
      name: 'Studio Nine',
      line1: null,
      line2: null,
      city: 'Napier',
      country: null,
    })
  })

  // `trade_accounts.address` holds what D365 exported as a composite: one text
  // column, up to four lines, the last two of which are usually the city and
  // the country the row already carries in their own fields.
  it('splits a composite address and drops the parts that repeat themselves', () => {
    expect(
      clientAddress({
        company_name: 'Athfield Architects Limited',
        address: '105 Amritsar St\nKhandallah\nWellington\nNew Zealand',
        city: 'Wellington',
        country: 'New Zealand',
      })
    ).toEqual({
      name: 'Athfield Architects Limited',
      line1: '105 Amritsar St',
      line2: 'Khandallah',
      city: 'Wellington',
      country: 'New Zealand',
    })
  })

  // A postcode line is not a repeat of the city, and the packing slip wants it.
  it('keeps a line that only starts with the city name', () => {
    expect(
      clientAddress({
        address: 'PO Box 802\nWellington 6140',
        city: 'Wellington',
      }).line2
    ).toBe('Wellington 6140')
  })
})

describe('buildClientBody', () => {
  it('sends the company name and whatever else was taken down', () => {
    expect(
      buildClientBody({
        ...NEW_CLIENT,
        company_name: ' Fernhill Interiors ',
        primary_contact_name: 'Jenny',
        address: '12 Sale Street',
        city: 'Auckland',
      })
    ).toEqual({
      ok: true,
      body: {
        company_name: 'Fernhill Interiors',
        primary_contact_name: 'Jenny',
        address: '12 Sale Street',
        city: 'Auckland',
      },
    })
  })

  // A blank field is absent, not an empty string: the API stores '' as a value
  // every IS NULL read then misses.
  it('leaves out the fields nobody filled in', () => {
    const body = buildClientBody({ ...NEW_CLIENT, company_name: 'Fernhill' }).body
    expect(body).toEqual({ company_name: 'Fernhill' })
  })

  it('refuses a client with no company name', () => {
    expect(buildClientBody({ ...NEW_CLIENT, company_name: '   ' })).toEqual({
      ok: false,
      error: 'A new client needs a company name.',
    })
  })

  it('refuses an email that is not one', () => {
    const result = buildClientBody({ ...NEW_CLIENT, company_name: 'Fernhill', email: 'nope' })
    expect(result.error).toMatch(/does not look right/)
  })
})

describe('clientLabel', () => {
  // Still the reserves docket form's label, where a client IS a portal login.
  it('falls back to the email when there is no name', () => {
    expect(clientLabel({ name: 'Ada', email: 'a@b.nz' })).toBe('Ada — a@b.nz')
    expect(clientLabel({ name: null, email: 'a@b.nz' })).toBe('a@b.nz')
    expect(clientLabel({})).toBe('')
  })
})

describe('sales rep on a new order', () => {
  it('travels when set, and is simply absent when not', () => {
    const client = clientFrom(ACCOUNT)
    const withRep = buildOrderBody({ ...NEW_ORDER, client, sales_rep_user_id: 7 }, [line()])
    expect(withRep.ok).toBe(true)
    expect(withRep.body.sales_rep_user_id).toBe(7)

    const without = buildOrderBody({ ...NEW_ORDER, client }, [line()])
    expect(without.ok).toBe(true)
    expect('sales_rep_user_id' in without.body).toBe(false)
  })
})
