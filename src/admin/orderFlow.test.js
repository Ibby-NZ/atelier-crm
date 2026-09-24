import { describe, it, expect } from 'vitest'
import {
  ORDER_STATUSES,
  KIND_LABELS,
  SOURCE_OPTIONS,
  sourceLabel,
  sourceOf,
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_DONE,
  DESTRUCTIVE_TARGETS,
  HELD_STATUSES,
  LINE_EDIT_STATUSES,
  INVOICEABLE_STATUSES,
  REVENUE_STATUSES,
  availableTargets,
  canEditLines,
  canDeleteOrder,
  reservesStock,
  parseLineEdits,
  lineEditsChanged,
  formatCents,
  contactLabel,
  draftFromLine,
  draftFromColourway,
  buildLinePatch,
  buildCreateLines,
  draftSubtotalCents,
  unpricedLineCount,
  unpricedHint,
  formatQty,
  formatLinePrice,
  formatOrderTotal,
  PRICED_ENTRY_STATUSES,
  needsPricing,
  lineAvailable,
  isShortLine,
  shortLineCount,
} from './orderFlow.js'

// The API's machine (atelier-api src/orders/order-states.js), copied — these
// pin the copy to the same moves so the dropdown never offers a 409.
describe('availableTargets', () => {
  it('offers exactly the moves the API accepts from each status', () => {
    expect(availableTargets({ status: 'quote_requested' })).toEqual([
      'quote_sent',
      'back_order',
      'processing',
      'pending_payment',
      'cancelled',
    ])
    expect(availableTargets({ status: 'quote_sent' })).toEqual([
      'quote_accepted',
      'quote_rejected',
      'quote_requested',
      'back_order',
      'cancelled',
    ])
    expect(availableTargets({ status: 'quote_rejected' })).toEqual(['quote_sent', 'cancelled'])
    expect(availableTargets({ status: 'pending_payment' })).toEqual([
      'paid',
      'back_order',
      'processing',
      'cancelled',
    ])
    expect(availableTargets({ status: 'paid' })).toEqual(['shipped', 'refunded'])
    expect(availableTargets({ status: 'shipped' })).toEqual(['completed', 'refunded'])
    expect(availableTargets({ status: 'cancelled' })).toEqual([])
    expect(availableTargets({ status: 'refunded' })).toEqual([])
  })

  it('offers nothing on an archived order — it must be restored first', () => {
    expect(
      availableTargets({ status: 'quote_requested', archived_at: '2026-07-01T00:00:00Z' })
    ).toEqual([])
  })

  it('offers nothing for an unknown status rather than throwing', () => {
    expect(availableTargets({ status: 'invented' })).toEqual([])
    expect(availableTargets(null)).toEqual([])
    expect(availableTargets(undefined)).toEqual([])
  })

  it('covers every status with a label, a tone, a toast word and an entry', () => {
    expect(Object.keys(ALLOWED_TRANSITIONS)).toEqual([...ORDER_STATUSES])
    for (const status of ORDER_STATUSES) {
      expect(STATUS_LABELS[status]).toEqual(expect.any(String))
      expect(STATUS_TONE[status]).toEqual(expect.any(String))
      expect(STATUS_DONE[status]).toEqual(expect.any(String))
      for (const target of ALLOWED_TRANSITIONS[status]) expect(ORDER_STATUSES).toContain(target)
    }
  })

  it('asks before the two moves that cannot be undone', () => {
    expect([...DESTRUCTIVE_TARGETS]).toEqual(['cancelled', 'refunded'])
  })

  it('mirrors the API status sets', () => {
    expect(HELD_STATUSES).not.toContain('shipped')
    expect(HELD_STATUSES).toContain('quote_rejected')
    expect(LINE_EDIT_STATUSES).not.toContain('paid')
    expect(INVOICEABLE_STATUSES).not.toContain('quote_sent')
    expect([...REVENUE_STATUSES]).toEqual(['paid', 'shipped', 'completed'])
  })
})

