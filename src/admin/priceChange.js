// The mandatory note on a manual price change — the CRM half of the API's
// price-history rule (W17).
//
// The API now refuses any PATCH that MOVES a price without a `reason`:
// `requireChangeReason` in atelier-api's src/pricing/price-history.js answers
// 422, called from `updateProduct` (retail/trade cents) and
// `updatePriceListItem` (wholesale_rate) so the rule holds for every caller.
// `reason` is NOT a column — it rides beside the patch, is declared to the
// capture trigger as transaction-local change context, and is recorded against
// the old and new figure in the price-history ledger. Both PATCH schemas list
// it explicitly, or Ajv's removeAdditional would strip it silently.
//
// Until this module existed the CRM sent no reason at all, so every price edit
// failed with a 422 the screen offered no way to resolve. The two rules it
// mirrors, exactly as the API states them:
//
//   - A patch that RESTATES a price is not a change and needs nothing.
//     diffFields already drops an unmoved field, so "the patch carries the
//     key" and "the price moved" are the same statement here — which is why
//     these helpers read the PATCH, never the draft.
//   - A patch that MOVES one demands a non-blank reason. Checked here so the
//     office reads one sentence inline instead of a 422 round trip; the API
//     stays the real gate.

import { diffFields } from './drafts.js'

/** The two product prices — mirrors PRICE_COLUMNS in atelier-api's admin-products.js. */
export const PRODUCT_PRICE_KEYS = Object.freeze(['retail_price_cents', 'trade_price_cents'])

/** The one rate column a supplier-rates patch can move. */
export const RATE_PRICE_KEYS = Object.freeze(['wholesale_rate'])

/**
 * Longest reason the API accepts (MAX_REASON_LENGTH in price-history.js — the
 * PATCH schemas bound `reason` at this). Sliced rather than refused: a note two
 * words too long is still a note, and the API's own requireChangeReason slices
 * the same way.
 */
export const REASON_MAX_LENGTH = 500

// Phrased like the API's own 422 so the pre-check and the backstop read as one
// rule, not two opinions.
export const NEEDS_REASON =
  'A price change needs a short reason — "supplier increase", "exchange rate", ' +
  'whatever it actually was. It is recorded against the old and new price in ' +
  'the price history.'

/**
 * Does this patch move a price? True exactly when the API will demand a reason:
 * diffFields only includes changed keys, so presence is movement.
 *
 * @param {object} patch  the diffFields output
 * @param {ReadonlyArray<string>} keys  one of the *_PRICE_KEYS sets above
 * @returns {boolean}
 */
export function priceMoved(patch = {}, keys = []) {
  return keys.some((key) => Object.hasOwn(patch, key))
}

/**
 * Is a price being changed in this draft? Decides whether the reason box shows
 * at all: it appears the moment a price differs from the saved figure and goes
 * again if the office puts it back. Only the price fields are diffed, so an
 * unrelated bad field cannot hide it, and a price that does not parse yet (mid
 * typing) still counts — the office is plainly changing it.
 *
 * @param {object} record  the row as the API last returned it
 * @param {object} draft   the form state
 * @param {ReadonlyArray<{key: string}>} fields  the EDITABLE fields — a locked price never counts
 * @param {ReadonlyArray<string>} keys  one of the *_PRICE_KEYS sets above
 * @returns {boolean}
 */
export function priceEdited(record = {}, draft = {}, fields = [], keys = []) {
  const diff = diffFields(record, draft, fields.filter((field) => keys.includes(field.key)))
  return Boolean(diff.error) || priceMoved(diff.patch, keys)
}

/**
 * Attach the change reason to a patch that needs one.
 *
 * A patch that moves no price is returned untouched — sending a reason beside
 * an unmoved price would be harmless, but attaching it only when it is recorded
 * keeps "this save wrote history" legible in the request itself.
 *
 * @param {object} patch  the diffFields output
 * @param {string} reason  what the office typed, untrimmed
 * @param {ReadonlyArray<string>} keys  one of the *_PRICE_KEYS sets above
 * @returns {{patch: object}|{error: string}}
 */
export function withReason(patch = {}, reason = '', keys = []) {
  if (!priceMoved(patch, keys)) return { patch }
  const trimmed = typeof reason === 'string' ? reason.trim() : ''
  if (trimmed === '') return { error: NEEDS_REASON }
  return { patch: { ...patch, reason: trimmed.slice(0, REASON_MAX_LENGTH) } }
}

const dollars = (cents) => `$${(Number(cents) / 100).toFixed(2)}`

/**
 * The save message for a product patch, from the API's `repricing` — what a
 * new wholesale rate did to the sell prices (atelier-api src/pricing/
 * product-reprice.js, Sept 2026): recalculated through the range, or kept and
 * why. A save that changed no wholesale rate carries none and reads as before.
 *
 * @param {{ product?: { repricing?: object, trade_price_cents?: number|null, retail_price_cents?: number|null } }} result
 */
export function productSavedNote(result) {
  const product = result?.product
  const repricing = product?.repricing
  if (!repricing) return 'Product saved.'
  if (!repricing.repriced) return `Product saved. The prices were not recalculated: ${repricing.reason}.`
  const parts = [
    product.trade_price_cents != null ? `trade ${dollars(product.trade_price_cents)}` : null,
    product.retail_price_cents != null ? `retail ${dollars(product.retail_price_cents)}` : null,
  ].filter(Boolean)
  return `Product saved. Recalculated from the new wholesale rate${parts.length ? `: ${parts.join(', ')}` : ''}.`
}
