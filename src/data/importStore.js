// Session-scoped staging for the price-list import engine. In-memory only — the demo has no
// backend; staged batches survive route changes but not a reload. Copy-on-read/write keeps
// callers from mutating the store's state.
//
// Decision (15 Jul transcript): the business runs LIVE during migration, so imports must be
// re-runnable. Re-staging the same supplier REPLACES that supplier's batch; rows merge by
// normalized code (incoming wins), so a second import updates prices instead of duplicating rows.
let batches = []
let nextId = 1

const timeNow = () => new Date().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })

// Merge rows keyed by normalized `code`, last occurrence wins (dedupes within one import too).
function mergeRows(existing, incoming) {
  const byCode = new Map()
  const order = []
  for (const r of [...existing, ...incoming]) {
    const key = r.code || `#${order.length}`
    if (!byCode.has(key)) order.push(key)
    byCode.set(key, r)
  }
  return order.map((k) => byCode.get(k))
}

export function stageBatch({ supplierName, rows }) {
  const incoming = [...rows]
  const existing = batches.find((b) => b.supplierName === supplierName)
  if (existing) {
    const existingCodes = new Set(existing.rows.map((r) => r.code))
    const incomingCodes = new Set(incoming.map((r) => r.code))
    const updated = [...incomingCodes].filter((c) => existingCodes.has(c)).length
    const added = [...incomingCodes].filter((c) => !existingCodes.has(c)).length
    const merged = mergeRows(existing.rows, incoming)
    const batch = { ...existing, rows: merged, count: merged.length, updatedAt: timeNow() }
    batches = batches.map((b) => (b.id === existing.id ? batch : b))
    return { batch: { ...batch, rows: [...batch.rows] }, replaced: true, added, updated }
  }
  const at = timeNow()
  const deduped = mergeRows([], incoming) // dedupe within a single import (last row wins per code)
  const batch = { id: nextId++, supplierName, count: deduped.length, at, updatedAt: at, rows: deduped }
  batches = [...batches, batch]
  return { batch: { ...batch, rows: [...batch.rows] }, replaced: false, added: deduped.length, updated: 0 }
}

export const getStagedBatches = () => batches.map((b) => ({ ...b, rows: [...b.rows] }))

// Reset the session store (test hook + demo reset).
export function clearBatches() {
  batches = []
  nextId = 1
}
