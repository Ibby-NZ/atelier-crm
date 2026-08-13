import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  addressLines,
  orderPackingSlipLines,
  packingSlipHtml,
} from './orderPackingSlip.js'

// Money on every field the API's order shape actually carries one on. The
// figures are deliberately odd digit strings that appear nowhere else in the
// fixture, so a leak is unambiguous.
const MONEY_FIGURES = ['3344556', '8811223', '5566', '8816789']

const ORDER = Object.freeze({
  id: 7,
  order_number: 'SO-1042',
  kind: 'manual',
  status: 'confirmed',
  created_at: '2026-08-12T21:30:00.000Z',
  client_name: 'Ada Reid',
  client_email: 'ada@studio.co.nz',
  client_reference: 'Reid — drawing room',
  customer_po_number: 'PO-88231',
  contact_phone: '021 555 0100',
  subtotal_cents: 8811223,
  shipping_cents: 5566,
  total_cents: 8816789,
  shipping_address: {
    name: 'Ada Reid',
    line1: '14 Jervois Road',
    city: 'Auckland',
    postal_code: '1011',
    country: 'NZ',
  },
  lines: [
    {
      id: 1,
      sku: 'PF-ATL-01',
      product_name: 'Atlas — Natural',
      qty: '40.00',
      unit_price_cents: 3344556,
      cut_requirements: 'Cut in two 20 m drops',
    },
    {
      id: 2,
      sku: 'PF-ATL-04',
      product_name: 'Atlas — Indigo',
      qty: '18.00',
      unit_price_cents: 3344556,
      cut_requirements: null,
    },
  ],
})

describe('orderPackingSlipLines', () => {
  it('lists every line — receipting is a purchase-order concept, not a sales-order one', () => {
    // packingSlipLines filters a PO to `received > 0`; a sales order has no
    // `received`, so nothing may be held back from the slip.
    expect(orderPackingSlipLines(ORDER.lines).map((l) => l.sku)).toEqual([
      'PF-ATL-01',
      'PF-ATL-04',
    ])
  })

  it('coerces the pg numeric quantity, which arrives as a string', () => {
    expect(orderPackingSlipLines(ORDER.lines)[0].qty).toBe(40)
    expect(orderPackingSlipLines([{ sku: 'X' }])[0].qty).toBe(0)
  })

  it('carries the cut requirement, which is what the slip is picked against', () => {
    const [first, second] = orderPackingSlipLines(ORDER.lines)
    expect(first.cut).toBe('Cut in two 20 m drops')
    expect(second.cut).toBe('')
  })

  it('emits exactly four keys, so no money field can be added unnoticed', () => {
    for (const row of orderPackingSlipLines(ORDER.lines)) {
      expect(Object.keys(row).sort()).toEqual(['cut', 'design', 'qty', 'sku'])
    }
  })

  it('survives an empty or absent line list', () => {
    expect(orderPackingSlipLines([])).toEqual([])
    expect(orderPackingSlipLines()).toEqual([])
  })
})

// "There's no prices on a packing slip." Three ways, because the behavioural
// assertion alone would pass against a mapper someone later widened.
describe('no money reaches the slip', () => {
  const html = packingSlipHtml(ORDER)

  it('renders no money figure from the order', () => {
    for (const figure of MONEY_FIGURES) {
      expect(html).not.toContain(figure)
    }
    for (const row of orderPackingSlipLines(ORDER.lines)) {
      expect(JSON.stringify(row)).not.toMatch(/33445|88112|88167|5566/)
    }
  })

  it('renders no currency symbol at all', () => {
    expect(html).not.toContain('$')
  })

  it('never reads a money column, so it cannot print one', () => {
    // The structural half of the rule: a module that does not touch these
    // fields cannot leak them however it is edited. Matched as ACCESSES
    // (`.field`), not as words — the file's own comments explain why the
    // money is absent, and a bare word scan would fail against the
    // explanation rather than against a leak.
    const source = readFileSync(new URL('./orderPackingSlip.js', import.meta.url), 'utf8')
    for (const access of [
      '.unit_price_cents',
      '.subtotal_cents',
      '.shipping_cents',
      '.total_cents',
      'formatCents',
      'centsToDollars',
    ]) {
      expect(source).not.toContain(access)
    }
  })
})

describe('packingSlipHtml', () => {
  const html = packingSlipHtml(ORDER)

  it('names the order and the client it ships to', () => {
    expect(html).toContain('SO-1042')
    expect(html).toContain('Ship to Ada Reid')
    expect(html).toContain('14 Jervois Road')
  })

  it('labels the client PO number as the CLIENT’s, never a bare "PO number"', () => {
    // A purchase_orders table arrives next epic; a slip saying plain "PO number"
    // is one an operator reconciles against the wrong book.
    expect(html).toContain('Client PO number')
    expect(html).toContain('PO-88231')
    expect(html).not.toMatch(/>PO number/)
  })

  it('prints the order date by slicing the ISO string, never by parsing it', () => {
    // A Date built here would render in the printing machine's timezone.
    expect(html).toContain('2026-08-12')
  })

  it('omits a fact that has no value rather than labelling a blank', () => {
    const bare = packingSlipHtml({ ...ORDER, customer_po_number: null, client_reference: null })
    expect(bare).not.toContain('Client PO number')
    expect(bare).not.toContain('Client reference')
  })

  it('states an absent delivery address rather than leaving a gap', () => {
    expect(packingSlipHtml({ ...ORDER, shipping_address: null })).toContain(
      'No delivery address recorded'
    )
  })

  it('escapes the markup characters in staff-typed text', () => {
    const html = packingSlipHtml({
      ...ORDER,
      client_reference: 'Reid & <script>alert(1)</script>',
      lines: [{ sku: '<b>', product_name: 'A & B', qty: 1, cut_requirements: null }],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
  })

  it('does not fall over on an order with no lines and no fields', () => {
    expect(() => packingSlipHtml({})).not.toThrow()
    expect(packingSlipHtml({})).toContain('Packing Slip')
  })
})

describe('addressLines', () => {
  it('joins the city and postcode onto one line and drops the empties', () => {
    expect(addressLines(ORDER.shipping_address)).toEqual([
      'Ada Reid',
      '14 Jervois Road',
      'Auckland 1011',
      'NZ',
    ])
  })

  it('returns nothing for an absent or non-object address', () => {
    expect(addressLines(null)).toEqual([])
    expect(addressLines(undefined)).toEqual([])
    expect(addressLines('14 Jervois Road')).toEqual([])
  })
})
