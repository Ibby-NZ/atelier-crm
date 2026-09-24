// The sales-order state machine, as the screen needs to see it. Pure, so which
// statuses an order offers is testable without a DOM.
//
// It mirrors atelier-api's src/orders/order-states.js exactly — the API is the
// authority and answers a wrong move with a 409 (and a $0.00 line with a 422).
// Duplicating the rules here is not a second gate; it is so staff are only
// offered the moves the API will take. If the two ever disagree, the API wins
// and its message surfaces.
//
//   quote_requested → quote_sent → quote_accepted | quote_rejected
//     → back_order | processing → pending_payment → paid → shipped → completed
//   plus cancelled and refunded, the dead ends (24 Sep 2026 overhaul)
//
// Every status is one POST /admin/orders/:id/status away; the order page offers
// ALLOWED_TRANSITIONS[status] in a dropdown.
//
// Lines are editable while the order still holds its stock and nobody has paid
// it (LINE_EDIT_STATUSES) — that window is what turns a storefront quote into a
// sales order: a request arrives with every line priced at 0, and pricing it in
// place is one PATCH away. See buildLinePatch at the foot of this file.

import { blankToNull, centsToDollars, parseDollars } from './drafts.js'

// The API's ORDER_STATUSES, in lifecycle order — the dropdowns list them so.
export const ORDER_STATUSES = Object.freeze([
  'quote_requested',
  'quote_sent',
  'quote_accepted',
  'quote_rejected',
  'back_order',
  'processing',
  'pending_payment',
  'paid',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
])

// The office's words. The storefront says "Quote received" for quote_sent —
// the client's side of the same fact.
export const STATUS_LABELS = Object.freeze({
  quote_requested: 'Quote requested',
  quote_sent: 'Quote sent',
  quote_accepted: 'Quote accepted',
  quote_rejected: 'Quote rejected',
  back_order: 'Back order',
  processing: 'Processing',
  pending_payment: 'Pending payment',
  paid: 'Paid',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
})

// The order's CHANNEL. 'manual' is one the office keyed itself — a phone call, a
// walk-in, a bespoke enquiry — and reserves stock exactly like a web request.
export const KIND_LABELS = Object.freeze({
  checkout: 'Card checkout',
  order_request: 'Order request',
  backorder_request: 'Backorder',
  manual: 'Sales order',
})

// Where the order came from, which is the coarser question the Sales orders list
// answers now that web orders are not a list of their own. Three kinds arrive
// through the storefront and one is keyed at a desk, so the source is DERIVED
// from `orders.kind` rather than stored — there is no column for it and there
// must not be one, or the two would disagree the first time a kind is added.
//
// KIND_LABELS stays the finer answer (which of the three website routes it came
// in by) and is printed under the source; this is deliberately not a second
// spelling of the same map.
export const SOURCE_LABELS = Object.freeze({
  website: 'Website',
  office: 'Office',
})

/** @param {string} kind @returns {'website'|'office'} */
export function sourceOf(kind) {
  return kind === 'manual' ? 'office' : 'website'
}

/**
 * The word the Source column prints. Unknown kinds read as Website rather than
 * blank: every kind the API has ever had except `manual` is a storefront one,
 * and an empty cell reads as missing data rather than as an answer.
 *
 * @param {{kind?: string}} [order]
 * @returns {string}
 */
export function sourceLabel(order = {}) {
  return SOURCE_LABELS[sourceOf(order.kind)]
}

/** The Source filter's options, "All" first. Derived, never re-typed. */
export const SOURCE_OPTIONS = Object.freeze(
  Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))
)

// Which reservation a reserving order currently holds, in words. 'none' is a
// card checkout: it arrived paid and already decremented, so it holds nothing.
export const RESERVATION_LABELS = Object.freeze({
  held: 'Stock held',
  converted: 'Stock drawn down',
  released: 'Stock released',
  none: 'No reservation',
})

