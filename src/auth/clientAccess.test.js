import { describe, it, expect } from 'vitest'
import { canAccessClient, visibleClients } from './clientAccess.js'

// access shapes as accessOf() produces them: { finance, all, owner }
const director = { finance: true, all: true, owner: null }
const finance = { finance: true, all: true, owner: 'Charlotte' }
const rebecca = { finance: false, all: false, owner: 'Rebecca' }
const showroom = { finance: false, all: false, owner: null } // shared login — no person to attribute to

// clients keyed only by the fields the gate reads (id, region). Region → matrix owner:
const canterbury = { id: 'mckenzie-willis', region: 'Canterbury' } // Rebecca
const otago = { id: 'coast-co-design', region: 'Otago / Queenstown' } // Rebecca
const auckland = { id: 'marlow-finch-interiors', region: 'Auckland' } // Jenette
const wellington = { id: 'indigo-house-studio', region: 'Wellington' } // Charlotte

describe('canAccessClient', () => {
  it('full-book roles (all) reach every client', () => {
    expect(canAccessClient(director, auckland)).toBe(true)
    expect(canAccessClient(director, canterbury)).toBe(true)
    expect(canAccessClient(finance, auckland)).toBe(true)
  })

  it('a user reaches only clients whose resolved owner matches theirs', () => {
    expect(canAccessClient(rebecca, canterbury)).toBe(true)
    expect(canAccessClient(rebecca, otago)).toBe(true)
    expect(canAccessClient(rebecca, auckland)).toBe(false) // Jenette's
    expect(canAccessClient(rebecca, wellington)).toBe(false) // Charlotte's
  })

  it('honours a manual override over the region matrix', () => {
    const reassignedToRebecca = { 'marlow-finch-interiors': { owner: 'Rebecca', audit: [] } }
    expect(canAccessClient(rebecca, auckland, reassignedToRebecca)).toBe(true)
    const takenFromRebecca = { 'mckenzie-willis': { owner: 'Jenette', audit: [] } }
    expect(canAccessClient(rebecca, canterbury, takenFromRebecca)).toBe(false)
  })

  it('a shared/no-owner login reaches nothing', () => {
    expect(canAccessClient(showroom, canterbury)).toBe(false)
    expect(canAccessClient(showroom, auckland)).toBe(false)
  })

  it('fails closed on a missing client or access', () => {
    expect(canAccessClient(rebecca, null)).toBe(false)
    expect(canAccessClient(null, canterbury)).toBe(false)
  })
})

describe('visibleClients', () => {
  const all = [canterbury, otago, auckland, wellington]

  it('returns the whole book for a full-book role', () => {
    expect(visibleClients(director, all)).toHaveLength(4)
  })

  it('returns only the owned clients for a user', () => {
    expect(visibleClients(rebecca, all).map((c) => c.id)).toEqual(['mckenzie-willis', 'coast-co-design'])
  })

  it('returns nothing for a shared/no-owner login', () => {
    expect(visibleClients(showroom, all)).toHaveLength(0)
  })
})
