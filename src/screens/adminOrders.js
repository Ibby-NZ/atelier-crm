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
import { productRoute } from './adminCatalogue.js'

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

// ---- the Emails section: who hears about a status change (23 Sep 2026) ------
//
// Every status change on a sales order — confirmed, paid, shipped, cancelled —
// emails the client, the order's sales rep, and every address the office adds
// here. The API sends them (atelier-api src/email/notifications.js
// notifyOrderTransition); these rules mirror its src/orders/notify-emails.js so
// Add refuses what the API would answer 400 to.

/** Mirrors the API's NOTIFY_EMAILS_MAX. */
export const NOTIFY_EMAILS_MAX = 10

// The API's EMAIL_PATTERN: no whitespace anywhere, one @, a dot after it.
const NOTIFY_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Said at the top of the section, so nobody has to guess what it is for. */
export const STATUS_EMAIL_NOTE =
  'Every status change — confirmed, paid, shipped, cancelled — is emailed to everyone here.'

/** And what it is NOT for: the packing slip travels with the goods. */
export const PACKING_SLIP_NOT_EMAILED = 'Packing slips are printed, never emailed.'

const sameEmail = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Who this order's status letters go to, as the section lists them. The client
 * and the rep are always included and are not edited here: the rep is picked
 * under General, the client's address lives on their account (or the guest's
 * order). `rep.email` is null for a rep whose login is archived — the API stops
 * mailing someone who has left, and the section says so. `copy` is the
 * address copied on EVERY letter about any order (the API's ORDER_COPY_EMAIL,
 * jenettec@atelier.co.nz — 24 Sep 2026, "always in the loop"); the API names
 * it on the order as `order_copy_email`, null when switched off.
 *
 * @param {object} order the admin order shape
 * @returns {{ client: string|null, rep: null|{ name: string, email: string|null }, added: string[], copy: string|null }}
 */
export function statusEmailRecipients(order = {}) {
  return {
    client: order.client_email ?? order.guest_email ?? null,
    rep:
      order.sales_rep_user_id == null
        ? null
        : { name: order.sales_rep_name || order.sales_rep_email || `Staff #${order.sales_rep_user_id}`, email: order.sales_rep_email ?? null },
    added: order.notify_emails ?? [],
    copy: order.order_copy_email ?? null,
  }
}

/**
 * Every address a letter about this order reaches, each once, in the API's
 * order (client, rep, list, copy) — what the Send buttons' confirmation names.
 * Mirrors atelier-api orderLetterRecipients.
 *
 * @param {object} order
 * @returns {string[]}
 */
export function orderLetterRecipients(order = {}) {
  const { client, rep, added, copy } = statusEmailRecipients(order)
  return [client, rep?.email, ...added, copy].reduce(
    (list, email) => (email && !list.some((kept) => sameEmail(kept, email)) ? [...list, email] : list),
    []
  )
}

// ---- sending from the Emails section (24 Sep 2026) --------------------------
//
// "Send order details to the customer or resend the order notification":
// POST /admin/orders/:id/email { letter: 'details' | 'status' }, to everyone
// the section lists. Nothing about the order moves; only a letter goes.

/**
 * What "Resend" sends, in words: the letter for where the order stands now.
 * Mirrors atelier-api currentStatusTemplate — a status the order MOVED to has
 * its transition letter; `requested` has the creation one.
 *
 * @param {object} order
 * @returns {string}
 */
export function resendLetterName(order = {}) {
  if (order.status === 'requested') {
    return order.kind === 'manual' ? 'order confirmation' : 'request acknowledgement'
  }
  return (
    {
      confirmed: 'invoice email',
      paid: 'payment received email',
      shipped: 'shipped email',
      declined: 'cancellation email',
    }[order.status] ?? 'status email'
  )
}

/**
 * The toast after a send, from the API's `{ sent, failed }`: who it reached,
 * and — in the same sentence, because a toast is all anybody reads — who it
 * did not.
 *
 * @param {string} what e.g. 'Order details for SO-12'
 * @param {{ sent?: string[], failed?: string[] }} result
 * @returns {string}
 */
export function orderLetterSentNote(what, result = {}) {
  const sent = result.sent ?? []
  const failed = result.failed ?? []
  return [
    `${what} emailed to ${sent.join(', ')}.`,
    ...(failed.length ? [`Could not send to ${failed.join(', ')}.`] : []),
  ].join(' ')
}

/**
 * The PATCH that adds one typed address to the order's list — the WHOLE list,
 * because the API replaces it — or the reason it cannot be added, in words.
 * An address the client or rep already has is refused rather than stored: they
 * get the letter anyway, and a second copy on the list reads as if they did not.
 *
 * @param {object} order
 * @param {string} typed
 * @returns {{ ok: true, patch: { notify_emails: string[] } } | { ok: false, error: string }}
 */
