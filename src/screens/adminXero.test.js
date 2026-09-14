import { describe, it, expect } from 'vitest'
import {
  canPushToXero,
  parseXeroReturn,
  describeContactSync,
  describeItemSync,
  syncFailures,
} from './adminXero.js'

const connected = { configured: true, connected: true }

describe('canPushToXero', () => {
  it('offers the push wherever the API would take it, once, when connected', () => {
    expect(canPushToXero({ status: 'requested' }, connected)).toBe(true)
    expect(canPushToXero({ status: 'confirmed' }, connected)).toBe(true)
    // A card checkout arrives `paid` and never passes requested/confirmed; the
    // API refuses only `declined`, so this is the one kind of order that used
    // to be uninvoiceable from the screen.
    expect(canPushToXero({ status: 'paid' }, connected)).toBe(true)
    expect(canPushToXero({ status: 'declined' }, connected)).toBe(false)
    // Already pushed: the id is the duplicate gate.
    expect(canPushToXero({ status: 'requested', xero_invoice_id: 'x' }, connected)).toBe(false)
    // Not configured / not connected / nothing open.
    expect(canPushToXero({ status: 'requested' }, { configured: false })).toBe(false)
    expect(canPushToXero({ status: 'requested' }, { configured: true, connected: false })).toBe(
      false
    )
    expect(canPushToXero(null, connected)).toBe(false)
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
