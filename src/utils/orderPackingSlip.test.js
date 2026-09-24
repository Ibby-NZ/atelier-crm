import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  PACKING_SLIP_TERMS,
  addressLines,
  orderPackingSlipLines,
  packingSlipHtml,
  slipDate,
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
      product_name: 'Atlas',
      colourway_name: 'Natural',
      qty: '40.00',
      unit: 'metres',
      unit_price_cents: 3344556,
      cut_requirements: 'Cut in two 20 m drops',
      composition: '100% Linen',
      width: '137 cm',
      size: null,
      description: 'A washed linen with a soft hand.',
    },
    {
      id: 2,
      sku: 'PF-ATL-04',
      product_name: 'Atlas',
      colourway_name: 'Indigo',
      qty: '18.5',
      unit: null,
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

  it('carries the line note, which is what the slip is picked against', () => {
    const [first, second] = orderPackingSlipLines(ORDER.lines)
    expect(first.cut).toBe('Cut in two 20 m drops')
    expect(second.cut).toBe('')
  })

  it('names the unit of measure, and leaves it blank for a never-stocked colourway', () => {
    const [first, second] = orderPackingSlipLines(ORDER.lines)
    expect(first.unit).toBe('Metres')
    expect(second.unit).toBe('')
    expect(orderPackingSlipLines([{ unit: 'units' }])[0].unit).toBe('Units')
  })

  it('emits a fixed set of keys, so no money field can be added unnoticed', () => {
    for (const row of orderPackingSlipLines(ORDER.lines)) {
      expect(Object.keys(row).sort()).toEqual([
        'colour',
        'composition',
        'cut',
        'description',
        'design',
        'qty',
        'size',
        'sku',
        'unit',
        'width',
      ])
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

  it('names the order, who it is invoiced to and where it is delivered', () => {
    expect(html).toContain('Packing Slip <span class="no">SO-1042</span>')
    expect(html).toContain('Invoice to')
    expect(html).toContain('ada@studio.co.nz')
    expect(html).toContain('Deliver to')
    expect(html).toContain('14 Jervois Road')
    expect(html).toContain('Auckland 1011')
  })

  it("carries Atelier's letterhead and the wordmark", () => {
    expect(html).toContain('Atelier Textiles Limited')
    expect(html).toContain('PO Box 5017')
    expect(html).toContain('<svg class="wm"')
  })

  // Legal wording, supplied by the client (23 Sep 2026): it must arrive intact.
  it('prints the packing slip terms word for word', () => {
    expect(PACKING_SLIP_TERMS).toBe(
      'Orders cannot be cancelled once cut and/or dispatched. Please check all details of this order. Unless notified by return, this is accepted as your confirmed order. Atelier Textiles Limited shall not be liable for the failure to deliver, or for any delay in delivery arising from any cause beyond our reasonable control. New Zealand delivery expenses will be added to your account.'
    )
    expect(html).toContain(PACKING_SLIP_TERMS)
  })

  // The client's call (24 Sep 2026): terms close the slip, between the last
  // line's rule and the footer's, not above the lines.
  it('prints the terms after the lines and before the footer', () => {
    const terms = html.indexOf(PACKING_SLIP_TERMS)
    expect(terms).toBeGreaterThan(html.lastIndexOf('</table>'))
    expect(terms).toBeLessThan(html.indexOf('<footer>'))
  })

  it('lists each line with its colour, description, note, specs, a two-place quantity and the UOM', () => {
    expect(html).toContain('PF-ATL-01')
    expect(html).toContain('<span class="colour">Natural</span>')
    expect(html).toContain('Cut in two 20 m drops')
    expect(html).toContain('<div class="desc">A washed linen with a soft hand.</div>')
    expect(html).toContain('Contents: 100% Linen<br>Width: 137 cm')
    // A spec the product record does not hold is not printed as a blank.
    expect(html).not.toContain('Size:')
    expect(html).toContain('>40.00<')
    expect(html).toContain('>18.50<')
    expect(html).toContain('>Metres<')
  })

  it('prints the delivery phone and instructions the office added', () => {
    const withExtras = packingSlipHtml({
      ...ORDER,
      shipping_address: {
        ...ORDER.shipping_address,
        phone: '09 307 7839',
        instructions: 'Mark parcel: Lounge',
      },
    })
    expect(withExtras).toContain('09 307 7839')
    expect(withExtras).toContain('<div class="instr">Mark parcel: Lounge</div>')
  })

  it('labels the client PO number as the CLIENT’s, never a bare "PO number"', () => {
    // A purchase_orders table arrives next epic; a slip saying plain "PO number"
    // is one an operator reconciles against the wrong book.
    expect(html).toContain('Client PO number')
    expect(html).toContain('PO-88231')
    expect(html).not.toMatch(/>PO number/)
  })

  it('prints the order date on the New Zealand calendar', () => {
    // 21:30 UTC on the 12th is 9:30am on the 13th in Auckland: a laptop set to
    // UTC, or a slice of the ISO string, would print the day before.
    expect(html).toContain('13/08/2026')
    expect(slipDate('2026-09-17T02:00:00.000Z')).toBe('17/09/2026')
    expect(slipDate(null)).toBe('')
    expect(slipDate('not a date')).toBe('')
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
      shipping_address: { line1: '1 "Quoted" Lane', instructions: '<b>Fragile</b>' },
      lines: [{ sku: '<b>', product_name: 'A & B', qty: 1, cut_requirements: null }],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
    expect(html).toContain('&lt;b&gt;Fragile&lt;/b&gt;')
    expect(html).toContain('1 &quot;Quoted&quot; Lane')
  })

  it('does not fall over on an order with no lines and no fields', () => {
    expect(() => packingSlipHtml({})).not.toThrow()
    expect(packingSlipHtml({})).toContain('Packing Slip')
    expect(packingSlipHtml({})).toContain('This order has no lines.')
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

  it('leaves the delivery phone and instructions to the caller', () => {
    expect(
      addressLines({ ...ORDER.shipping_address, phone: '09 307 7839', instructions: 'Mark parcel' })
    ).toEqual(['Ada Reid', '14 Jervois Road', 'Auckland 1011', 'NZ'])
  })

  it('returns nothing for an absent or non-object address', () => {
    expect(addressLines(null)).toEqual([])
    expect(addressLines(undefined)).toEqual([])
    expect(addressLines('14 Jervois Road')).toEqual([])
  })
})