describe('canEditLines', () => {
  it('allows edits only before payment', () => {
    expect(canEditLines({ status: 'quote_requested' })).toBe(true)
    expect(canEditLines({ status: 'pending_payment' })).toBe(true)
    expect(canEditLines({ status: 'back_order' })).toBe(true)
    expect(canEditLines({ status: 'paid' })).toBe(false)
    expect(canEditLines({ status: 'shipped' })).toBe(false)
    expect(canEditLines({ status: 'cancelled' })).toBe(false)
  })

  it('refuses an archived order', () => {
    expect(canEditLines({ status: 'quote_requested', archived_at: '2026-07-01' })).toBe(false)
  })
})

describe('reservesStock', () => {
  it('is true only for the request kinds — a card checkout already decremented', () => {
    expect(reservesStock('order_request')).toBe(true)
    expect(reservesStock('backorder_request')).toBe(true)
    expect(reservesStock('checkout')).toBe(false)
  })
})

describe('parseLineEdits', () => {
  const lines = [
    { id: 1, sku: 'PF-ATLAS-01', qty: '10.00' },
    { id: 2, sku: 'PF-ATLAS-02', qty: '4.00' },
  ]

  it('falls back to the current quantity for an untouched line', () => {
    expect(parseLineEdits(lines, { 1: '12' })).toEqual({
      ok: true,
      lines: [
        { id: 1, qty: 12 },
        { id: 2, qty: 4 },
      ],
    })
  })

  it('names the SKU that failed', () => {
    expect(parseLineEdits(lines, { 1: '' }).error).toBe('PF-ATLAS-01: a quantity is required.')
    expect(parseLineEdits(lines, { 2: 'lots' }).error).toBe(
      'PF-ATLAS-02: the quantity must be a number.'
    )
    expect(parseLineEdits(lines, { 2: '0' }).error).toBe(
      'PF-ATLAS-02: the quantity must be more than zero.'
    )
    expect(parseLineEdits(lines, { 2: '-3' }).error).toMatch(/more than zero/)
  })

  it('falls back to the line id when there is no SKU', () => {
    expect(parseLineEdits([{ id: 9, qty: '1' }], { 9: '0' }).error).toBe(
      'line 9: the quantity must be more than zero.'
    )
  })

  it('refuses an order with no lines', () => {
    expect(parseLineEdits([], {})).toEqual({
      ok: false,
      error: 'This order has no lines to edit.',
    })
  })
})

describe('lineEditsChanged', () => {
  const lines = [
    { id: 1, qty: '10.00' },
    { id: 2, qty: '4.00' },
  ]

  it('is false when the numbers match despite pg string form', () => {
    expect(
      lineEditsChanged(lines, [
        { id: 1, qty: 10 },
        { id: 2, qty: 4 },
      ])
    ).toBe(false)
  })

  it('is true when any quantity moved', () => {
    expect(
      lineEditsChanged(lines, [
        { id: 1, qty: 10 },
        { id: 2, qty: 5 },
      ])
    ).toBe(true)
  })
})