// The colour token each status reads in: a quote is still waiting on someone,
// back order and the dead ends are warnings, the office's working states are
// accent, and money received onwards is settled.
export const STATUS_TONE = Object.freeze({
  quote_requested: 'muted',
  quote_sent: 'muted',
  quote_accepted: 'muted',
  quote_rejected: 'muted',
  back_order: 'clay',
  processing: 'accent',
  pending_payment: 'accent',
  paid: 'sage',
  shipped: 'sage',
  completed: 'sage',
  cancelled: 'clay',
  refunded: 'clay',
})

// Every move the API accepts, keyed by the status it starts from — a copy of
// ALLOWED_TRANSITIONS in atelier-api src/orders/order-states.js.
export const ALLOWED_TRANSITIONS = Object.freeze({
  quote_requested: Object.freeze(['quote_sent', 'back_order', 'processing', 'pending_payment', 'cancelled']),
  quote_sent: Object.freeze(['quote_accepted', 'quote_rejected', 'quote_requested', 'back_order', 'cancelled']),
  quote_accepted: Object.freeze(['back_order', 'processing', 'pending_payment', 'cancelled']),
  quote_rejected: Object.freeze(['quote_sent', 'cancelled']),
  back_order: Object.freeze(['processing', 'pending_payment', 'paid', 'cancelled']),
  processing: Object.freeze(['back_order', 'pending_payment', 'paid', 'cancelled']),
  pending_payment: Object.freeze(['paid', 'back_order', 'processing', 'cancelled']),
  paid: Object.freeze(['shipped', 'refunded']),
  shipped: Object.freeze(['completed', 'refunded']),
  completed: Object.freeze(['refunded']),
  cancelled: Object.freeze([]),
  refunded: Object.freeze([]),
})

/**
 * The statuses this order can move to right now, in the machine's order. An
 * archived order offers none — restore it first, so a move is never applied
 * to something filed away.
 *
 * @param {{status?: string, archived_at?: string|null}} order
 * @returns {ReadonlyArray<string>}
 */
export function availableTargets(order) {
  if (!order || order.archived_at) return []
  return ALLOWED_TRANSITIONS[order.status] ?? []
}

// The past tense the toast reads after a move — "SO-12 — quote sent.".
export const STATUS_DONE = Object.freeze({
  quote_requested: 'reopened for pricing',
  quote_sent: 'quote sent',
  quote_accepted: 'quote marked accepted',
  quote_rejected: 'quote marked rejected',
  back_order: 'on back order',
  processing: 'processing',
  pending_payment: 'pending payment',
  paid: 'marked paid',
  shipped: 'shipped',
  completed: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
})

// The moves that ask first: both hand stock back and neither can be undone
// (the machine has no way out of either).
export const DESTRUCTIVE_TARGETS = Object.freeze(['cancelled', 'refunded'])
// The move whose letter carries the courier link.
export const NEEDS_TRACKING = 'shipped'
// The move that records the invoice reference ("Create in Xero" fills it).
export const TAKES_XERO_REF = 'pending_payment'

// Mirrors atelier-api src/orders/order-states.js — the pure leaf module the
// API's own guards read. HELD is every status but the four that settled the
// stock; lines freeze once paid.
export const HELD_STATUSES = Object.freeze(
  ORDER_STATUSES.filter((status) => !['shipped', 'completed', 'cancelled', 'refunded'].includes(status))
)
export const LINE_EDIT_STATUSES = Object.freeze(HELD_STATUSES.filter((status) => status !== 'paid'))
// The Xero push's set (and the not-invoiced report's): an unaccepted quote is
// not awaiting an invoice.
export const INVOICEABLE_STATUSES = Object.freeze([
  'quote_accepted',
  'back_order',
  'processing',
  'pending_payment',
  'paid',
  'shipped',
  'completed',
])
// Money the platform has actually taken — atelier-api src/reports/revenue-lines.js.
export const REVENUE_STATUSES = Object.freeze(['paid', 'shipped', 'completed'])

/**
 * @param {{status?: string, archived_at?: string|null}} order
 * @returns {boolean}
 */
