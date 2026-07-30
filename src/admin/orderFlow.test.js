import { describe, it, expect } from 'vitest'
import {
  ORDER_STATUSES,
  availableActions,
  canEditLines,
  reservesStock,
  parseLineEdits,
  lineEditsChanged,
  formatCents,
  contactLabel,
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
