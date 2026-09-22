// Pure logic for the live list screens the admin kit reached last: Manage stock,
// Supplier rates, and the two account rosters (Clients and Users & permissions).
//
// Web orders started here too and moved out to ./adminOrders.js when W12 turned
// /admin/orders into a real paged, filtered order desk — six filters and a page
// size that is a contract with the endpoint are a screen module's worth of rules,
// not a line in the shared one.
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Anything
// with a rule in it therefore lives here, beside the screens, and is tested
// directly (see ./adminLists.test.js) — the same split adminCatalogue.js and
// adminShipping.js make for the catalogue and freight screens.
//
// Five rules, each of which has a wrong answer that fails quietly:
//
//   · **Not every endpoint pages.** /admin/price-list-items and /admin/inventory
//     take page/limit and answer with `meta.total`; /admin/users returns the
//     whole list with no meta and declares `additionalProperties: false`, so
//     Fastify's Ajv strips the `page` useAdminList sends rather than rejecting
//     it. Left at the kit's default 25 it would advertise a second page that
//     can never be fetched, which is why UNPAGED_LIST_LIMIT sits above any
//     plausible row count. **/admin/orders and /admin/inventory are no longer
//     unpaged** — both have real paging AND a `maximum` on `limit`, so a limit
//     of 1000 is a 400 there rather than a list.
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

// Above any plausible row count for the account roster: the endpoint answers
// with the whole list, so this exists to keep `totalPages` at 1 rather than to
// page. It must never be passed to an endpoint that declares a `maximum` on
// `limit` — that is a 400, not a big page.
export const UNPAGED_LIST_LIMIT = 1000

// Manage stock pages: one row per colourway, ~19k once the colour files land.
// Well inside the endpoint's MAX_LIMIT of 200.
export const STOCK_LIST_LIMIT = 25

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
 * Filters for GET /admin/users on the STAFF roster (Users & permissions).
 * `segment=staff` (USER_SEGMENTS.staff — backoffice + director) is the whole
 * point of the screen: permissions here means who in the OFFICE may do what.
 * Customer and trade logins are client records and are worked on Clients
 * (`segment=clients`), which owns the company, its contacts and the trade
 * approve/decline verbs. A constant, not a parameter — there is no caller that
 * wants the superset, and an optional segment is how it drifts back to one.
 *
 * @param {boolean} [showArchived]
 * @returns {{ segment: 'staff', include_archived: boolean|null }}
 */
export function userListFilters(showArchived = false) {
  return { segment: 'staff', include_archived: showArchived || null }
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

// --- drop detection (Supplier rates) ---------------------------------------
//
// A rate row carries two related but DIFFERENT facts about a supplier dropping
// a code, and the screen must not conflate them:
//   - `discontinued_at` is a STAFF DECISION recorded via mark-discontinued —
//     the supplier no longer lists this. Drawn in clay, the alarm tone the
//     stock screen uses for oversold.
//   - `suspect` is DERIVED by the API: a later import covered this row's
//     (supplier, category) and did not name it. A suspicion, not a verdict —
//     the file may simply have been partial — so it is drawn a step quieter
//     (brass) and dismissed by nothing but a fresh import that names the code.
// Neither implies archived and a discontinued item blocks nothing.

/**
 * Which flag a rate row wears, or null for a plain row. The stored decision
 * outranks the derived suspicion: once staff have marked a row discontinued,
 * "missing from the last import" is no longer news about it.
 *
 * @param {{ discontinued_at?: string|null, suspect?: boolean }} [item]
 * @returns {'discontinued'|'suspect'|null}
 */
export function rateFlag(item) {
  if (item?.discontinued_at != null) return 'discontinued'
  if (item?.suspect === true) return 'suspect'
  return null
}

/**
 * Narrow a page of rates to one flag. Client-side over the CURRENT PAGE only —
 * GET /admin/price-list-items has no discontinued/suspect filter (its
 * querystring schema declares additionalProperties: false, so inventing one
 * here would be silently stripped and quietly filter nothing) — which is why
 * the screen states the page-only scope beside the control (RATE_FLAG_NOTE).
 *
 * @param {ReadonlyArray<object>} items the page rows
 * @param {''|'discontinued'|'suspect'} flag '' shows everything
 * @returns {Array<object>}
 */
export function filterByRateFlag(items = [], flag = '') {
  if (!flag) return [...items]
  return items.filter((item) => rateFlag(item) === flag)
}

/** Why the flag filter can go quiet on a page that plainly has rows. */
export const RATE_FLAG_NOTE =
  'The flag filter narrows the page in front of you — the API has no ' +
  'discontinued filter yet, so page through (or narrow by supplier) to check ' +
  'the rest.'

/**
 * The body for POST /admin/price-list-items/mark-discontinued, or the sentence
 * to show instead of sending it. Both halves of the scope are required: drop
 * detection is per (supplier, category) — a file has no stable key (filenames
 * carry the year), and per supplier would mark a house's whole fabric range
 * discontinued off its wallpaper list.
 *
 * @param {{ supplier?: string, category?: string }} [scope]
 * @returns {{body: {supplier: string, category: string}}|{error: string}}
 */
export function markDiscontinuedScope({ supplier = '', category = '' } = {}) {
  const supplierName = trimmed(supplier)
  if (supplierName === '' || category === '') {
    return {
      error:
        'Name the supplier and the category — drop detection compares one ' +
        '(supplier, category) group against its own most recent import.',
    }
  }
  return { body: { supplier: supplierName, category } }
}

/**
 * What the office is asked before marking a group. The real confirmation is
 * the API's coverage statement AFTER the call — "this file covered 412 of the
 * 2,516 codes we hold" is computed and acted on in one snapshot, so it cannot
 * be quoted beforehand without racing it — and this ask says exactly that.
 *
 * @param {{supplier: string, category: string}} scope from markDiscontinuedScope
 * @returns {string}
 */
export function markDiscontinuedAsk({ supplier, category }) {
  return (
    `Mark every ${supplier} ${category} code the most recent import did not ` +
    'name as discontinued? Nothing is archived or blocked by this, and the ' +
    'response states exactly what that import covered.'
  )
}
