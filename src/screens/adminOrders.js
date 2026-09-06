// Pure rules for Web orders (AdminOrders.jsx) — the order desk. This repo has no
// jsdom, so a screen cannot be rendered in a test; anything with a rule in it
// lives here and is tested directly (./adminOrders.test.js), the same split
// adminSamples.js, adminSuppliers.js and adminShipping.js make for their screens.
//
// These moved out of adminLists.js when W12 turned /admin/orders into a real
// order desk. That module is the shared home for the *thin* live lists (stock,
// the two account rosters); orders now carry enough of their own — six filters, a
// page size that is a contract with the endpoint, and a header whitelist — to be
// a screen module like every other substantial screen.
//
// Four rules, each with a wrong answer that fails quietly:
//
//   · **/admin/orders PAGES now, and its limit has a MAXIMUM.** It answers
//     `{ orders, meta: { total, page, limit } }`, 50 rows by default, and the
//     route schema carries `maximum: MAX_LIMIT` (200) — so an over-large limit is
//     a **400 that kills the whole list**, not a silent clamp. The screen used to
//     pass UNPAGED_LIST_LIMIT (1000) on the assumption that this endpoint handed
//     back the table; that assumption is now a broken screen. See
//     ORDER_LIST_LIMIT.
//   · **An unset filter is null, never the empty string.** buildListQuery drops
//     null/undefined/''; forwarded as '' the status select's "All" becomes
//     `status=`, which the endpoint's enum answers with a 400 that kills the
//     whole list rather than one filter. The free-text filters are capped at 200
//     characters server-side and a longer one is a 400 naming the filter, so a
//     search box is left to the API to refuse rather than pre-validated here.
//   · **`customer_po_number` is the client's PO number, not one of ours.** It is
//     the number the CLIENT issued to Atelier; Atelier's own purchase orders are
//     a different record with its own sequence (W13's `purchase_orders` table).
//     They never join, neither is derivable from the other, and a field labelled
//     plain "PO number" is one an operator reconciles against the wrong book. The
//     label carries the distinction because nothing else can.
//   · **A header field clears to null, never to ''.** The `text` kind's
//     blankToNull is what does it (drafts.js), matching the API's own
//     applyOrderHeader: a stored '' is an absence every `IS NULL` read misses and
//     every `ILIKE '%…%'` search matches.
//
// The page-reset rule is deliberately NOT here. useAdminList already resets to
// page 1 whenever the serialised filters change, and steps back a page when a
// delete empties the last one; re-implementing either in the screen would fight
// it (and an effect keyed on a fresh object literal refetches for ever).

import { ORDER_STATUSES, sourceOf } from '../admin/orderFlow.js'

/**
 * Rows per page. Matches the endpoint's own DEFAULT_LIMIT and sits well inside
 * its MAX_LIMIT of 200 — an over-large value is a 400 from the route schema, so
 * this number is a contract with the API rather than a display preference.
 */
export const ORDER_LIST_LIMIT = 50

/**
 * The search bar's cleared state, and the shape of the committed search the
 * screen holds. Every key is a filter `GET /admin/orders` actually accepts —
 * Fastify's Ajv strips an unknown query key silently, so an invented one would
 * simply never filter anything.
 */
/**
 * Named status SETS the dashboard tiles link with. Mirrors atelier-api's
 * constants — `open` is HELD_STATUSES (src/orders/order-states.js: the order
 * book awaiting fulfilment, the reservation-holding set) and `sold` is
 * REVENUE_STATUSES (src/reports/revenue-lines.js: what counts as a sale) — so a
 * tile and the list it opens cannot mean two different things. Never retyped
 * casually: widening either side alone is the drift the mirror comments exist
 * to catch.
 */
export const STATUS_SETS = Object.freeze({
  open: Object.freeze(['requested', 'confirmed', 'paid']),
  sold: Object.freeze(['paid', 'shipped']),
})

export const EMPTY_ORDER_SEARCH = Object.freeze({
  q: '',
  client: '',
  reference: '',
  po_number: '',
  from: '',
  to: '',
})

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '')

// --- the search that travels in the URL -------------------------------------
//
// **A filter another screen links into belongs in the URL, not in state** — the
// rule AdminCollections' house filter already follows. The Report Library links
// a report row through to the order behind it (Userback 8287873), and this
// screen is often already mounted when it does: held in `useState`, the link
// would change the address bar and leave the queue exactly as it was, and the
// back button would not undo the search.
//
// Only these four travel. Client, client reference and the client's PO number
// stay in local state because nothing links to them, and putting a name in the
// address bar is not a thing to do for free.
//
// What is TYPED is still a draft — the boxes reach the URL, and therefore the
// endpoint, only when Search is pressed.