describe('formatCents', () => {
  it('renders NZ money from integer cents', () => {
    expect(formatCents(18600)).toBe('$186.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(123456789)).toBe('$1,234,567.89')
  })

  it('renders an em dash rather than NaN for a missing figure', () => {
    expect(formatCents(null)).toBe('—')
    expect(formatCents(undefined)).toBe('—')
    expect(formatCents('nonsense')).toBe('—')
  })
})

describe('contactLabel', () => {
  it('names the account, falling back to its email, then the guest email', () => {
    expect(
      contactLabel({ client_name: 'Ada Reid', client_email: 'ada@b.nz', user_id: 4 })
    ).toBe('Ada Reid')
    expect(contactLabel({ client_name: null, client_email: 'ada@b.nz', user_id: 4 })).toBe(
      'ada@b.nz'
    )
    expect(contactLabel({ guest_email: 'a@b.nz', user_id: 4 })).toBe('a@b.nz')
    expect(contactLabel({ guest_email: null, user_id: 4 })).toBe('Account #4')
    expect(contactLabel({})).toBe('No contact recorded')
  })

  // Most clients on the roster have no login and about half have no email, so
  // the name the API packed into the notes is all an office-raised order has.
  it('reads the name packed into the notes when there is no account', () => {
    expect(
      contactLabel({
        notes: 'Name: Athfield Architects Limited | Phone: 04 555 0000\nClient: Athfield',
      })
    ).toBe('Athfield Architects Limited')
    expect(contactLabel({ notes: 'Name: Ada Lovelace' })).toBe('Ada Lovelace')
    // An account's own name still wins, and a note with no packed name does not.
    expect(contactLabel({ client_name: 'Ada Reid', notes: 'Name: Someone Else' })).toBe('Ada Reid')
    expect(contactLabel({ notes: 'Rang about the hallway runner.', guest_email: 'a@b.nz' })).toBe(
      'a@b.nz'
    )
  })
})

// A staff-keyed sales order reserves stock exactly like a web request; only a
// card checkout holds nothing, because Stripe already decremented it.
describe('manual sales orders', () => {
  it('names the kind and treats it as reserving', () => {
    expect(KIND_LABELS.manual).toBe('Sales order')
    expect(reservesStock('manual')).toBe(true)
    expect(reservesStock('order_request')).toBe(true)
    expect(reservesStock('checkout')).toBe(false)
  })
})

describe('canDeleteOrder', () => {
  it('allows an order that is not yet a financial record', () => {
    for (const status of ['quote_requested', 'pending_payment', 'cancelled']) {
      expect(canDeleteOrder({ kind: 'manual', status })).toBe(true)
      expect(canDeleteOrder({ kind: 'order_request', status })).toBe(true)
    }
  })

  it('refuses one that money has moved against', () => {
    for (const status of ['paid', 'shipped', 'completed', 'refunded']) {
      expect(canDeleteOrder({ kind: 'order_request', status })).toBe(false)
    }
  })

  // cancelled is reachable after the invoice went out: still a record.
  it('refuses any order with an invoice in Xero', () => {
    expect(canDeleteOrder({ kind: 'manual', status: 'cancelled', xero_invoice_id: 'inv-1' })).toBe(
      false
    )
  })

  // The row is the platform's only record of a payment taken at Stripe.
  it('refuses a card checkout whatever its status', () => {
    for (const status of ORDER_STATUSES) {
      expect(canDeleteOrder({ kind: 'checkout', status })).toBe(false)
    }
  })

  // Archiving is how a finished order leaves the queue; changing your mind
  // afterwards must not need a restore first.
  it('still allows an archived order', () => {
    expect(canDeleteOrder({ kind: 'manual', status: 'cancelled', archived_at: '2026-08-01' })).toBe(
      true
    )
  })

  it('is false for nothing at all', () => {
    expect(canDeleteOrder(null)).toBe(false)
    expect(canDeleteOrder({})).toBe(false)
  })
})

describe('line drafts', () => {
  it('renders a saved line in the units staff type', () => {
    const draft = draftFromLine({
      id: 7,
      colourway_id: 3,
      sku: 'PF-ATLAS-01',
      qty: '12.50',
      unit_price_cents: 18600,
      cut_requirements: 'One length',
    })
    expect(draft).toMatchObject({ id: 7, qty: '12.5', price: '186.00', cut: 'One length' })
  })

  // A draft with no id is a line the API has never seen — that is what makes it
  // an add rather than an edit.
  it('renders a catalogue hit as a new line with no id', () => {
    const draft = draftFromColourway({
      id: 9,
      sku: 'NEW-01',
      name: 'Jade',
      product_name: 'Atlas',
      brand_name: 'Pierre Frey',
      trade_price_cents: 12000,
    })
    expect(draft.id).toBeNull()
    expect(draft).toMatchObject({ colourway_id: 9, qty: '1', price: '120.00' })
  })

  it('leaves the price blank when the catalogue states none', () => {
    expect(draftFromColourway({ id: 9, sku: 'X' }).price).toBe('')
  })
})

describe('buildLinePatch', () => {
  const original = [
    { id: 1, colourway_id: 10, sku: 'A-1', qty: '10.00', unit_price_cents: 0, cut_requirements: null },
    { id: 2, colourway_id: 20, sku: 'B-2', qty: '4.00', unit_price_cents: 5000, cut_requirements: null },
  ]
  const draftsOf = (lines) => lines.map((line) => draftFromLine(line))

  it('is null when nothing moved, so a no-op save is never sent', () => {
    expect(buildLinePatch(original, draftsOf(original))).toEqual({ ok: true, patch: null })
  })

  // Pricing the quote in place: the whole point of the feature.
  it('sends only the fields that changed', () => {
    const drafts = draftsOf(original)
    drafts[0].price = '99.00'
    expect(buildLinePatch(original, drafts)).toEqual({
      ok: true,
      patch: { lines: [{ id: 1, unit_price_cents: 9900 }] },
    })
  })

  it('sends a quantity change on its own', () => {
    const drafts = draftsOf(original)
    drafts[0].qty = '25'
    expect(buildLinePatch(original, drafts).patch).toEqual({ lines: [{ id: 1, qty: 25 }] })
  })

  it('adds a line that has no id', () => {
    const drafts = [
      ...draftsOf(original),
      draftFromColourway({ id: 30, sku: 'C-3' }, { qty: '2', price: '10.00' }),
    ]
    expect(buildLinePatch(original, drafts).patch).toEqual({
      add_lines: [
        { colourway_id: 30, qty: 2, unit_price_cents: 1000, cut_requirements: null },
      ],
    })
  })

  it('removes a saved line the draft list no longer holds', () => {
    const drafts = draftsOf(original).slice(0, 1)
    expect(buildLinePatch(original, drafts).patch).toEqual({ remove_line_ids: [2] })
  })

  it('combines an edit, an add and a removal in one body', () => {
    const drafts = [
      { ...draftFromLine(original[0]), qty: '11', price: '20.00', cut: 'Cut square' },
      draftFromColourway({ id: 30, sku: 'C-3' }, { qty: '2', price: '10.00' }),
    ]
    expect(buildLinePatch(original, drafts).patch).toEqual({
      lines: [{ id: 1, qty: 11, unit_price_cents: 2000, cut_requirements: 'Cut square' }],
      add_lines: [{ colourway_id: 30, qty: 2, unit_price_cents: 1000, cut_requirements: null }],
      remove_line_ids: [2],
    })
  })

  // The API refuses this with a 422; saying so here saves the round trip and
  // names the action that IS right.
  it('refuses to empty an order, naming decline instead', () => {
    const result = buildLinePatch(original, [])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Cancel it instead/)
  })

  it('allows removing every saved line as long as one is added', () => {
    const drafts = [draftFromColourway({ id: 30, sku: 'C-3' }, { qty: '2', price: '10.00' })]
    expect(buildLinePatch(original, drafts).patch).toMatchObject({
      remove_line_ids: [1, 2],
    })
  })

  it.each([
    ['a blank quantity', { qty: '' }, /A-1: a quantity is required/],
    ['a quantity that is not a number', { qty: 'ten' }, /must be a number/],
    ['a zero quantity', { qty: '0' }, /more than zero/],
    ['a negative quantity', { qty: '-3' }, /more than zero/],
    ['an unparseable price', { price: 'free' }, /unit price must be an amount/],
  ])('refuses %s, naming the SKU', (_label, patch, expected) => {
    const drafts = draftsOf(original)
    Object.assign(drafts[0], patch)
    const result = buildLinePatch(original, drafts)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(expected)
  })

  // An unpriced line is what a storefront request already holds — "nobody has
  // priced this yet", not "free".
  it('treats a blank price as zero rather than an error', () => {
    const drafts = draftsOf(original)
    drafts[1].price = ''
    expect(buildLinePatch(original, drafts).patch).toEqual({
      lines: [{ id: 2, unit_price_cents: 0 }],
    })
  })
})

