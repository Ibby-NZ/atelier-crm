import { describe, it, expect } from 'vitest'
import { regionOwners, FALLBACK_OWNER, ownerForRegion, resolveOwner } from './ownership.js'

// Client ownership matrix (decision 4, 15 Jul): region → owner, with manual override + fallback.
describe('ownerForRegion — the region matrix', () => {
  it('maps each known region to its assigned owner', () => {
    expect(ownerForRegion('Auckland')).toBe('Jenette')
    expect(ownerForRegion('Wellington')).toBe('Charlotte')
    expect(ownerForRegion('Canterbury')).toBe('Rebecca')
    expect(ownerForRegion('Otago / Queenstown')).toBe('Rebecca')
  })

  it('falls back for an unknown or missing region', () => {
    expect(ownerForRegion('Nowhere')).toBe(FALLBACK_OWNER)
    expect(ownerForRegion(undefined)).toBe(FALLBACK_OWNER)
    expect(FALLBACK_OWNER).toBe('Liz')
  })

  it('every mapped region resolves to a real name', () => {
    Object.values(regionOwners).forEach((owner) => expect(typeof owner).toBe('string'))
  })
})

describe('resolveOwner — override > matrix > fallback', () => {
  it('uses the region matrix when there is no override', () => {
    expect(resolveOwner({ id: 'a', region: 'Canterbury' }, {})).toBe('Rebecca')
  })

  it('lets a manual override win over the matrix', () => {
    expect(resolveOwner({ id: 'a', region: 'Canterbury' }, { a: { owner: 'Jenette' } })).toBe('Jenette')
  })

  it('ignores an override with no owner set', () => {
    expect(resolveOwner({ id: 'a', region: 'Wellington' }, { a: { owner: '' } })).toBe('Charlotte')
  })

  it('tolerates a null client', () => {
    expect(resolveOwner(null)).toBe(FALLBACK_OWNER)
  })
})
