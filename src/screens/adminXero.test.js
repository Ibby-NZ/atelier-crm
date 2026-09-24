import { describe, it, expect } from 'vitest'
import {
  canPushToXero,
  canPushBillToXero,
  describePullContacts,
  describePullStatuses,
  xeroStatusLabel,
  parseXeroReturn,
  describeContactSync,
  describeItemSync,
  syncFailures,
} from './adminXero.js'

const connected = { configured: true, connected: true }

describe('canPushToXero', () => {
  it('offers the push wherever the API would take it, once, when connected', () => {
    expect(canPushToXero({ status: 'quote_accepted' }, connected)).toBe(true)
    expect(canPushToXero({ status: 'processing' }, connected)).toBe(true)
    expect(canPushToXero({ status: 'pending_payment' }, connected)).toBe(true)
    // A card checkout arrives `paid`; it must still be invoiceable.
    expect(canPushToXero({ status: 'paid' }, connected)).toBe(true)
    // An unaccepted quote is not awaiting an invoice; a cancelled order never will be.
    expect(canPushToXero({ status: 'quote_requested' }, connected)).toBe(false)
    expect(canPushToXero({ status: 'quote_sent' }, connected)).toBe(false)
    expect(canPushToXero({ status: 'cancelled' }, connected)).toBe(false)
    // Already pushed: the id is the duplicate gate.
    expect(canPushToXero({ status: 'processing', xero_invoice_id: 'x' }, connected)).toBe(false)
    // Not configured / not connected / nothing open.
    expect(canPushToXero({ status: 'processing' }, { configured: false })).toBe(false)
    expect(canPushToXero({ status: 'processing' }, { configured: true, connected: false })).toBe(
      false
    )
    expect(canPushToXero(null, connected)).toBe(false)
  })
})

describe('canPushToXero after a void', () => {
  it('offers the push again once Xero has voided or deleted the invoice', () => {
    const status = { configured: true, connected: true }
    const order = { status: 'pending_payment', xero_invoice_id: 'inv-1', xero_invoice_status: 'VOIDED' }
    expect(canPushToXero(order, status)).toBe(true)
    expect(canPushToXero({ ...order, xero_invoice_status: 'PAID' }, status)).toBe(false)
    expect(canPushToXero({ ...order, xero_invoice_status: null }, status)).toBe(false)
  })
})

describe('canPushBillToXero', () => {
  it('offers the bill for a sent or closed purchase order, once, when connected', () => {
    const status = { configured: true, connected: true }
    expect(canPushBillToXero({ status: 'sent', xero_bill_id: null }, status)).toBe(true)
    expect(canPushBillToXero({ status: 'closed', xero_bill_id: null }, status)).toBe(true)
    expect(canPushBillToXero({ status: 'draft', xero_bill_id: null }, status)).toBe(false)
    expect(canPushBillToXero({ status: 'cancelled', xero_bill_id: null }, status)).toBe(false)
    expect(canPushBillToXero({ status: 'sent', xero_bill_id: 'b-1' }, status)).toBe(false)
    expect(canPushBillToXero({ status: 'sent', xero_bill_id: 'b-1', xero_bill_status: 'VOIDED' }, status)).toBe(true)
    expect(canPushBillToXero({ status: 'sent', xero_bill_id: null }, { configured: true, connected: false })).toBe(false)
    expect(canPushBillToXero(null, status)).toBe(false)
  })
})

describe('xeroStatusLabel', () => {
  it('says Xero\'s word in ours', () => {
    expect(xeroStatusLabel('PAID')).toBe('paid in Xero')
    expect(xeroStatusLabel('AUTHORISED')).toBe('awaiting payment in Xero')
    expect(xeroStatusLabel('DRAFT')).toBe('draft in Xero')
    expect(xeroStatusLabel('VOIDED')).toBe('voided in Xero')
    expect(xeroStatusLabel('DELETED')).toBe('deleted in Xero')
    expect(xeroStatusLabel('SUBMITTED')).toBe('awaiting approval in Xero')
    expect(xeroStatusLabel(null)).toBe('')
    expect(xeroStatusLabel('SOMETHING')).toBe('SOMETHING in Xero')
  })
})