export const URL_ORDER_FILTERS = Object.freeze(['q', 'from', 'to', 'status'])

/**
 * URLSearchParams → the committed search those four keys make. Absent and
 * whitespace-only are both '', which `orderListFilters` then drops.
 *
 * `status` is measured against the enum the endpoint accepts: a hand-typed
 * `?status=pending` is a **400 that kills the whole list**, so an unknown value
 * is no filter at all rather than a broken screen.
 *
 * @param {URLSearchParams} [params]
 * @returns {{ q: string, from: string, to: string, status: string }}
 */
export function orderSearchFromParams(params) {
  const read = (key) => trimmed(params ? params.get(key) : '')
  const status = read('status')
  return {
    q: read('q'),
    from: read('from'),
    to: read('to'),
    // A set name (the dashboard's tiles) is as much a legal URL status as an
    // enum member; anything else is no filter at all rather than a broken list.
    status:
      ORDER_STATUSES.includes(status) || Object.hasOwn(STATUS_SETS, status) ? status : '',
  }
}

/**
 * The four back into the URL. A blank is ABSENT rather than an empty parameter,
 * so a cleared search leaves a bare path — the same rule `buildListQuery`
 * follows on the way to the API, and what keeps `?q=` from reading as a search
 * that matched nothing.
 *
 * @param {object} [search] anything carrying the four keys (the draft will do)
 * @returns {object} ready for setSearchParams
 */
export function orderSearchParams(search = {}) {
  return URL_ORDER_FILTERS.reduce((params, key) => {
    const value = trimmed(search[key])
    return value === '' ? params : { ...params, [key]: value }
  }, {})
}

/**
 * The URL's search boxes as ONE primitive, for the effect that re-seeds the
 * boxes from a link.
 *
 * `status` is deliberately left out. It is the one URL filter that commits on
 * the spot — a closed select, no draft — so its write moves the querystring
 * without touching a box; an effect keyed on the whole querystring therefore
 * fired on it and re-seeded the search and date boxes from the URL, silently
 * erasing what had been typed and not yet submitted.
 *
 * @param {object} [search] anything carrying q / from / to (orderSearchFromParams' output)
 * @returns {string} '' when none of the three is set
 */
export function orderDraftSeed(search = {}) {
  return new URLSearchParams(orderSearchParams({ ...search, status: '' })).toString()
}

// --- sales rep attribution (A6 groundwork) ----------------------------------
//
// The rep is an ANNOTATION the API accepts at any status — back-filling who
// sold a shipped order is the point. The select PATCHes on change; these two
// are the rules it leans on.

/**
 * The one-key PATCH body off the select's value. Blank clears (an explicit
 * null); anything unparseable sends nothing at all rather than a 400.
 *
 * @param {string|number} value
 * @returns {{ sales_rep_user_id: number|null }|null}
 */
export function repPatch(value) {
  const raw = String(value ?? '').trim()
  if (raw === '') return { sales_rep_user_id: null }
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return { sales_rep_user_id: id }
}

/**
 * The staff roster (`GET /admin/users?segment=staff`) as select options.
 * users.name is nullable, so the email stands in — the same fallback the API's
 * own staff_name snapshots use.
 *
 * @param {Array<{id: number, name?: string|null, email: string}>} [users]
 * @returns {Array<{id: number, label: string}>}
 */
export function staffOptions(users = []) {
  return users.map((user) => ({ id: user.id, label: user.name || user.email }))
}

/**
 * Said on the PO field wherever it is edited. A `purchase_orders` table arrives
 * in the next epic and the two numbers will sit one screen apart.
 */
export const CUSTOMER_PO_HINT =
  'The number the CLIENT issued to Atelier — not one of our own purchase orders.'

/**
 * The order header `PATCH /admin/orders/:id` accepts, declared once so the draft
 * is formatted and parsed by the same rule (drafts.js). Mirrors the API's frozen
 * ORDER_HEADER_COLUMNS minus `guest_email`, which the screen does not offer: an
 * order attributed to an account must keep writing to the account's own address.
 *
 * `text` is what folds a cleared box to null rather than to ''.
 */
export const ORDER_HEADER_FIELDS = Object.freeze([
  { key: 'notes', label: 'Notes', kind: 'text' },
  { key: 'contact_phone', label: 'Contact phone', kind: 'text' },
  { key: 'client_reference', label: 'Client reference', kind: 'text' },
  { key: 'customer_po_number', label: 'Client PO number', kind: 'text' },
])