export function canEditLines(order) {
  if (!order || order.archived_at) return false
  return LINE_EDIT_STATUSES.includes(order.status)
}

// Both mirror atelier-api's src/orders/order-states.js, the pure leaf module the
// API's own delete guard reads.
const RESERVING_KINDS = Object.freeze(['order_request', 'backorder_request', 'manual'])
const DELETABLE_STATUSES = Object.freeze([
  ...HELD_STATUSES.filter((status) => status !== 'paid'),
  'cancelled',
])

/**
 * Does this kind of order hold a stock reservation the back office manages?
 * A card checkout does not — the Stripe webhook already decremented it.
 *
 * @param {string} kind
 * @returns {boolean}
 */
export function reservesStock(kind) {
  return RESERVING_KINDS.includes(kind)
}

/**
 * May this order be deleted outright?
 *
 * Three facts refuse it. A card checkout is the record of a payment taken at
 * Stripe, whatever its status; every other kind stops being deletable once it
 * is `paid` or beyond, because money has moved; and any order with an invoice
 * in Xero is a financial record whatever its status (`cancelled` is reachable
 * after the invoice went out). What is left is a quote, an order before
 * invoicing, a cancelled one nobody invoiced, and a sales order keyed by
 * mistake — none of which destroys anything.
 *
 * An ARCHIVED order is still deletable: archiving is how a finished order leaves
 * the queue, and changing one's mind afterwards must not need a restore first.
 *
 * This mirrors the API's `orderGuard`; the API is the authority and answers a
 * refusal with a 409 the dialog renders. Duplicating it here is so staff are
 * never shown a Delete the API would refuse.
 *
 * @param {{kind?: string, status?: string, xero_invoice_id?: string|null}} order
 * @returns {boolean}
 */
export function canDeleteOrder(order) {
  if (!order) return false
  return (
    order.kind !== 'checkout' &&
    DELETABLE_STATUSES.includes(order.status) &&
    order.xero_invoice_id == null
  )
}

/**
 * Validate the edited line quantities before sending them. The API requires
 * `qty > 0` on every line and at least one line, so a blank or zero is caught
 * here with the SKU that caused it.
 *
 * @param {ReadonlyArray<{id: number, sku?: string, qty: number|string}>} lines
 * @param {Record<string|number, string>} drafts  line id -> typed quantity
 * @returns {{ok: true, lines: Array<{id: number, qty: number}>}|{ok: false, error: string}}
 */
export function parseLineEdits(lines = [], drafts = {}) {
  const parsed = []
  for (const line of lines) {
    const raw = Object.hasOwn(drafts, line.id) ? drafts[line.id] : line.qty
    const trimmed = String(raw ?? '').trim()
    const label = line.sku ?? `line ${line.id}`
    if (trimmed === '') {
      return { ok: false, error: `${label}: a quantity is required.` }
    }
    const qty = Number(trimmed)
    if (!Number.isFinite(qty)) {
      return { ok: false, error: `${label}: the quantity must be a number.` }
    }
    if (qty <= 0) {
      // Zero is not "remove the line" — the API has no line-delete, and a
      // called-off order is cancelled, not emptied.
      return { ok: false, error: `${label}: the quantity must be more than zero.` }
    }
    parsed.push({ id: line.id, qty })
  }
  if (parsed.length === 0) return { ok: false, error: 'This order has no lines to edit.' }
  return { ok: true, lines: parsed }
}

/**
 * Did any quantity actually move? The API accepts a no-op edit, but sending one
 * would re-run the reservation delta for nothing.
 *
 * @returns {boolean}
 */
export function lineEditsChanged(lines = [], parsed = []) {
  return parsed.some((edit) => {
    const original = lines.find((line) => line.id === edit.id)
    return original ? Number(original.qty) !== edit.qty : true
  })
}

// --- the line editor's draft model ----------------------------------------
//
// One shape serves both screens: the detail editor (drafts made from saved
// lines, which carry an `id`) and the create screen (drafts made from a
// catalogue search result, which do not). A draft with no `id` is a line the
// API has never seen, which is exactly what tells `buildLinePatch` to add it.

