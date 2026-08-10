// The rules behind AdminSuppliers, kept out of the .jsx so they can be tested.
// This repo has no jsdom, so a component cannot be rendered — the house pattern
// is a plain .js beside the screen (see clientAccounts.js) holding everything
// that is a decision rather than a layout.
//
// Three of those decisions are worth naming here, because getting one wrong is
// not a cosmetic bug:
//
//   - **A discount chain is MULTIPLICATIVE.** `{0.4, 0.4}` is ×0.36 — 40% off,
//     then 40% off the result — NOT −80%. The API resolves it (its
//     discount-chain.js is the only evaluator) and hands over `net_multiplier`;
//     this module only formats what it was given, and never sums a chain.
//   - **Masking is per VALUE, not per row.** A term that states the METHOD
//     without quoting a rate ("3 discount tiers", "no per-brand terms") is safe
//     for a login without FINANCE_VIEW; the rate itself is not. `rateFree`
//     carries that distinction, and a note that quotes its rate in prose gets a
//     masked twin — dropping the number would leave the sentence lying.
//   - **A supplier is never hard-deleted while a house points at it.**
//     `brands.supplier_id` is RESTRICT, so archive is the verb that always
//     works; `archiveVerb` is what the row's button and the blocked dialog's
//     "Archive instead" both read.

export const SUPPLIERS_PATH = '/admin/suppliers'

/** `/admin/suppliers/12`. One place, so a typo is a failing test not a 404. */
export const supplierPath = (id) => `${SUPPLIERS_PATH}/${id}`

/**
 * Which lifecycle verb a row offers. An archived supplier offers `restore`; a
 * live one offers `archive`. Both are POSTs to the same path shape.
 *
 * @param {{ archived_at?: string|null }} supplier
 * @returns {'archive'|'restore'}
 */
export const archiveVerb = (supplier) =>
  supplier?.archived_at ? 'restore' : 'archive'

/** The endpoint that verb posts to. */
export const archivePath = (supplier) =>
  `${supplierPath(supplier?.id)}/${archiveVerb(supplier)}`

// Mirrors SUPPLIER_UPDATE_COLUMNS in atelier-api's src/suppliers/admin-suppliers.js
// — the frozen whitelist a PATCH may write. A key absent there is stripped by
// Ajv's removeAdditional before the handler sees it, so a field declared here
// and not there would silently save nothing.
//
// `slug` is deliberately not among them: it is server-generated on create and is
// NOT recomputed on rename, because it is the stable key the backfill and any
// later import address a supplier by.
export const SUPPLIER_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'short_code', label: 'Short code', kind: 'text' },
  { key: 'd365_token', label: 'D365 token', kind: 'text' },
  { key: 'country', label: 'Country', kind: 'text' },
  { key: 'currency', label: 'Invoicing currency', kind: 'upper' },
  { key: 'agent', label: 'Agent', kind: 'text' },
  { key: 'incoterm', label: 'Incoterm', kind: 'text' },
  { key: 'po_email', label: 'PO email', kind: 'text' },
  { key: 'discount_method', label: 'Discount method', kind: 'enum' },
])

// Mirrors `suppliers_discount_method_check` via the route's DISCOUNT_METHOD_ENUM.
// A value outside it is a 400, so the form offers exactly these two and a blank
// (the column is nullable — "not decided yet" is a real answer).
export const DISCOUNT_METHODS = Object.freeze(['averaged', 'per-brand'])

export const NEW_SUPPLIER = Object.freeze({
  name: '',
  short_code: '',
  d365_token: '',
  country: '',
  currency: '',
  agent: '',
  incoterm: '',
  po_email: '',
  discount_method: '',
})

/**
 * The list filters, in the shape buildListQuery expects. `include_archived` is
 * passed as `flag || null` so it VANISHES when off rather than serialising as
 * `include_archived=false` — the documented way a boolean filter opts out.
 *
 * @param {{ term?: string, showArchived?: boolean }} [state]
 * @returns {{ q: string, include_archived: true|null }}
 */
