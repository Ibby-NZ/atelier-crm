// The Dynamics pricing parameters as the Pricing screen shows them — the
// per-range figures Atelier prices with today, read live from atelier-api's
// GET /admin/freight/parameters. Read-only: the endpoint mirrors the client's
// own parameter export, and nothing here writes.
//
// This replaced the demo Pricing Engine (src/data/pricing.js), whose every
// figure was invented: 8% freight where freight is DOLLARS per unit on every
// real range, 7% duty where no range carries it, and markups by product type
// where the office marks up by house. The client read those as our numbers.
// What is on screen now is what their system holds, or a dash.
//
// Pure — there is no jsdom here, so every decision a cell makes lives in this
// file and is tested from ./pricingParameters.test.js. The formatting shared
// with the Price Lists join (pctText, the range key) lives in ./priceLists.js.

import { DASH, numberOrNull, pctText } from './priceLists.js'

export const PARAMETERS_PATH = '/admin/freight/parameters?limit=200'

/** The group label for ranges whose export names no invoicing entity — Atelier's own lines. */
export const NO_SUPPLIER = 'No supplier stated'

/** Dollars per the range's unit. A blank freight is UNKNOWN in the export, never free, and says so. */
export const freightText = (value) => {
  const n = numberOrNull(value)
  return n == null ? 'unknown' : `$${n.toFixed(2)}`
}

/** The three duty bands side by side — "A 5% · B 5% · C 10%"; a band the range leaves blank is a dash. */
export const dutyText = (p) =>
  ['a', 'b', 'c']
    .map((band) => `${band.toUpperCase()} ${pctText(p?.[`duty_rate_${band}`])}`)
    .join(' · ')

/** The surcharge and the quantity that avoids it, or a dash when the range states neither. */
export const surchargeText = (p) => {
  const per = numberOrNull(p?.surcharge_per_unit)
  const min = numberOrNull(p?.min_qty_to_avoid_surcharge)
  if (per == null && min == null) return DASH
  const amount = per == null ? DASH : `$${per.toFixed(2)}`
  return min == null ? amount : `${amount} under ${min}`
}

/**
 * Why a discount cell is dimmed. A blank discount in the export is a real 0%
 * (every such range's rows show export = wholesale), so the figure is right;
 * the note says it was never stated rather than typed.
 */
export const discountNote = (p) =>
  p?.discount_stated ? null : 'Blank in Dynamics — every such range prices at 0%.'

const supplierOf = (p) => (typeof p?.supplier === 'string' ? p.supplier.trim() : '')

// Entities alphabetically, the blank one last.
const blankLast = (a, b) => {
  if (a === '') return 1
  if (b === '') return -1
  return a.localeCompare(b)
}

/**
 * The parameter rows grouped under the invoicing entity that bills them, in
 * the order the office reads a supplier list: by entity, then by range.
 */
export const groupBySupplier = (parameters = []) => {
  const groups = new Map()
  for (const p of parameters) {
    const supplier = supplierOf(p)
    if (!groups.has(supplier)) groups.set(supplier, [])
    groups.get(supplier).push(p)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => blankLast(a, b))
    .map(([supplier, ranges]) => ({
      supplier: supplier || NO_SUPPLIER,
      ranges: [...ranges].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))),
    }))
}