/**
 * A draft from a line the API returned. Money is shown in dollars because that
 * is what staff type; `parseDollars` converts back at the boundary.
 *
 * @param {object} line
 * @returns {object}
 */
export function draftFromLine(line = {}) {
  return {
    id: line.id,
    colourway_id: line.colourway_id,
    sku: line.sku ?? '',
    product_name: line.product_name ?? '',
    colourway_name: line.colourway_name ?? '',
    unit: line.unit ?? null,
    qty: line.qty == null ? '' : String(Number(line.qty)),
    // A storefront request's 0 is "not priced yet", not a price — so the box
    // starts empty (its placeholder says so) rather than showing 0.00 as if
    // someone had typed it. parseDraftLine reads '' back as 0, so nothing moves.
    price: Number(line.unit_price_cents) === 0 ? '' : centsToDollars(line.unit_price_cents),
    cut: line.cut_requirements ?? '',
    // Read-only, for the editor's Available column and the purchase-order
    // link: buildLinePatch never sends them.
    inventory: line.inventory ?? null,
    reserved_qty: line.reserved_qty ?? '0',
    purchase_order: line.purchase_order ?? null,
  }
}

/**
 * Mirror of the API's `unpricedLineCount` (src/orders/order-states.js): lines
 * still at $0.00. Moving to quote_sent / pending_payment / paid and the Xero
 * push refuse while it is non-zero, so Apply is disabled here rather than found
 * to 422.
 *
 * @param {Array<{unit_price_cents?: number|string}>} [lines]
 * @returns {number}
 */
export const unpricedLineCount = (lines = []) =>
  (lines ?? []).filter((line) => Number(line.unit_price_cents) === 0).length

/** The line under the disabled Apply, or '' when every line is priced. */
export const unpricedHint = (count) =>
  count > 0
    ? `Price every line first — ${count} line${count === 1 ? '' : 's'} still at $0.00.`
    : ''

/** "10 m" / "3 units" / "10" — the quantity with its inventory unit. */
export const formatQty = (qty, unit) =>
  `${Number(qty)}${unit === 'metres' ? ' m' : unit === 'units' ? ' units' : ''}`

/** A $0.00 line reads as what it is: not priced yet. */
export const formatLinePrice = (cents) =>
  Number(cents) === 0 ? 'Not priced yet' : formatCents(cents)

/**
 * The row total; an order with an unpriced line says so instead of $0.00.
 * Keyed on the LINES, not on `total_cents === 0`: a director's 100% discount
 * zeroes the total of a fully priced order, and that one is priced.
 */
export const formatOrderTotal = (order = {}) =>
  unpricedLineCount(order.lines) > 0 ? 'Not priced yet' : formatCents(order.total_cents)

/**
 * The statuses the API refuses to ENTER while a line is unpriced
 * (`PRICED_ENTRY_STATUSES` in atelier-api `src/orders/order-states.js`): a
 * quote going out, an invoice, money received. Shipping is not gated there
 * either — money is frozen from `paid` on.
 */
export const PRICED_ENTRY_STATUSES = Object.freeze(['quote_sent', 'pending_payment', 'paid'])

/** @param {string} target */
export const needsPricing = (target) => PRICED_ENTRY_STATUSES.includes(target)

/**
 * What this line could draw on right now: the colourway's free stock plus what
 * this order already holds of it (its own reservation is not competition).
 * Null when the colourway has never been stocked — or for a line not yet saved,
 * which carries no stock snapshot.
 *
 * @param {{ inventory?: {qty_available: number|string, qty_reserved: number|string}|null, reserved_qty?: number|string }} line
 * @returns {number|null}
 */
export const lineAvailable = (line = {}) =>
  line.inventory
    ? Number(line.inventory.qty_available) -
      Number(line.inventory.qty_reserved) +
      Number(line.reserved_qty ?? 0)
    : null

