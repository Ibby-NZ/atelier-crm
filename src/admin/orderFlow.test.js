import { describe, it, expect } from 'vitest'
import {
  ORDER_STATUSES,
  KIND_LABELS,
  availableActions,
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
} from './orderFlow.js'

const keysOf = (order) => availableActions(order).map((a) => a.key)

describe('availableActions', () => {
  it('offers exactly the transitions the API accepts from each status', () => {
    expect(keysOf({ status: 'requested' })).toEqual(['confirm', 'decline'])
    expect(keysOf({ status: 'confirmed' })).toEqual(['mark-paid', 'decline'])
    expect(keysOf({ status: 'paid' })).toEqual(['ship'])
    expect(keysOf({ status: 'shipped' })).toEqual([])
    expect(keysOf({ status: 'declined' })).toEqual([])
  })

  it('offers nothing on an archived order — it must be restored first', () => {
    expect(keysOf({ status: 'requested', archived_at: '2026-07-01T00:00:00Z' })).toEqual([])
  })

  it('offers nothing for an unknown status rather than throwing', () => {
    expect(keysOf({ status: 'invented' })).toEqual([])
    expect(availableActions(null)).toEqual([])
    expect(availableActions(undefined)).toEqual([])
  })

  it('marks confirm as the one transition that needs an invoice reference', () => {
    const confirm = availableActions({ status: 'requested' }).find((a) => a.key === 'confirm')
    expect(confirm.needsRef).toBe(true)
    const decline = availableActions({ status: 'requested' }).find((a) => a.key === 'decline')
    expect(decline.needsRef).toBeUndefined()
  })

  it('covers every declared status', () => {
    for (const status of ORDER_STATUSES) {
      expect(Array.isArray(availableActions({ status }))).toBe(true)
    }
  })
})

describe('canEditLines', () => {
  it('allows edits only before payment', () => {
    expect(canEditLines({ status: 'requested' })).toBe(true)
    expect(canEditLines({ status: 'confirmed' })).toBe(true)
    expect(canEditLines({ status: 'paid' })).toBe(false)
    expect(canEditLines({ status: 'shipped' })).toBe(false)
    expect(canEditLines({ status: 'declined' })).toBe(false)
  })

  it('refuses an archived order', () => {
    expect(canEditLines({ status: 'requested', archived_at: '2026-07-01' })).toBe(false)
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
  it('prefers the guest email, then the account', () => {
    expect(contactLabel({ guest_email: 'a@b.nz', user_id: 4 })).toBe('a@b.nz')
    expect(contactLabel({ guest_email: null, user_id: 4 })).toBe('Account #4')
    expect(contactLabel({})).toBe('No contact recorded')
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
    for (const status of ['requested', 'confirmed', 'declined']) {
      expect(canDeleteOrder({ kind: 'manual', status })).toBe(true)
      expect(canDeleteOrder({ kind: 'order_request', status })).toBe(true)
    }
  })

  it('refuses one that money has moved against', () => {
    for (const status of ['paid', 'shipped']) {
      expect(canDeleteOrder({ kind: 'order_request', status })).toBe(false)
    }
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
    expect(canDeleteOrder({ kind: 'manual', status: 'declined', archived_at: '2026-08-01' })).toBe(
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
    expect(result.error).toMatch(/Decline it instead/)
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