export function supplierFilters({ term = '', showArchived = false } = {}) {
  return { q: term, include_archived: showArchived || null }
}

/** '40%' from 0.4. Rates are stored as fractions; nobody reads 0.4 as a discount. */
export const pctText = (rate) =>
  rate == null || !Number.isFinite(Number(rate)) ? '—' : `${Math.round(Number(rate) * 100)}%`

/** '×0.36' from 0.36 — the net multiplier, never a summed percentage. */
export const netText = (multiplier) =>
  multiplier == null || !Number.isFinite(Number(multiplier))
    ? '—'
    : `×${Number(multiplier).toFixed(2)}`

/** '40% then 40%' — the chain as written, each rate on its own. */
export const chainText = (chain) =>
  (Array.isArray(chain) ? chain : []).map(pctText).join(' then ')

/**
 * One line of supplier identity for the row's second line: what it invoices in
 * and how it is rated. Neither is a rate, so both survive the mask.
 *
 * @param {object} supplier
 * @returns {string}
 */
export function supplierMeta(supplier = {}) {
  const parts = [supplier.country, supplier.currency, supplier.discount_method]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No commercial details on file'
}

/**
 * How one house's terms read on screen.
 *
 * Returns `{ value, note, maskedNote, rateFree, invalid }`:
 *   - `value` is the headline. When `rateFree` is false it quotes a rate and the
 *     screen renders <MaskedFigure /> in its place for a login without
 *     FINANCE_VIEW.
 *   - `maskedNote` replaces `note` for that login wherever the note itself
 *     quotes the rate (the chain's "×0.36 net" is the only such case today).
 *   - `invalid` marks a row the API could not evaluate — a `discount_chain`
 *     element outside [0, 1), which no CHECK can catch because a constraint
 *     cannot hold a subquery. The API reports it on the row rather than failing
 *     the whole supplier read, and the screen badges it.
 *
 * Precedence mirrors the API's resolveTermsChain: chain, then tiers, then the
 * flat rate, then the markup.
 *
 * @param {object|null} terms  a supplier_brand_terms row as the API returns it
 * @returns {{ value: string, note: string, maskedNote: string|null,
 *   rateFree: boolean, invalid: boolean }}
 */
export function termsSummary(terms) {
  const plain = (value, note, rateFree = false, maskedNote = null) => ({
    value,
    note,
    maskedNote,
    rateFree,
    invalid: false,
  })

  if (!terms) {
    // The normal state for an `averaged` supplier: one net rate on the supplier,
    // nothing per house.
    return plain('Supplier default', 'No per-brand terms recorded', true)
  }
  if (terms.invalid_reason) {
    return {
      value: 'Terms need review',
      note: terms.invalid_reason,
      maskedNote: 'A recorded rate is out of range — ask finance to check it.',
      rateFree: true,
      invalid: true,
    }
  }

  const chain = Array.isArray(terms.discount_chain) ? terms.discount_chain : []
  if (chain.length > 0) {
    return plain(
      chainText(chain),
      `Compounded — ${netText(terms.net_multiplier)} net`,
      false,
      'Compounded chain — sequential rates, not a single discount'
    )
  }

  const tiers = Array.isArray(terms.tiers) ? terms.tiers : []
  if (tiers.length > 0) {
    // A count is not a rate, so it survives the mask; the tier rates below it
    // do not.
    return plain(
      `${tiers.length} discount tier${tiers.length === 1 ? '' : 's'}`,
      'Tier by collection or category — see below',
      true
    )
  }

  if (terms.discount != null) {
    return plain(`−${pctText(terms.discount)}`, 'Flat per-brand discount')
  }
  if (terms.markup != null) {
    return plain(`×${terms.markup}`, 'Per-brand retail markup')
  }
  return plain('No rate recorded', 'Terms row exists but carries no rate', true)
}

/** A tier's label with the fallback one named for what it is. */
export const tierLabel = (tier) =>
  tier?.is_fallback ? `${tier.label} (fallback)` : (tier?.label ?? '')