describe('buildCreateLines', () => {
  it('sends every line, with no diffing', () => {
    const drafts = [
      draftFromColourway({ id: 5, sku: 'A' }, { qty: '3', price: '12.50' }),
      draftFromColourway({ id: 6, sku: 'B' }, { qty: '1', price: '0.00' }),
    ]
    expect(buildCreateLines(drafts)).toEqual({
      ok: true,
      lines: [
        { colourway_id: 5, qty: 3, unit_price_cents: 1250, cut_requirements: null },
        { colourway_id: 6, qty: 1, unit_price_cents: 0, cut_requirements: null },
      ],
    })
  })

  it('refuses an order with no lines', () => {
    expect(buildCreateLines([])).toEqual({ ok: false, error: 'Add at least one line.' })
  })

  it('names the row that will not parse', () => {
    const result = buildCreateLines([draftFromColourway({ id: 5, sku: 'A' }, { qty: 'x' })])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^A: /)
  })
})

describe('draftSubtotalCents', () => {
  it('totals the rows as typed', () => {
    expect(
      draftSubtotalCents([
        { qty: '2', price: '10.00' },
        { qty: '1.5', price: '20.00' },
      ])
    ).toBe(5000)
  })

  // A half-typed row must not blank the running total; the save is where a bad
  // row is named.
  it('skips a row it cannot read rather than returning NaN', () => {
    expect(draftSubtotalCents([{ qty: '', price: '10.00' }, { qty: '2', price: '5.00' }])).toBe(
      1000
    )
  })

  it('is zero for nothing', () => {
    expect(draftSubtotalCents([])).toBe(0)
  })
})