describe('pull result lines', () => {
  it('describes a contacts pull', () => {
    expect(
      describePullContacts({
        seen: 12,
        companies: { updated: 3, linked: 1, created: 2 },
        suppliers: { updated: 0, linked: 0, created: 1 },
        people: { updated: 1 },
        skipped: 4,
        failed: [],
      })
    ).toBe('12 seen · clients updated 3, linked 1, created 2 · suppliers created 1 · people updated 1 · 4 skipped')
    expect(describePullContacts({ seen: 0, companies: {}, suppliers: {}, people: {}, skipped: 0, failed: [{}] })).toBe(
      '0 seen · 1 failed'
    )
    expect(describePullContacts(null)).toBe('')
  })

  it('describes a statuses pull', () => {
    expect(
      describePullStatuses({
        invoices: { checked: 5, updated: 2, orders_marked_paid: [{ id: 1, order_number: 'AT-1' }], failed: [] },
        bills: { checked: 2, updated: 1, failed: [] },
      })
    ).toBe('invoices checked 5, updated 2, marked paid AT-1 · bills checked 2, updated 1')
    expect(
      describePullStatuses({
        invoices: { checked: 0, updated: 0, orders_marked_paid: [], failed: [{}] },
        bills: { checked: 0, updated: 0, failed: [] },
      })
    ).toBe('invoices checked 0, updated 0, 1 failed · bills checked 0, updated 0')
    expect(describePullStatuses(null)).toBe('')
  })

  it('syncFailures reads the generic key too', () => {
    expect(syncFailures({ failed: [{ key: 'Maison', message: 'dup' }] }).shown[0].key).toBe('Maison')
  })
})

describe('parseXeroReturn', () => {
  it('reads the callback outcome and is null on a plain visit', () => {
    expect(parseXeroReturn('?connected=1')).toEqual({ outcome: 'connected', reason: null })
    expect(parseXeroReturn('?connected=0&reason=cancelled')).toEqual({
      outcome: 'failed',
      reason: 'cancelled',
    })
    expect(parseXeroReturn('?connected=0')).toEqual({ outcome: 'failed', reason: null })
    expect(parseXeroReturn('')).toBeNull()
    expect(parseXeroReturn('?page=2')).toBeNull()
  })
})

describe('sync result lines', () => {
  it('describes a contacts sync, mentioning failures only when there are any', () => {
    expect(describeContactSync({ linked: 3, created: 2, failed: [] })).toBe('linked 3 · created 2')
    expect(describeContactSync({ linked: 0, created: 0, failed: [{}] })).toBe(
      'linked 0 · created 0 · 1 failed'
    )
    expect(describeContactSync(null)).toBe('')
  })

  it('describes an items sync', () => {
    expect(describeItemSync({ pushed: 214, failed: [] })).toBe('pushed 214')
    expect(describeItemSync({ pushed: 1, failed: [{}, {}] })).toBe('pushed 1 · 2 failed')
  })

  it('caps the failure list and counts the rest', () => {
    const failed = Array.from({ length: 11 }, (_, i) => ({ sku: `S-${i}`, message: 'no' }))
    const { shown, more } = syncFailures({ failed }, 8)
    expect(shown).toHaveLength(8)
    expect(shown[0]).toEqual({ key: 'S-0', message: 'no' })
    expect(more).toBe(3)
    expect(syncFailures({ failed: [] }).more).toBe(0)
    // Contact failures key on email.
    expect(syncFailures({ failed: [{ email: 'a@b.c', message: 'dup' }] }).shown[0].key).toBe(
      'a@b.c'
    )
  })
})
