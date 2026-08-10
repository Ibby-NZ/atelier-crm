// Pure logic for the live list screens the admin kit reached last: Manage stock,
// Supplier rates, Web orders, and the two account rosters (Clients and
// Users & permissions).
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Anything
// with a rule in it therefore lives here, beside the screens, and is tested
// directly (see ./adminLists.test.js) — the same split adminCatalogue.js and
// adminShipping.js make for the catalogue and freight screens.
//
// Five rules, each of which has a wrong answer that fails quietly:
//
//   · **Only one of these endpoints pages.** /admin/price-list-items takes
//     page/limit and answers with `meta.total`; /admin/inventory, /admin/orders
//     and /admin/users return the whole list with no meta and declare
//     `additionalProperties: false`, so Fastify's Ajv strips the `page`
//     useAdminList sends rather than rejecting it. Left at the kit's default 25
//     those three would advertise a second page that can never be fetched, which
//     is why UNPAGED_LIST_LIMIT sits above any plausible row count.
//   · **An unset filter is null, never the empty string.** buildListQuery drops
//     null/undefined/''; forwarded as '' a status select's "All" would become
//     `status=`, and the endpoint's enum answers that with a 400 that kills the
//     whole list rather than one filter.
//   · **A row's name in the dialog has to identify it across the whole list.** A
//     price-list code is unique per (supplier, category) and never on its own —
//     the identity-key rule that also makes `supplier` create-only — so
//     "Delete “F3518-003”?" is a question forty suppliers can answer. Same family
//     as describeCollection naming its house.
//   · **A stock row has no `id`.** inventory is one row per colourway and every
//     caller addresses it by colourway, so the kit's default delete path
//     (`${path}/${row.id}`) would build `/admin/inventory/undefined`.
//   · **A deleted price-list rate is not gone for good**, so the confirmation
//     must not claim it is. See RATE_DELETE_CAVEAT.

// Above any plausible row count for inventory, web orders or the account
// roster: all three endpoints answer with the whole list, so this exists to keep
// `totalPages` at 1 rather than to page.
export const UNPAGED_LIST_LIMIT = 1000

// Supplier rates is the one genuinely paged list in the CRM — ~19,500 rows
// imported from the supplier templates. Well inside the endpoint's MAX_LIMIT of
// 200, so an over-large limit can never turn into a 400.
export const RATE_LIST_LIMIT = 25

// The API phrases its own refusals; this is the one sentence it cannot deliver
// in time. `DELETE /admin/price-list-items/:id` returns a `warning` on the 200
// saying the next import re-creates the row — but useCrudScreen discards the
// delete's response body, and a caveat that arrives after the deletion is not a
// caveat. It is shown in the confirmation instead.
export const RATE_DELETE_CAVEAT =
  'This removes the rate now, but not for good: the next supplier-file import ' +
  '(npm run import:pricing) re-creates it verbatim. Archive it instead if the ' +
  'removal has to survive a re-import.'

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * Filters for GET /admin/inventory. The endpoint takes a free-text `q` and
 * nothing else.
 *
 * @param {string} [term]
 * @returns {{ q: string|null }}
 */
export function stockListFilters(term = '') {
  return { q: trimmed(term) || null }
}

/**
 * Filters for GET /admin/price-list-items.
 *
 * @param {{ term?: string, supplier?: string, category?: string,
 *   showArchived?: boolean }} [filters]
 * @returns {{ q: string|null, supplier: string|null, category: string|null,
 *   include_archived: boolean|null }}
 */
export function rateListFilters({
  term = '',
  supplier = '',
  category = '',
  showArchived = false,
} = {}) {
  return {
    q: trimmed(term) || null,
    supplier: trimmed(supplier) || null,
    category: category || null,
    include_archived: showArchived || null,
  }
}

/**
 * Filters for GET /admin/orders. `status` comes straight off a <select> whose
 * "All statuses" option is the empty value, and the endpoint's enum would answer
 * `status=` with a 400.
 *
 * @param {string} [status]
 * @param {boolean} [showArchived]
 * @returns {{ status: string|null, include_archived: boolean|null }}
 */
export function orderListFilters(status = '', showArchived = false) {
  return { status: status || null, include_archived: showArchived || null }
}

/**
 * Filters for GET /admin/users on the SUPERSET roster (Users & permissions).
 * Deliberately no `segment`: that is what makes the Clients tab the client half,
 * and this screen is the one place a staff login is seen and created.
 *
 * @param {boolean} [showArchived]
 * @returns {{ include_archived: boolean|null }}
 */
export function userListFilters(showArchived = false) {
  return { include_archived: showArchived || null }
}

/**
 * The delete path for a stock row. Inventory is one row per colourway — the
 * read model returns `colourway_id` and no `id` at all — so the kit's default
 * `${path}/${row.id}` would address `/admin/inventory/undefined`.
 *
 * @param {{ colourway_id: number|string }} row
 * @returns {string}
 */
export function stockDeletePath(row) {
  return `/admin/inventory/${row?.colourway_id}`
}

/**
 * How a stock row is named to a person. The SKU is unique across the catalogue
 * (`colourways_sku_key`), so it identifies the row on its own; the colour name
 * is what staff actually recognise, so it comes along.
 *
 * @param {{ sku?: string, colourway_name?: string }} [row]
 * @returns {string|undefined} undefined lets useCrudScreen say "That stock row"
 */
export function describeStockRow(row) {
  const sku = trimmed(row?.sku)
  if (sku === '') return undefined
  const colour = trimmed(row?.colourway_name)
  return colour === '' ? sku : `${sku} (${colour})`
}

/**
 * How a supplier rate is named to a person — supplier first, because the code is
 * unique only within `(supplier, category)`. The list spans every supplier, so a
 * bare code names several rows at once.
 *
 * @param {{ supplier?: string, code?: string }} [item]
 * @returns {string|undefined}
 */
export function describeRate(item) {
  const code = trimmed(item?.code)
  if (code === '') return undefined
  const supplier = trimmed(item?.supplier)
  return supplier === '' ? code : `${supplier} ${code}`
}

/**
 * How an account is named to a person. The email, never the display name: `name`
 * is nullable and duplicated freely, while the address is what the person signs
 * in with and is unique by constraint.
 *
 * @param {{ email?: string }} [user]
 * @returns {string|undefined}
 */
export function describeAccount(user) {
  return trimmed(user?.email) || undefined
}

/**
 * True when a colourway has no stock row, so it cannot sell and does not appear
 * on Manage stock at all.
 *
 * `GET /admin/colourways` returns `inventory: null` in exactly that case, which
 * is the only way back to a colourway whose row was deleted — nothing on the
 * stock screen's own list can show a row that is not there.
 *
 * @param {{ inventory?: object|null }} [colourway]
 * @returns {boolean}
 */
export function needsStockRow(colourway) {
  return colourway?.inventory == null
}

/**
 * Replace the ask step's body copy, leaving a refusal's alone.
 *
 * The kit's default body is "This removes the … permanently. It cannot be
 * undone." — true of every entity in the CRM except a price-list rate, which the
 * next import re-creates. `confirmLabel` is the step marker: deleteDialog sets it
 * to 'Delete' while it is still asking and to null once the API has refused, and
 * a refusal's body is the API's own sentence, which must never be overwritten.
 *
 * @param {object} dialog the object useCrudScreen returns as `remove.dialog`
 * @param {string} caveat
 * @returns {object}
 */
export function withDeleteCaveat(dialog, caveat) {
  if (!dialog || dialog.confirmLabel == null) return dialog
  return { ...dialog, body: caveat }
}
