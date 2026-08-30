import { describe, it, expect } from 'vitest'
import { buildUser, seedUsers, allUsers } from './userRecords.js'
import { USERS } from './roles.js'

describe('seedUsers / allUsers — the seeded cast is the read-only baseline', () => {
  it('tags every seeded user and never loses one', () => {
    const seeds = seedUsers()
    expect(seeds).toHaveLength(USERS.length)
    expect(seeds.every((u) => u.seeded === true)).toBe(true)
    expect(seeds.map((u) => u.id)).toEqual(USERS.map((u) => u.id))
  })

  it('always contains a director, so admin can never be locked out', () => {
    expect(seedUsers().some((u) => u.role === 'director')).toBe(true)
  })

  it('puts seeds first, then created', () => {
    const created = [{ id: 'priya', name: 'Priya', email: 'p@x.co', role: 'user' }]
    const all = allUsers(created)
    expect(all).toHaveLength(USERS.length + 1)
    expect(all[all.length - 1].id).toBe('priya')
  })
})

describe('buildUser — validation fails closed', () => {
  const existing = allUsers()

  it('requires a name', () => {
    expect(buildUser({ email: 'a@b.co', role: 'user' }, existing).error).toBe('Name is required.')
  })

  it('requires an email, and rejects a malformed one', () => {
    expect(buildUser({ name: 'A', role: 'user' }, existing).error).toBe('Email is required.')
    expect(buildUser({ name: 'A', email: 'not-an-email', role: 'user' }, existing).error).toBe('Enter a valid email address.')
  })

  it('rejects a duplicate email (case-insensitive) against the whole roster', () => {
    const dup = buildUser({ name: 'Imposter', email: 'ELIZABETHD@atelier.co.nz', role: 'user' }, existing)
    expect(dup.error).toBe('An account with that email already exists.')
  })

  it('rejects a missing or unknown role rather than defaulting', () => {
    expect(buildUser({ name: 'A', email: 'a@b.co' }, existing).error).toBe('Choose a role.')
    expect(buildUser({ name: 'A', email: 'a@b.co', role: 'wizard' }, existing).error).toBe('Choose a role.')
  })

  it('builds a valid, non-seeded record with a unique slug id and normalised email', () => {
    const u = buildUser({ name: 'Priya Rao', email: '  Priya@X.CO  ', role: 'finance', owner: 'Priya' }, existing)
    expect(u.error).toBeUndefined()
    expect(u).toMatchObject({ name: 'Priya Rao', email: 'priya@x.co', role: 'finance', owner: 'Priya', seeded: false })
    expect(u.id).toBe('priya-rao')
    expect(typeof u.createdAt).toBe('string')
  })

  it('blank owner becomes null (no salesperson attached)', () => {
    expect(buildUser({ name: 'A', email: 'a@b.co', role: 'user' }, existing).owner).toBe(null)
  })

  it('avoids an id collision by suffixing', () => {
    const withPriya = allUsers([{ id: 'priya', name: 'Priya', email: 'first@x.co', role: 'user' }])
    const second = buildUser({ name: 'Priya', email: 'second@x.co', role: 'user' }, withPriya)
    expect(second.id).toBe('priya-2')
  })
})