/**
 * Is this line short — more asked for than the stock behind it can cover? A
 * saved line with no stock row at all is short by definition (there is none to
 * cut from).
 */
export const isShortLine = (line = {}) => {
  const available = lineAvailable(line)
  return available === null ? true : available < Number(line.qty)
}

/**
 * How many of an order's lines are short on stock — the "short on stock" note
 * above the Create purchase order button.
 *
 * @param {{ lines?: Array<object> }} order
 * @returns {number}
 */
export const shortLineCount = (order = {}) => (order.lines ?? []).filter(isShortLine).length

/**
 * A draft from a catalogue search hit (`GET /admin/colourways`). The design and
 * house travel with it so the row reads as something recognisable rather than a
 * colourway id.
 *
 * @param {object} colourway
 * @param {{qty?: string, price?: string}} [defaults]
 * @returns {object}
 */
export function draftFromColourway(colourway = {}, defaults = {}) {
  return {
    id: null,
    colourway_id: colourway.id,
    sku: colourway.sku ?? '',
    product_name: colourway.product_name ?? '',
    colourway_name: colourway.name ?? '',
    brand_name: colourway.brand_name ?? '',
    qty: defaults.qty ?? '1',
    // Trade price where the catalogue knows one — staff correct it, and an empty
    // box is a price nobody has stated rather than a free line.
    price: defaults.price ?? centsToDollars(colourway.trade_price_cents ?? null),
    cut: '',
  }
}

// One draft row → the numbers the API wants, or a message naming the row. The
// SKU is what a person recognises, so every refusal leads with it.
function parseDraftLine(draft) {
  const label = draft.sku || draft.product_name || `colourway ${draft.colourway_id}`
  const qtyText = String(draft.qty ?? '').trim()
  if (qtyText === '') return { error: `${label}: a quantity is required.` }
  const qty = Number(qtyText)
  if (!Number.isFinite(qty)) return { error: `${label}: the quantity must be a number.` }
  if (qty <= 0) {
    // Zero is not "remove the line" — removal is its own action, so that a
    // mistyped quantity can never silently drop a line off the order.
    return { error: `${label}: the quantity must be more than zero.` }
  }
  const price = parseDollars(draft.price)
  if (!price.ok) return { error: `${label}: the unit price must be an amount, e.g. 129.50.` }
  return {
    qty,
    // An unpriced line is 0, which is what a storefront request already holds —
    // "not priced yet" rather than "free".
    unit_price_cents: price.value ?? 0,
    cut_requirements: blankToNull(draft.cut),
  }
}

/**
 * Diff the edited lines against the ones the API last returned, producing the
 * PATCH body — or null when nothing moved, so a no-op save is never sent (it
 * would re-run the reservation arithmetic for nothing).
 *
 * Three keys come out, each only when it has something in it: `lines` for edits
 * to saved rows, `add_lines` for drafts the API has never seen, and
 * `remove_line_ids` for saved rows the draft list no longer contains.
 *
 * @param {ReadonlyArray<object>} original  order.lines as the API returned them
 * @param {ReadonlyArray<object>} drafts
 * @returns {{ok: true, patch: object|null}|{ok: false, error: string}}
 */
