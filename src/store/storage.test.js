import { describe, it, expect } from 'vitest'
import { STORAGE_KEY, emptyState, safeParse, loadState, saveState } from './storage.js'

// A Map-backed fake matching the {getItem,setItem} contract.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
  }
}

describe('safeParse — validation degrades to empty state', () => {
  it('round-trips a valid serialized state', () => {
    const state = {
      version: 1,
      salesOrders: [{ id: 'SO-2026-0419', rooms: [], summary: { gstRate: 0.15 } }],
      clients: [{ id: 'acme' }],
      purchaseOrders: [{ id: 'PO-2026-0143', lines: [], receipts: [] }],
      clientOwnership: { acme: { owner: 'Rebecca', audit: [] } },
      users: [{ id: 'priya', name: 'Priya', email: 'priya@x.co', role: 'user', owner: 'Priya' }],
    }
    expect(safeParse(JSON.stringify(state))).toEqual(state)
  })

  it('defaults a legacy payload without clientOwnership to {} (never rejected)', () => {
    const legacy = { version: 1, salesOrders: [], clients: [{ id: 'acme' }], purchaseOrders: [] }
    const parsed = safeParse(JSON.stringify(legacy))
    expect(parsed.clientOwnership).toEqual({})
    expect(parsed.clients.map((c) => c.id)).toEqual(['acme']) // records survive
  })

  it('defaults a legacy payload without users to [] and drops malformed user records', () => {
    const legacy = { version: 1, salesOrders: [], clients: [], purchaseOrders: [] }
    expect(safeParse(JSON.stringify(legacy)).users).toEqual([])

    const withUsers = {
      version: 1, salesOrders: [], clients: [], purchaseOrders: [],
      users: [
        { id: 'good', name: 'Good', email: 'g@x.co', role: 'user' },
        { id: '', email: 'e@x.co', role: 'user' }, // no id
        { id: 'norole', email: 'e2@x.co' },         // no role
        { name: 'noid' },                            // junk
      ],
    }
    expect(safeParse(JSON.stringify(withUsers)).users.map((u) => u.id)).toEqual(['good'])
  })

  it('drops individually malformed records but keeps the valid ones', () => {
    const state = {
      version: 1,
      salesOrders: [{ id: 'BAD' } /* no rooms */, { id: 'SO-2026-0420', rooms: [], summary: {} }],
      clients: [{ name: 'no id' }, { id: 'good' }],
      purchaseOrders: [{ id: 'BAD' } /* no lines */, { id: 'PO-2026-0144', lines: [], receipts: [] }],
    }
    const parsed = safeParse(JSON.stringify(state))
    expect(parsed.salesOrders.map((o) => o.id)).toEqual(['SO-2026-0420'])
    expect(parsed.clients.map((c) => c.id)).toEqual(['good'])
    expect(parsed.purchaseOrders.map((p) => p.id)).toEqual(['PO-2026-0144'])
  })

  it('malformed JSON → empty state', () => {
    expect(safeParse('{oops')).toEqual(emptyState())
  })

  it('wrong version → empty state', () => {
    expect(safeParse(JSON.stringify({ version: 2, salesOrders: [], clients: [], purchaseOrders: [] }))).toEqual(emptyState())
  })

  it('non-array collections → empty state', () => {
    expect(safeParse(JSON.stringify({ version: 1, salesOrders: {}, clients: [], purchaseOrders: [] }))).toEqual(emptyState())
  })

  it('non-string / null input → empty state', () => {
    expect(safeParse(null)).toEqual(emptyState())
    expect(safeParse(undefined)).toEqual(emptyState())
  })

  it('emptyState returns a fresh object each call (no shared reference)', () => {
    const a = emptyState()
    a.clients.push({ id: 'x' })
    expect(emptyState().clients).toEqual([])
  })
})

describe('loadState / saveState — through an injected storage', () => {
  it('round-trips created records', () => {
    const storage = fakeStorage()
    const state = { version: 1, salesOrders: [], clients: [{ id: 'acme' }], purchaseOrders: [], clientOwnership: {}, users: [] }
    expect(saveState(state, storage)).toBe(true)
    expect(storage.map.get(STORAGE_KEY)).toBe(JSON.stringify(state))
    expect(loadState(storage)).toEqual(state)
  })

  it('loadState on empty storage → empty state', () => {
    expect(loadState(fakeStorage())).toEqual(emptyState())
  })

  it('saveState swallows a throwing setItem and returns false', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceeded') },
    }
    expect(saveState(emptyState(), throwing)).toBe(false)
  })
})