describe('the order source', () => {
  // The client kept web orders in the sales-order list "with an identifier that
  // it came from website". `orders.kind` already was that identifier, so the
  // source is DERIVED and there is no column for it.
  it('reads a manual order as the office and everything else as the website', () => {
    expect(sourceOf('manual')).toBe('office')
    expect(sourceOf('checkout')).toBe('website')
    expect(sourceOf('order_request')).toBe('website')
    expect(sourceOf('backorder_request')).toBe('website')
  })

  it('prints Website and Office, the two words the client asked for', () => {
    expect(sourceLabel({ kind: 'checkout' })).toBe('Website')
    expect(sourceLabel({ kind: 'manual' })).toBe('Office')
  })

  // An unknown kind must read as something. A blank cell reads as missing data
  // rather than as an answer, and every kind the API has ever had except
  // `manual` arrives through the storefront.
  it('falls back to Website for a kind it has never heard of', () => {
    expect(sourceLabel({ kind: 'wholesale_edi' })).toBe('Website')
    expect(sourceLabel({})).toBe('Website')
    expect(sourceLabel()).toBe('Website')
  })

  it('offers exactly the two sources as filter options, derived not re-typed', () => {
    expect(SOURCE_OPTIONS).toEqual([
      { value: 'website', label: 'Website' },
      { value: 'office', label: 'Office' },
    ])
  })

  // The source is a second READING of the kind, not a replacement: the row
  // prints both, so the finer answer is never lost.
  it('leaves KIND_LABELS as the finer answer', () => {
    expect(KIND_LABELS.manual).toBe('Sales order')
    expect(KIND_LABELS.checkout).toBe('Card checkout')
  })
})