export function buildLinePatch(original = [], drafts = []) {
  const lines = []
  const addLines = []
  const kept = new Set()

  for (const draft of drafts) {
    const parsed = parseDraftLine(draft)
    if (parsed.error) return { ok: false, error: parsed.error }

    if (draft.id == null) {
      addLines.push({ colourway_id: draft.colourway_id, ...parsed })
      continue
    }
    kept.add(draft.id)
    const before = original.find((line) => line.id === draft.id)
    if (!before) {
      // The row was removed under us (another screen, another person). Send it
      // as an edit anyway and let the API's 422 say so, rather than guessing.
      lines.push({ id: draft.id, ...parsed })
      continue
    }
    const changed = {}
    if (Number(before.qty) !== parsed.qty) changed.qty = parsed.qty
    if (Number(before.unit_price_cents) !== parsed.unit_price_cents) {
      changed.unit_price_cents = parsed.unit_price_cents
    }
    if ((before.cut_requirements ?? null) !== parsed.cut_requirements) {
      changed.cut_requirements = parsed.cut_requirements
    }
    if (Object.keys(changed).length > 0) lines.push({ id: draft.id, ...changed })
  }

  const removeLineIds = original
    .filter((line) => !kept.has(line.id))
    .map((line) => line.id)

  if (drafts.length === 0 || removeLineIds.length === original.length) {
    if (addLines.length === 0) {
      // The API refuses this too (422); saying so here saves the round trip and
      // names the action that IS right.
      return { ok: false, error: 'An order cannot be left with no lines. Cancel it instead.' }
    }
  }

  const patch = {}
  if (lines.length > 0) patch.lines = lines
  if (addLines.length > 0) patch.add_lines = addLines
  if (removeLineIds.length > 0) patch.remove_line_ids = removeLineIds
  return { ok: true, patch: Object.keys(patch).length > 0 ? patch : null }
}

/**
 * The create body for `POST /admin/orders`: every line, no diffing, since there
 * is no prior order to compare against.
 *
 * @param {ReadonlyArray<object>} drafts
 * @returns {{ok: true, lines: object[]}|{ok: false, error: string}}
 */
export function buildCreateLines(drafts = []) {
  if (drafts.length === 0) return { ok: false, error: 'Add at least one line.' }
  const lines = []
  for (const draft of drafts) {
    const parsed = parseDraftLine(draft)
    if (parsed.error) return { ok: false, error: parsed.error }
    lines.push({ colourway_id: draft.colourway_id, ...parsed })
  }
  return { ok: true, lines }
}

/**
 * What the draft lines come to, in cents — the running subtotal the editor shows
 * before anything is saved. Unparseable rows contribute nothing rather than NaN;
 * the save is where a bad row is named.
 *
 * @param {ReadonlyArray<object>} drafts
 * @returns {number}
 */
export function draftSubtotalCents(drafts = []) {
  return drafts.reduce((total, draft) => {
    const qty = Number(String(draft.qty ?? '').trim())
    const price = parseDollars(draft.price)
    if (!Number.isFinite(qty) || !price.ok) return total
    return total + Math.round(qty * (price.value ?? 0))
  }, 0)
}

/**
 * Integer cents → a NZ money string. Order totals are always NZD (the storefront
 * charges in one currency), so no currency argument is needed here.
 *
 * @param {number|string|null|undefined} cents
 * @returns {string}
 */
export function formatCents(cents) {
  if (cents == null) return '—'
  const amount = Number(cents) / 100
  if (!Number.isFinite(amount)) return '—'
  return `$${amount.toLocaleString('en-NZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// The client's name as the API packs it into `orders.notes` — `Name: X` on the
// first line, the shape `buildNotes` writes on BOTH order paths. Most clients
// on the roster carry no login and about half carry no email, so without this
// the name the office picked the order for is on the record and nowhere on the
// screen: half the queue read "No contact recorded".
const PACKED_NAME = /^Name: (.+?)(?: \| |$)/m

/**
 * Who an order is for: the account's own name (or its email when the account is
 * nameless), then the name packed into the notes, then the guest email.
 * `Account #<id>` is the last resort for a row whose account has since been
 * deleted — orders.user_id is SET NULL, so that should not survive, but a stale
 * payload must still say something.
 *
 * @param {{client_name?: string|null, client_email?: string|null, notes?: string|null, guest_email?: string|null, user_id?: number|null}} order
 * @returns {string}
 */
export function contactLabel(order = {}) {
  if (order.client_name) return order.client_name
  if (order.client_email) return order.client_email
  const packed = typeof order.notes === 'string' ? PACKED_NAME.exec(order.notes) : null
  if (packed) return packed[1].trim()
  if (order.guest_email) return order.guest_email
  if (order.user_id != null) return `Account #${order.user_id}`
  return 'No contact recorded'
}