/**
 * Filters for `GET /admin/orders`.
 *
 * `status` and the date bounds come straight off form controls whose empty state
 * is `''`, and every one of them is a 400 if it reaches the endpoint that way —
 * so every value leaves here as itself or as null, and buildListQuery drops the
 * nulls.
 *
 * @param {{ status?: string, showArchived?: boolean, q?: string, client?: string,
 *   reference?: string, po_number?: string, from?: string, to?: string }} [options]
 * @returns {object} the query params, unset ones as null
 */
export function orderListFilters({
  status = '',
  showArchived = false,
  q = '',
  client = '',
  reference = '',
  po_number: poNumber = '',
  from = '',
  to = '',
} = {}) {
  return {
    // A set name expands to the array the endpoint binds as ANY; a single
    // status travels as itself; blank is null and buildListQuery drops it.
    status: STATUS_SETS[status] ? [...STATUS_SETS[status]] : status || null,
    include_archived: showArchived || null,
    q: trimmed(q) || null,
    client: trimmed(client) || null,
    reference: trimmed(reference) || null,
    po_number: trimmed(poNumber) || null,
    // `<input type="date">` yields '' until what was typed is a real date, so a
    // half-typed bound is simply absent rather than a 400 on every keystroke.
    from: trimmed(from) || null,
    to: trimmed(to) || null,
  }
}

/**
 * Is anything narrowing this list? Decides whether an empty result reads as "no
 * orders yet" or as "nothing matches" — opposite answers, and showing the first
 * one under a search is how a filter that matched nothing looks like a broken
 * screen.
 *
 * @param {object} [filters] the same options orderListFilters takes
 * @returns {boolean}
 */
export function hasOrderFilters(filters = {}) {
  const query = orderListFilters(filters)
  // include_archived widens the list rather than narrowing it, so it is not a
  // reason to change the empty-state sentence.
  return Object.entries(query).some(
    ([key, value]) => key !== 'include_archived' && value !== null
  )
}

// --- the Source filter ------------------------------------------------------
//
// **`GET /admin/orders` has no `kind` filter and Ajv's `removeAdditional` would
// STRIP one silently**, so a `source=` param would not narrow anything and
// nothing would say so. The filter is therefore applied in the browser, over the
// page that has already been fetched — which is honest but partial, and the
// screen has to say which. `SOURCE_FILTER_NOTE` is that sentence and
// `sourceCountNote` is the count, because "50 matching" above twelve rows is the
// exact lie this rule exists to avoid.
//
// The fix is one property on the endpoint's querystring schema plus a clause in
// order-filters.js; until then, do not present this as a server-side filter and
// do not raise `limit` to paper over it (the route's MAX_LIMIT is 200 and an
// over-large value is a 400 that kills the whole list).

export const SOURCE_FILTER_NOTE =
  'Source is filtered on the orders already loaded — the endpoint has no source ' +
  'filter yet, so page through to see the rest.'

/**
 * Narrow already-fetched rows to one source. An unset filter returns the rows
 * untouched (the same array, so React sees no change).
 *
 * @param {ReadonlyArray<object>} rows
 * @param {string} [source] '' | 'website' | 'office'
 * @returns {ReadonlyArray<object>}
 */
export function filterBySource(rows = [], source = '') {
  if (!source) return rows
  return rows.filter((order) => sourceOf(order?.kind) === source)
}

/**
 * What the count line says. Without a source filter it is the server's total, as
 * it always was; with one it states BOTH figures and which of them is the whole
 * answer, because the browser only narrowed the page it was given.
 *
 * @param {{ shown?: number, loaded?: number, total?: number, source?: string }} [state]
 * @returns {string}
 */
export function sourceCountNote({ shown = 0, loaded = 0, total = 0, source = '' } = {}) {
  const all = `${Number(total).toLocaleString('en-NZ')} matching`
  if (!source) return all
  return `${shown} of ${loaded} on this page · ${all} in total`
}

/**
 * The client's own two numbers as one short line for the list row, so a search
 * hit is visible without opening the order. Empty when the client has issued
 * neither — a row of labels with nothing after them is noise on every other row.
 *
 * @param {{ client_reference?: string|null, customer_po_number?: string|null }} [order]
 * @returns {string}
 */
export function referenceLine(order = {}) {
  return [
    order.client_reference ? `Ref ${order.client_reference}` : '',
    order.customer_po_number ? `Client PO ${order.customer_po_number}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
