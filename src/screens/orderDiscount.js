// The order discount control's rules (Rebecca-R2) — pure, tested in
// ./orderDiscount.test.js, because this repo has no jsdom (the adminOrders.js
// split).
//
// It mirrors atelier-api's src/orders/discounts.js exactly, and like every
// mirror in this repo it is a DRAWING decision, not access control: the API's
// in-handler role check is the real gate, and a wrong guess here surfaces as
// the API's own 403 in the error line. Duplicating the rule is so a
// back-office user is never handed a Custom option the server would refuse —
// the orderFlow.js posture.
//
// Three rules worth writing down:
//
//   · **0, 5 and 10 are the standard tiers; everything else is a director
//     override and needs a reason.** The tiers are re-typed here (they cannot
//     be imported across repos); test/orderDiscount.test.js pins them to the
//     API's trio so a drift fails loudly.
//   · **An untouched draft must build a null patch BEFORE the director check
//     runs.** The draft is seeded from the open order, so on an order that
//     already carries a director's override the seeded mode is 'custom' — and
//     a back-office user saving an ordinary line edit must not be refused for
//     a discount they never touched.
//   · **The discount amount is DERIVED from the server's three money figures**
//     (subtotal + shipping − total), never recomputed from the pct — the API
//     owns the rounding, and a second formula here is how the printed amount
//     disagrees with the total beside it by one cent.

import { toNumber } from '../admin/drafts.js'

/** The tiers any back-office user may set — atelier-api's STANDARD_DISCOUNT_TIERS. */
export const STANDARD_DISCOUNT_TIERS = Object.freeze([0, 5, 10])

/** @param {number|string} pct pg numeric arrives as a string ('5.00') */
export const isStandardDiscount = (pct) =>
  STANDARD_DISCOUNT_TIERS.includes(Number(pct))

/**
 * The select's options, in the shape the screen renders. 'custom' is the
 * director-only door; the screen disables it (with DIRECTORS_ONLY_NOTE) for
 * everyone else.
 */
export const DISCOUNT_OPTIONS = Object.freeze([
  { value: '0', label: 'None' },
  { value: '5', label: '5%' },
  { value: '10', label: '10%' },
  { value: 'custom', label: 'Custom…' },
])

/** Why Custom is greyed out for a back-office login. */
export const DIRECTORS_ONLY_NOTE =
  'Directors only — the back office may apply the standard 5% and 10% tiers.'

/** Said under the custom fields, so the required reason is not a surprise 422. */
export const CUSTOM_DISCOUNT_HINT =
  'A custom discount always records who applied it and why.'

/** The control's cleared state. */
export const EMPTY_DISCOUNT_DRAFT = Object.freeze({ mode: '0', pct: '', reason: '' })

/**
 * Seed the control from the open order. A standard tier with no reason shows
 * as its own option; anything else — a non-standard pct, or a standard one a
 * director chose to justify — shows as Custom with the stored values, so what
 * is on the order is exactly what the boxes hold.
 *
 * @param {{ discount_pct?: number|string|null, discount_reason?: string|null }} [order]
 * @returns {{ mode: string, pct: string, reason: string }}
 */
export function discountDraftFrom(order = {}) {
  const pct = toNumber(order.discount_pct)
  if (isStandardDiscount(pct) && !order.discount_reason) {
    return { mode: String(pct), pct: '', reason: '' }
  }
  return { mode: 'custom', pct: String(pct), reason: order.discount_reason ?? '' }
}

/**
 * The discount keys for the save PATCH — or null when the control was not
 * touched, so an ordinary line edit never re-sends (and never re-stamps) a
 * discount. Standard tiers send the pct alone: the API clears the stored
 * reason when none travels with it, which is the pair rule this mirrors.
 *
 * The director refusal is LAST, after the null-patch return — see the module
 * header. Its message mirrors the API's 403 so the two read as one rule.
 *
 * @param {{ discount_pct?: number|string|null, discount_reason?: string|null }} order
 * @param {{ mode: string, pct: string, reason: string }} draft
 * @param {{ director?: boolean }} [who]
 * @returns {{ok: true, patch: object|null}|{ok: false, error: string}}
 */
export function buildDiscountPatch(order = {}, draft = EMPTY_DISCOUNT_DRAFT, { director = false } = {}) {
  const currentPct = toNumber(order.discount_pct)
  const currentReason = (order.discount_reason ?? '').trim()

  if (draft.mode !== 'custom') {
    const pct = Number(draft.mode)
    // Same pct and nothing stored to clear → the control was not touched.
    if (pct === currentPct && currentReason === '') return { ok: true, patch: null }
    return { ok: true, patch: { discount_pct: pct } }
  }

  const pctText = String(draft.pct ?? '').trim()
  if (pctText === '') return { ok: false, error: 'Custom discount: a percentage is required.' }
  const pct = Number(pctText)
  if (!Number.isFinite(pct)) {
    return { ok: false, error: 'Custom discount: the percentage must be a number.' }
  }
  if (pct <= 0 || pct > 100) {
    // 0 is not a custom discount, it is None — offering it here would store a
    // reason justifying nothing.
    return { ok: false, error: 'Custom discount: use a percentage above 0 and at most 100, or choose None.' }
  }
  const reason = String(draft.reason ?? '').trim()
  if (reason === '') {
    return { ok: false, error: 'Custom discount: a reason is required.' }
  }

  if (pct === currentPct && reason === currentReason) return { ok: true, patch: null }

  if (!director) {
    // The API's own 403, said before the round trip. The server stays the gate.
    return {
      ok: false,
      error: 'Only a director may apply a discount outside the standard 0%, 5% and 10% tiers.',
    }
  }
  return { ok: true, patch: { discount_pct: pct, discount_reason: reason } }
}

/** @param {{ discount_pct?: number|string|null }} [order] */
export function hasDiscount(order = {}) {
  return toNumber(order.discount_pct) > 0
}

/**
 * What the discount took off, in cents, DERIVED from the server's own three
 * figures — the API rounds once over the whole subtotal, and re-running its
 * formula here is how a printed amount drifts a cent from the total beside it.
 *
 * @param {{ subtotal_cents?: number, shipping_cents?: number, total_cents?: number }} [order]
 * @returns {number}
 */
export function discountAmountCents(order = {}) {
  return (
    toNumber(order.subtotal_cents) + toNumber(order.shipping_cents) - toNumber(order.total_cents)
  )
}

/**
 * '7.50' → '7.5%' — the pg-numeric string, without its trailing noise.
 * @param {number|string|null|undefined} pct
 */
export function formatDiscountPct(pct) {
  return `${toNumber(pct)}%`
}

/**
 * Who authorised the discount, or '' when there is nothing to attribute. The
 * admin shape carries the staff account id only (the API stamps it from the
 * session), so the id is what there is to print.
 *
 * @param {{ discount_pct?: number|string|null, discount_applied_by?: number|null }} [order]
 * @returns {string}
 */
export function discountAppliedBy(order = {}) {
  if (!hasDiscount(order) || order.discount_applied_by == null) return ''
  return `Applied by staff account #${order.discount_applied_by}`
}
