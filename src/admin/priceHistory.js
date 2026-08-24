// Price-history reads — the pure half of the history panels on Products and
// Supplier rates, and of the as-at rate lookup. No DOM, no fetch: everything
// here is a path, a predicate or a formatter, tested in ./priceHistory.test.js.
//
// Three endpoints, two postures:
//
//   GET /admin/products/:id/price-history         → { changes }
//       No finance gate: retail and trade are SELL figures — money, not cost.
//   GET /admin/price-list-items/:id/price-history → { changes }
//   GET /admin/price-list-items/:id/rate?as_at=…  → { rate }
//       Both FINANCE-GATED: a wholesale rate is Atelier's buy side, and a run
//       of them is the margin. A login without finance visibility gets a 403
//       whose message says what was needed and why ("… needs finance access.
//       Ask a director."); the screen renders that sentence as the standard
//       masked note — muted, not an error — the same treatment the report
//       library gives a masked table. `isDenied` is the discriminator.
//
// The as-at lookup is the reason the whole epic exists: "what were we paying
// for this on 1 June 2023?" — the office goes back to a superseded price 50 to
// 100 times a year and used to encode the year in the item code to keep one
// reachable. A miss is a 404 whose message names WHICH kind of miss it is (the
// rate has never moved, or the ledger only starts later), so a 404 here is an
// ANSWER to show, never a fault.

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Every recorded price change for one product, newest first. */
export const productHistoryPath = (id) => `/admin/products/${id}/price-history`

/** Every recorded rate change for one price-list item, newest first. */
export const rateHistoryPath = (id) => `/admin/price-list-items/${id}/price-history`

/**
 * The as-at lookup's path, or the sentence to show instead of sending it.
 * `as_at` is required by the querystring schema and pattern-checked
 * (YYYY-MM-DD — Fastify's Ajv has no `format` keywords), so a malformed date
 * would 400 with a schema message; the two mistakes a person can make are
 * caught here in their own words first.
 *
 * @param {number} id price_list_items.id
 * @param {string} value what the date input holds
 * @returns {{path: string}|{error: string}}
 */
export function asAtLookup(id, value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed === '') return { error: 'Choose a date to look up first.' }
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return { error: 'The as-at date must be a full date, e.g. 2023-06-01.' }
  }
  return { path: `/admin/price-list-items/${id}/rate?as_at=${trimmed}` }
}

/**
 * The finance gate's refusal, as distinct from a fault. A 403 carries the
 * API's own sentence about what was needed; everything else is an error line.
 *
 * @param {{status?: number}|null} [error] an ApiError
 * @returns {boolean}
 */
export const isDenied = (error) => error?.status === 403

/**
 * A timestamp as the local calendar day, YYYY-MM-DD. `changed_at` is a
 * timestamptz serialised in UTC, so slicing the ISO string would show the UTC
 * day — a NZ afternoon's change dated tomorrow, or last night's dated
 * yesterday morning. Local components are what a person in the office means by
 * "the day it changed" (the toNaiveInput reasoning in ./drafts.js: one office,
 * one timezone).
 *
 * `date_effective` never comes through here: the API already casts it to text
 * in SQL precisely so it stays the calendar day the supplier printed.
 *
 * @param {string|Date|null|undefined} value
 * @returns {string} '' when there is nothing to show
 */
export function dayOf(value) {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Where a change came from, as one phrase: the file for an import, the person
 * for a manual edit. Both can be absent (an old row, a deleted login) and the
 * bare source still reads.
 *
 * @param {{source?: string, source_file?: string|null, changed_by_name?: string|null}} [change]
 * @returns {string}
 */
export function sourceLabel(change = {}) {
  if (change.source === 'import') {
    return change.source_file ? `Import — ${change.source_file}` : 'Import'
  }
  if (change.source === 'manual') {
    return change.changed_by_name ? `Manual — ${change.changed_by_name}` : 'Manual'
  }
  return change.source ?? '—'
}

/**
 * A rate move as one figure-to-figure phrase: '58.5 → 60 EUR'. The history row
 * carries one currency (the row's own), so it is stated once.
 *
 * @param {{old_rate?: number, new_rate?: number, currency?: string}} [change]
 * @returns {string}
 */
export function rateMove(change = {}) {
  const currency = change.currency ? ` ${change.currency}` : ''
  return `${change.old_rate ?? '—'} → ${change.new_rate ?? '—'}${currency}`
}

const dollars = (cents) => (cents == null ? '—' : (Number(cents) / 100).toFixed(2))

/**
 * One product price's movement on one history row. Both prices ride on every
 * row — a row showing one figure in isolation cannot say whether the other
 * moved with it — so the screen renders both and this says which one to draw
 * as the change: `moved` false means "rode along unchanged".
 *
 * @param {number|null|undefined} oldCents
 * @param {number|null|undefined} newCents
 * @returns {{text: string, moved: boolean}}
 */
export function priceMoveText(oldCents, newCents) {
  const before = oldCents ?? null
  const after = newCents ?? null
  if (before === after) {
    return { text: dollars(after), moved: false }
  }
  return { text: `${dollars(before)} → ${dollars(after)}`, moved: true }
}