export function addNotifyEmail(order = {}, typed = '') {
  const email = String(typed ?? '').trim()
  if (email === '') return { ok: false, error: 'Type an email address to add.' }
  if (!NOTIFY_EMAIL_RE.test(email)) return { ok: false, error: `"${email}" is not an email address.` }
  const { client, rep, added, copy } = statusEmailRecipients(order)
  if (sameEmail(email, client)) return { ok: false, error: `${email} is the client's address — they are already emailed.` }
  if (sameEmail(email, rep?.email)) return { ok: false, error: `${email} is the sales rep's address — they are already emailed.` }
  if (sameEmail(email, copy)) return { ok: false, error: `${email} is copied on every order email already.` }
  if (added.some((value) => sameEmail(value, email))) return { ok: false, error: `${email} is already on the list.` }
  if (added.length >= NOTIFY_EMAILS_MAX) {
    return { ok: false, error: `An order can copy in at most ${NOTIFY_EMAILS_MAX} addresses — remove one first.` }
  }
  return { ok: true, patch: { notify_emails: [...added, email] } }
}

/**
 * The PATCH that takes one address off the list.
 *
 * @param {object} order
 * @param {string} email
 * @returns {{ notify_emails: string[] }}
 */
export function removeNotifyEmail(order = {}, email) {
  return { notify_emails: (order.notify_emails ?? []).filter((value) => value !== email) }
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
  { key: 'notes', label: 'Notes', kind: 'text', max: 2000 },
  { key: 'contact_phone', label: 'Contact phone', kind: 'text', max: 50 },
  { key: 'client_reference', label: 'Client reference', kind: 'text', max: 200 },
  { key: 'customer_po_number', label: 'Client PO number', kind: 'text', max: 200 },
])

/**
 * Each header box's `maxLength`, keyed by column. The numbers are the API's own
 * `maxLength`s (the edit body schema in atelier-api src/routes/admin-orders.js),
 * so the browser stops the typist where the endpoint would otherwise answer a
 * long save with a raw Fastify 400 — after the note was written.
 */
export const HEADER_MAX = Object.freeze(
  Object.fromEntries(ORDER_HEADER_FIELDS.map((field) => [field.key, field.max]))
)

/**
 * Merge a freshly-seeded header draft over the one on screen, keeping every box
 * that has been TYPED INTO.
 *
 * The screen re-seeds its drafts from server truth whenever the list reloads,
 * and the list reloads after every mutation — so without this, assigning a
 * sales rep or shipping an order threw away a note typed but not yet saved,
 * which is exactly the annotate-then-ship workflow the notes box exists for.
 *
 * A box counts as typed into when it differs from the row just fetched; a save
 * makes the two agree, so a saved edit re-seeds normally. An empty `draft` (the
 * screen empties it when an order is opened) seeds wholesale.
 *
 * @param {object} draft  the header draft currently on screen
 * @param {object} fresh  draftFrom(order, ORDER_HEADER_FIELDS)
 * @returns {object} a new draft — neither argument is mutated
 */
export function keepTypedHeader(draft = {}, fresh = {}) {
  const typed = Object.entries(draft).filter(([key, value]) => value !== fresh[key])
  return { ...fresh, ...Object.fromEntries(typed) }
}

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

// --- shipping ---------------------------------------------------------------
//
// Ship is the one press that emails the client, so the tracking box has to be
// right BEFORE it is pressed. The API's ship schema is
// `{ tracking_url: { maxLength: 500, pattern: '^(https?://.*)?$' } }`: a pasted
// courier reference, or a bare `www.nzpost.co.nz`, is a raw Fastify 400 that
// arrives after the office has already committed to shipping.

const TRACKING_URL_PATTERN = /^https?:\/\//

/** The API's `maxLength` on tracking_url, spent as the input's own. */
export const TRACKING_URL_MAX = 500

/**
 * The `POST /admin/orders/:id/ship` body off the tracking box.
 *
 * Blank is not an error — the office hand-delivers plenty of orders and ships
 * them with an empty box, so a blank sends no key at all. Anything else must
 * carry the scheme, because the string lands in a client's inbox as a link:
 * `javascript:…` is dangerous and `nzpost.co.nz` is simply broken. The pattern
 * is the API's, character for character, case included — Ajv runs it unflagged,
 * so `HTTPS://` is a 400 there too and accepting it here would only move the
 * failure back to the press. Length is left to the input's maxLength.
 *
 * @param {string} value the tracking box
 * @returns {{ ok: true, body: object }|{ ok: false, error: string }}
 */
export function shipBody(value) {
  const url = trimmed(value)
  if (url === '') return { ok: true, body: {} }
  if (!TRACKING_URL_PATTERN.test(url)) {
    return {
      ok: false,
      error:
        'A tracking URL must start with http:// or https:// — paste the courier link, or leave the box blank for a hand delivery.',
    }
  }
  return { ok: true, body: { tracking_url: url } }
}

// ---- GST + the SKU link ----------------------------------------------------

