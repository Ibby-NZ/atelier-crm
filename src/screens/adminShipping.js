// Pure logic for AdminShipping (Orders → Freight rates), the screen over
// atelier-api's /admin/shipping-rates.
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Anything
// with a rule in it lives here and is tested directly (see ./adminShipping.js's
// sibling test), the same split adminCatalogue.js makes for the three catalogue
// screens.
//
// Four rules, each with a wrong answer that fails quietly:
//
//   · **A tier is identified by its zone AND its floor, never by the floor
//     alone.** Every zone has a tier at 0, and two zones may both have one at
//     20, so "Delete “from 20 items”?" is a question three zones can answer.
//     Same family as describeCollection's house prefix.
//   · **The lowest tier in a zone also catches quantities BELOW its own floor.**
//     getShippingQuote picks the highest floor <= qty and falls back to the
//     lowest tier when qty sits under every floor, so a zone whose lowest floor
//     is 5 still quotes that tier for a single item. A band reading "5 to under
//     20" would describe a gap that does not exist.
//   · **The endpoint does not page**, so the limit sits above any plausible row
//     count. `/admin/shipping-rates` returns every tier with no `meta` (readList
//     falls back to the row count) and declares no querystring schema at all;
//     the kit's default 25 would report a second page that could never be
//     fetched.
//   · **A blank rate is not a clear.** `rate_cents` is required on the PATCH
//     (it is the only editable column, so the API asks for it by name rather
//     than through minProperties), and the column is NOT NULL — an empty box
//     has to be refused here rather than sent as null.

import { parseDollars } from '../admin/drafts.js'

// Three zones with two tiers each today. Above any plausible tier count, so
// `totalPages` stays 1 over an endpoint that cannot serve a second page.
export const SHIPPING_LIST_LIMIT = 500

/**
 * A quantity floor as staff typed it. `threshold_qty` is numeric(12,2), so pg
 * hands back '20.00' and the mapper coerces it to 20 — this drops the decimal
 * tail again for display without hiding a genuine fraction.
 *
 * @param {number|string} qty
 * @returns {string}
 */
export function formatQty(qty) {
  const value = Number(qty)
  if (!Number.isFinite(value)) return '—'
  return String(Number(value.toFixed(2)))
}

/**
 * How a tier is named to a person — the delete dialog's title, its toast, and
 * anywhere one row has to be told from another.
 *
 * The zone is part of the name because a floor is unique per zone and not
 * globally: every zone starts at 0 and this screen lists all of them at once.
 * Returns undefined for a zone-less row so useCrudScreen falls back to "That
 * freight tier".
 *
 * @param {{ zone?: string, threshold_qty?: number|string }} [rate]
 * @returns {string|undefined}
 */
export function describeShippingRate(rate) {
  const zone = typeof rate?.zone === 'string' ? rate.zone.trim() : ''
  if (zone === '') return undefined
  return `${zone} (from ${formatQty(rate?.threshold_qty)} items)`
}

/**
 * The quantity band a tier actually covers, given every tier in its zone
 * sorted by floor ascending.
 *
 * @param {number} index
 * @param {ReadonlyArray<{ threshold_qty?: number|string }>} tiers
 * @returns {string}
 */
function bandLabel(index, tiers) {
  if (tiers.length <= 1) return 'any quantity'
  const own = formatQty(tiers[index]?.threshold_qty)
  if (index === tiers.length - 1) return `${own} items or more`
  const next = formatQty(tiers[index + 1]?.threshold_qty)
  // The lowest tier is the quote's fallback for anything under every floor, so
  // it is described by its ceiling alone — its own floor is not a lower bound.
  if (index === 0) return `under ${next} items`
  return `${own} to under ${next} items`
}

/**
 * Annotate each tier with the band it covers and whether it is the only tier
 * in its zone. Returns new objects; the input is untouched.
 *
 * `sole` is the advance warning that Delete will be refused — the last tier for
 * a zone is a 409 from the API's registry guard, because a zone with no tiers
 * makes every checkout in it fail. It is derived from the list already on
 * screen, so it costs no second request (the kit forbids a pre-flight
 * "can I delete this" GET, and this is not one).
 *
 * @param {ReadonlyArray<object>} [rates]
 * @returns {Array<object>} each rate plus `band` and `sole`
 */
export function annotateTiers(rates = []) {
  const zones = new Map()
  for (const rate of rates) {
    const zone = rate?.zone ?? ''
    zones.set(zone, [...(zones.get(zone) ?? []), rate])
  }

  const annotated = new Map()
  for (const tiers of zones.values()) {
    const sorted = [...tiers].sort(
      (left, right) => Number(left?.threshold_qty) - Number(right?.threshold_qty)
    )
    sorted.forEach((rate, index) => {
      annotated.set(rate, { ...rate, band: bandLabel(index, sorted), sole: sorted.length === 1 })
    })
  }

  return rates.map((rate) => annotated.get(rate) ?? { ...rate, band: 'any quantity', sole: true })
}

/**
 * The zones that exist, in the order the API listed them. Backs the create
 * form's suggestion list — a zone is not a table of its own, it comes into
 * existence with its first tier, so the only way to show the current set is to
 * read it off the tiers.
 *
 * @param {ReadonlyArray<{ zone?: string }>} [rates]
 * @returns {string[]}
 */
export function zonesOf(rates = []) {
  const seen = []
  for (const rate of rates) {
    const zone = typeof rate?.zone === 'string' ? rate.zone.trim() : ''
    if (zone !== '' && !seen.includes(zone)) seen.push(zone)
  }
  return seen
}

/**
 * Turn the row's rate box into a PATCH body.
 *
 * An empty patch means "nothing changed" — the screen flashes rather than
 * sending it, the same rule diffFields carries for the multi-column forms.
 *
 * @param {{ rate_cents?: number|string }} rate  the row as the API last returned it
 * @param {string} text  the draft box
 * @returns {{ patch: object }|{ error: string }}
 */
export function ratePatch(rate, text) {
  const parsed = parseDollars(text)
  if (!parsed.ok) return { error: 'the rate must be an amount in dollars, e.g. 12.50.' }
  if (parsed.value == null) {
    // Not a clear: rate_cents is NOT NULL and the PATCH requires it by name.
    return { error: 'a tier needs a rate — clear it and the zone could not quote.' }
  }
  if (parsed.value === Number(rate?.rate_cents)) return { patch: {} }
  return { patch: { rate_cents: parsed.value } }
}

/**
 * The one create-time rule the API answers less readably than it could: its
 * schema `minimum: 0` produces "body/threshold_qty must be >= 0". Everything
 * else — a missing field, a mistyped amount, a duplicate (zone, floor) — is
 * either caught by bodyFrom or phrased well by the API, and a duplicate is
 * deliberately NOT pre-checked (the database detects it; a check here would
 * race the insert).
 *
 * @param {{ threshold_qty?: number }} [body]
 * @returns {string|null}
 */
export function tierProblem(body) {
  const qty = Number(body?.threshold_qty)
  if (!Number.isFinite(qty) || qty < 0) return 'Quantity from must be 0 or more.'
  return null
}
