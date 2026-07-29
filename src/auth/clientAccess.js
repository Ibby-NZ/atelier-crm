// Client operational-record access control (Atelier decision, 17 Jul).
//
// The report gate (reportPolicy.js) scopes FIGURES; this scopes RECORDS. A User may open only the
// trade accounts they own — the client list hides the rest and the client route refuses them.
// Full-book roles (reports.all → Director, Finance) keep the whole book. This deliberately reverses
// the earlier default noted in roles.js accessOf() ("scopes REPORTS, not OPERATIONAL RECORDS"):
// Atelier asked for client records to be owner-scoped too.
//
// `access` is the { finance, all, owner } shape from accessOf(); `ownership` is the store's
// clientOwnership map ({ [clientId]: { owner, audit } }). Ownership itself resolves in one place —
// data/ownership.js resolveOwner (override > region matrix > fallback).
//
// DEMO-GRADE, like the rest of auth/: this gates what the browser DRAWS. Real enforcement scopes the
// query server-side, so a User's response never carries another owner's client in the first place.
import { resolveOwner } from '../data/ownership.js'

// May this login open this client? Fails closed on a missing client or access.
export function canAccessClient(access, client, ownership = {}) {
  if (!client || !access) return false
  if (access.all) return true // Director / Finance — the whole book
  if (!access.owner) return false // a shared login with no person attributes to no one
  return resolveOwner(client, ownership) === access.owner
}

// The subset of `clients` this login may see. Full-book roles get the array unchanged.
export function visibleClients(access, clients = [], ownership = {}) {
  if (access && access.all) return clients
  return clients.filter((client) => canAccessClient(access, client, ownership))
}
