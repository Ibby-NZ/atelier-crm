// Client ownership matrix (decision 4, 15 Jul): client accounts are assigned to staff by region,
// with a manual per-client override and an audit trail. This module is the region→owner matrix and
// the resolution rule; the overrides + audit live in the persisted store (clientOwnership map).
//
// Region strings match ../data/atelier.js `regions`; owners match `team`. Assignments are INDICATIVE
// (the real region→owner matrix is owed with the A6/A7 person + territory definitions).

export const regionOwners = {
  Auckland: 'Jenette',
  'Waikato / BoP': 'Jenette',
  Wellington: 'Charlotte',
  Canterbury: 'Rebecca',
  'Otago / Queenstown': 'Rebecca',
}

// Fallback when a client has no region on the matrix (or no region at all).
export const FALLBACK_OWNER = 'Liz'

// The matrix default for a region, ignoring any manual override.
export function ownerForRegion(region) {
  return regionOwners[region] || FALLBACK_OWNER
}

// Resolve a client's owner. Precedence: manual override > region matrix > fallback.
// `ownership` is the store's clientOwnership map ({ [clientId]: { owner, audit } }).
export function resolveOwner(client, ownership = {}) {
  const override = client && ownership[client.id]
  if (override && override.owner) return override.owner
  return ownerForRegion(client && client.region)
}