// A storefront request arrives with every line at $0.00 — "not priced yet",
// not free. The API refuses quote_sent / pending_payment / paid / Xero on the same count
// (src/orders/order-states.js `unpricedLineCount`); these are the mirror.
describe('unpriced lines', () => {
  it('counts lines at $0.00, tolerating the pg string form', () => {
    expect(unpricedLineCount([{ unit_price_cents: 0 }, { unit_price_cents: '0' }, { unit_price_cents: 100 }])).toBe(2)
    expect(unpricedLineCount([])).toBe(0)
    expect(unpricedLineCount(undefined)).toBe(0)
  })

  it('words the hint by count and says nothing when priced', () => {
    expect(unpricedHint(1)).toBe('Price every line first — 1 line still at $0.00.')
    expect(unpricedHint(2)).toBe('Price every line first — 2 lines still at $0.00.')
    expect(unpricedHint(0)).toBe('')
  })

  it('reads $0.00 as not priced yet, on a line and on an unpriced quote', () => {
    expect(formatLinePrice(0)).toBe('Not priced yet')
    expect(formatLinePrice(9900)).toBe('$99.00')
    const unpriced = { total_cents: 0, lines: [{ unit_price_cents: 0 }] }
    expect(formatOrderTotal(unpriced)).toBe('Not priced yet')
    // A fully priced order comped to zero by a 100% discount is a real figure.
    const comped = { total_cents: 0, lines: [{ unit_price_cents: 5000 }] }
    expect(formatOrderTotal(comped)).toBe('$0.00')
    expect(formatOrderTotal({ total_cents: 9900, lines: [] })).toBe('$99.00')
  })

  it('gates the three money-stating moves on pricing, never ship, back order or cancel', () => {
    expect([...PRICED_ENTRY_STATUSES]).toEqual(['quote_sent', 'pending_payment', 'paid'])
    expect(needsPricing('quote_sent')).toBe(true)
    expect(needsPricing('pending_payment')).toBe(true)
    expect(needsPricing('paid')).toBe(true)
    expect(needsPricing('shipped')).toBe(false)
    expect(needsPricing('back_order')).toBe(false)
    expect(needsPricing('cancelled')).toBe(false)
    expect(needsPricing(undefined)).toBe(false)
  })

  it('starts the price box empty for an unpriced line and carries the colour + unit', () => {
    const draft = draftFromLine({ id: 1, unit_price_cents: 0, colourway_name: 'Flax', unit: 'metres', qty: '10.00' })
    expect(draft.price).toBe('')
    expect(draft.colourway_name).toBe('Flax')
    expect(draft.unit).toBe('metres')
    expect(draftFromLine({ id: 2, unit_price_cents: 1250 }).price).toBe('12.50')
  })

  it('prints the quantity with its inventory unit', () => {
    expect(formatQty('10.00', 'metres')).toBe('10 m')
    expect(formatQty(3, 'units')).toBe('3 units')
    expect(formatQty('2.50', null)).toBe('2.5')
  })
})

// What the order page's "short on stock" note and the Available column read.
describe('stock behind a line', () => {
  const line = (qty, available, reserved, own) => ({
    qty,
    inventory: { qty_available: available, qty_reserved: reserved },
    reserved_qty: own,
  })

  it('counts this order\'s own reservation as available to it', () => {
    // 20 on hand, 15 reserved — 10 of them by this very line.
    expect(lineAvailable(line('10.00', '20.00', '15.00', '10.00'))).toBe(15)
    expect(isShortLine(line('10.00', '20.00', '15.00', '10.00'))).toBe(false)
  })

  it('is short when others hold what this line needs', () => {
    expect(isShortLine(line('10.00', '12.00', '12.00', '0'))).toBe(true)
  })

  it('treats a colourway never stocked as short, and says null for its figure', () => {
    expect(lineAvailable({ qty: '2', inventory: null })).toBeNull()
    expect(isShortLine({ qty: '2', inventory: null })).toBe(true)
  })

  it('counts the short lines on an order', () => {
    const order = {
      lines: [
        line('10.00', '20.00', '10.00', '10.00'),
        line('5.00', '3.00', '0', '0'),
        { qty: '1', inventory: null },
      ],
    }
    expect(shortLineCount(order)).toBe(2)
    expect(shortLineCount({})).toBe(0)
  })

  it('carries the stock snapshot and the purchase order onto the draft, read-only', () => {
    const draft = draftFromLine({
      id: 3,
      qty: '4.00',
      unit_price_cents: 100,
      inventory: { qty_available: '9.00', qty_reserved: '4.00' },
      reserved_qty: '4.00',
      purchase_order: { id: 12, po_number: 'PO-0012', status: 'draft' },
    })
    expect(lineAvailable(draft)).toBe(9)
    expect(draft.purchase_order.po_number).toBe('PO-0012')
  })
})
