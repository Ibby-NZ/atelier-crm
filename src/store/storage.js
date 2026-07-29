// Persistence for user-created records only (seeds are never written — they live in ../data/atelier.js
// and are merged in at read time by AppStore). Pure module: all storage access goes through an
// injectable `storage` handle so the logic is testable in the node/vitest env with a fake, and so a
// blocked/absent localStorage (privacy mode, SSR) degrades to in-memory rather than throwing.

export const STORAGE_KEY = 'atelier-demo:v1'

// A fresh empty state each call — never a shared mutable reference.
export function emptyState() {
  // clientOwnership (decision 4, 15 Jul): { [clientId]: { owner, audit: [{ at, from, to, by }] } }.
  // users: admin-created logins only — the seeded cast (roles.js USERS) is merged at read time by
  // AppStore and never persisted, exactly like the seed SO/PO/clients.
  return { version: 1, salesOrders: [], clients: [], purchaseOrders: [], clientOwnership: {}, users: [] }
}

const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x)
// Per-record shape guards: the detail/list screens do unconditional `.map` over rooms/lines/receipts,
// so an individually-malformed record (schema drift, hand-edited localStorage) would white-screen the
// app. Dropping just the bad record — rather than the whole state — keeps every valid record usable and
// turns a stale deep link into a graceful NotFound.
const isValidSalesOrder = (o) => isObject(o) && Array.isArray(o.rooms) && isObject(o.summary)
const isValidClient = (c) => isObject(c) && typeof c.id === 'string' && c.id.length > 0
const isValidPurchaseOrder = (p) => isObject(p) && Array.isArray(p.lines) && Array.isArray(p.receipts)
// A persisted (admin-created) user needs at least an id, an email and a role to be usable by auth;
// a malformed one is dropped rather than allowed to poison the roster or the sign-in list.
const isValidUser = (u) =>
  isObject(u) && typeof u.id === 'string' && u.id.length > 0 &&
  typeof u.email === 'string' && u.email.length > 0 && typeof u.role === 'string' && u.role.length > 0

// Parse + validate a raw string. Any failure (non-string, malformed JSON, wrong shape/version,
// non-array collections) degrades to a clean empty state; individually malformed records are dropped.
export function safeParse(raw) {
  if (typeof raw !== 'string') return emptyState()
  try {
    const parsed = JSON.parse(raw)
    if (!isObject(parsed)) return emptyState()
    if (parsed.version !== 1) return emptyState()
    if (!Array.isArray(parsed.salesOrders) || !Array.isArray(parsed.clients) || !Array.isArray(parsed.purchaseOrders)) {
      return emptyState()
    }
    return {
      version: 1,
      salesOrders: parsed.salesOrders.filter(isValidSalesOrder),
      clients: parsed.clients.filter(isValidClient),
      purchaseOrders: parsed.purchaseOrders.filter(isValidPurchaseOrder),
      // Backward-compatible: a legacy payload without clientOwnership loads with {} (never rejected —
      // rejecting would wipe the user's saved records).
      clientOwnership: isObject(parsed.clientOwnership) ? parsed.clientOwnership : {},
      // Same courtesy for users: a legacy payload (or one with a non-array) loads with [].
      users: Array.isArray(parsed.users) ? parsed.users.filter(isValidUser) : [],
    }
  } catch {
    return emptyState()
  }
}

// In-memory shim used when localStorage is unavailable — a single session-lived instance so
// load/save stay consistent within the degraded session.
function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
  }
}

const fallbackMemory = createMemoryStorage()

// window.localStorage when reachable, else the in-memory fallback. Guarded because accessing
// localStorage throws in some privacy modes / sandboxed frames.
export function defaultStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    return fallbackMemory
  }
  return fallbackMemory
}

export function loadState(storage = defaultStorage()) {
  try {
    return safeParse(storage.getItem(STORAGE_KEY))
  } catch {
    return emptyState()
  }
}

// Returns true on success, false when the write was swallowed (quota/privacy) — callers keep the
// in-memory state and degrade gracefully rather than surfacing an error.
export function saveState(state, storage = defaultStorage()) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