/**
 * The label for the GST line in the Money block. The API derives the figures
 * from the order total and the Xero basis its invoice uses (Exclusive: added on
 * top; Inclusive: already inside the total; NoTax: an export), so the line
 * says which it is rather than printing a percentage that means two things.
 *
 * @param {{rate?: number, basis?: string}} gst
 * @returns {string}
 */
export function gstLabel(gst = {}) {
  const pct = `${Math.round((Number(gst.rate) || 0) * 100)}%`
  if (gst.basis === 'Inclusive') return `GST (${pct}, included)`
  if (gst.basis === 'NoTax') return 'GST (none)'
  return `GST (${pct})`
}

/**
 * Where an order line's SKU links: the Stock screen with its search seeded, so
 * the row behind the line is one press away instead of a retype. The SKU is
 * encoded — a supplier code can carry a slash.
 *
 * @param {string} sku
 * @returns {string}
 */
export function stockPath(sku) {
  return `/admin/stock?q=${encodeURIComponent(sku ?? '')}`
}

// ---- the order page, the product link, the customer's history --------------

/**
 * Where an order opens: its own page (16 Sep 2026 — "view the individual order
 * details in a separate page"). By id, the API's own key.
 *
 * @param {{id: number}} order
 * @returns {string}
 */
export function orderPath(order) {
  return `/admin/orders/${order?.id ?? ''}`
}

/**
 * Where an order line's SKU links (16 Sep 2026: "unable to click on sku to be
 * taken to product"): that design's own page (23 Sep 2026). It used to be the
 * Products list with `?open=<id>`, which expanded the row in place; the list
 * still redirects that form, for bookmarks, but a link the CRM writes goes
 * straight to the page. The stock row stays one press away too (stockPath),
 * as a secondary link.
 *
 * @param {number|string|null} productId
 * @returns {string|null} null when the line carries no product id (an older API)
 */
export function productPath(productId) {
  return productId == null || productId === '' ? null : productRoute(encodeURIComponent(productId))
}

/**
 * The orders behind one customer: the desk's own `client` filter on their
 * email, archived rows included, at the endpoint's page ceiling. `client` is an
 * ILIKE over the account's name and email AND a guest's email, so orders the
 * person placed before they had a login are in the answer too — which is what
 * "their history" means at the counter.
 *
 * @param {string} email
 * @returns {string|null} null when there is no email to ask about
 */
export function customerOrdersPath(email) {
  const text = typeof email === 'string' ? email.trim() : ''
  if (!text) return null
  return `/admin/orders?${new URLSearchParams({ client: text, include_archived: 'true', limit: String(ORDER_LIST_LIMIT) })}`
}

// Money the platform has actually taken: paid and shipped. A request, a
// confirmed-but-unpaid order and a cancelled one are demand, not revenue.
const REVENUE_STATUSES = Object.freeze(['paid', 'shipped'])

/**
 * The WooCommerce "customer history" block: how many orders, what they have
 * paid in total, and the average — from the rows the desk returned.
 * `total` is the server's count (the page may be shorter than it); the money
 * is summed over the LOADED rows only, and `partial` says so when the page is
 * short of the total so the figure is never presented as complete when it is
 * not.
 *
 * @param {Array<{status: string, total_cents: number|string}>} orders
 * @param {number} [total] the server's meta.total
 * @returns {{orders: number, revenueCents: number, paidOrders: number, averageCents: number, partial: boolean}}
 */
export function customerHistory(orders = [], total = orders.length) {
  const rows = Array.isArray(orders) ? orders : []
  const paid = rows.filter((row) => REVENUE_STATUSES.includes(row?.status))
  const revenueCents = paid.reduce((sum, row) => sum + (Number(row.total_cents) || 0), 0)
  const count = Number.isFinite(Number(total)) ? Number(total) : rows.length
  return {
    orders: count,
    paidOrders: paid.length,
    revenueCents,
    averageCents: paid.length ? Math.round(revenueCents / paid.length) : 0,
    partial: rows.length < count,
  }
}

/**
 * The toast after Mark paid. The API now records the payment in Xero as part
 * of the transition and answers `xero_payment` — recorded, or why not — so the
 * toast says what happened THERE too, rather than leaving the office to open
 * Xero and check (16 Sep 2026: "xero invoice should be marked as paid when the
 * order is paid"). Absent on an un-integrated deployment: plain sentence.
 *
 * @param {string} orderNumber
 * @param {{xero_payment?: {recorded: boolean, invoice_number?: string|null, reason?: string}}} result
 * @returns {string}
 */
export function markPaidNote(orderNumber, result) {
  const payment = result?.xero_payment
  if (!payment) return `${orderNumber} — marked paid.`
  if (payment.recorded) {
    return `${orderNumber} — marked paid, and ${payment.invoice_number ?? 'its invoice'} is marked paid in Xero.`
  }
  return `${orderNumber} — marked paid. Xero: ${payment.reason ?? 'the payment was not recorded.'}`
}
