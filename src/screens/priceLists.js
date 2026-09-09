// The two figures the Price Lists mirror DERIVES rather than prints, kept out of
// the .jsx so they can be tested — there is no jsdom in this repo, so a screen
// cannot be rendered (the split ./adminPurchaseOrders.js and ./adminShipping.js
// already make).
//
// **`../admin/drafts.js`'s `toNumber` cannot be used here.** It answers 0 for
// null, which is the right default for a form draft and the wrong one for a
// figure read off a staging row: every one of these columns is nullable, and a
// markup printed as "0.0%" is a statement about the row rather than the absence
// of one. `numberOrNull` is the null-preserving twin.
//
// **The markup is client-side because nothing stores it.** The live
// `price_list_items` side is buy-side only (no fx, duty, freight, handling), so
// there is no stored per-item markup to read; the D365 mirror row is the one
// place that carries both ends of the waterfall — `landed_cost_nz` and
// `trade_sell_price_nz` — so the office's "how much room do we have on
// discounts" is answered here, from the row already on screen. It is derived,
// never sent back: these screens are GET-only until cutover.
//
// The five columns this module reads reach the CRM only once atelier-api's
// `prices` read projection carries them. A CRM deployed ahead of that API sees
// them ABSENT, which must read exactly like a blank cell — an em dash, never a
// crash and never a zero.

export const DASH = '—'

/**
 * A pg `numeric` (which arrives as a string, `'0.450000'`) as a finite number,
 * or null for absent, blank or unparseable. Null is preserved, never defaulted.
 */
export const numberOrNull = (value) => {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// `price_exchange_rate` is the rate actually struck on the row and is the
// authoritative one; `exchange_rate` is D365's annual planning rate and stands
// in where the row carries no struck rate (atelier-api docs/d365-export-analysis.md,
// A9 — the two agree on all but 14 of the 19,327 rows).
export const fxRate = (row) =>
  numberOrNull(row?.price_exchange_rate) ?? numberOrNull(row?.exchange_rate)

export const fxText = (row) => {
  const rate = fxRate(row)
  return rate == null ? DASH : rate.toFixed(4)
}

/**
 * Trade markup over landed cost, as a percentage, or null where it cannot be
 * stated. A ZERO landed cost is the case that matters: D365 carries rows that
 * were never costed, and dividing by one yields Infinity, which prints as a
 * spectacular markup rather than as the missing figure it is. A negative result
 * is kept — a house selling under landed cost is a real, and useful, answer.
 */
export const markupPct = (row) => {
  const cost = numberOrNull(row?.landed_cost_nz)
  const sell = numberOrNull(row?.trade_sell_price_nz)
  if (cost == null || cost === 0 || sell == null) return null
  return (sell / cost - 1) * 100
}

export const markupText = (row) => {
  const pct = markupPct(row)
  return pct == null ? DASH : `${pct.toFixed(1)}%`
}

// --- Percentages, and the range parameters beside each line ------------------

/**
 * A percentage as the export states it: whole numbers whole (85%), the rest as
 * given (2.5%). Absent is a dash, never 0%.
 */
export const pctText = (value) => {
  const n = numberOrNull(value)
  if (n == null) return DASH
  return `${Number.isInteger(n) ? n : Number(n.toFixed(3))}%`
}

// The supplier discount and the trade markup a line is priced with are RANGE
// parameters in Dynamics (GET /admin/freight/parameters), not columns on the
// price row, so they are joined here by range name — the key 99.6% of priced
// rows carry. The office asked where the Rubelli 25% was: it is here. The
// endpoint is finance-gated, so a login the API refuses gets no cells at all,
// rather than a column of dashes that reads as missing data.

/** The join key: a range name as Dynamics spells it, case- and space-insensitive. */
export const rangeKey = (name) => String(name ?? '').trim().toLowerCase()

/** range key -> parameter row. */
export const indexByRange = (parameters = []) =>
  new Map(parameters.map((p) => [rangeKey(p.name), p]))

/** The parameter row behind one price line, or null where its range has none (BOUSSAC). */
export const parameterFor = (index, row) => index?.get(rangeKey(row?.range_name)) ?? null

export const rangeDiscountText = (parameter) =>
  parameter == null ? DASH : pctText(parameter.discount_percent)

export const rangeMarkupText = (parameter) =>
  parameter == null ? DASH : pctText(parameter.trade_markup_percent)
