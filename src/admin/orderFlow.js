// The web-order state machine, as the screen needs to see it. Pure, so which
// buttons an order offers is testable without a DOM.
//
// It mirrors atelier-api's src/orders/admin-orders.js exactly — the API is the
// authority and answers a wrong transition with a 409. Duplicating the rules
// here is not a second gate; it is so staff are never shown a door that is
// locked. If the two ever disagree, the API wins and the 409 message surfaces.
//
//   requested  --confirm--> confirmed --mark-paid--> paid --ship--> shipped
//   requested | confirmed  --decline--> declined
//
// Line quantities are editable only while requested or confirmed: after payment
// the invoice is out, and after shipping the reservation has already been
// converted into a stock decrement.
//
// The same window is what turns a storefront quote into a sales order: a request
// arrives with every line priced at 0, and pricing it in place — adding lines,
// removing them, setting unit prices — is one PATCH away from the state machine
// above. See buildLinePatch at the foot of this file.

import { blankToNull, centsToDollars, parseDollars } from './drafts.js'

export const ORDER_STATUSES = Object.freeze([
  'requested',
  'confirmed',
  'paid',
  'shipped',
  'declined',
])

export const STATUS_LABELS = Object.freeze({
  requested: 'Requested',
  confirmed: 'Confirmed',
  paid: 'Paid',
  shipped: 'Shipped',
  declined: 'Declined',
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

// The colour token each status reads in. Declined is the only warning tone;
// shipped and paid are settled, requested is still waiting on someone.
export const STATUS_TONE = Object.freeze({
  requested: 'muted',
  confirmed: 'accent',
  paid: 'sage',
  shipped: 'sage',
  declined: 'clay',
})

// Every transition the API accepts, keyed by the status it starts from.
// `needsRef` marks the one that carries a body: confirming records the Xero
// invoice reference, because invoicing is manual (no Xero API call).
// `done` is the past tense the toast reads after the press — "confirmed", not
// "confirmd"; "cancelled", not "cancel orderd". A request is DECLINED (the
// office answering no); a confirmed order is CANCELLED (an agreed order being
// called off) — one API transition, two words, because that is how the office
// says it (Userback 8367837). Both release any held stock.
const TRANSITIONS = Object.freeze({
  requested: [
    { key: 'confirm', label: 'Confirm', tone: 'accent', needsRef: true, done: 'confirmed' },
    { key: 'decline', label: 'Decline', tone: 'danger', done: 'declined' },
  ],
  confirmed: [
    { key: 'mark-paid', label: 'Mark paid', tone: 'accent', done: 'marked paid' },
    { key: 'decline', label: 'Cancel order', tone: 'danger', done: 'cancelled' },
  ],
  paid: [{ key: 'ship', label: 'Ship', tone: 'accent', done: 'shipped' }],
  shipped: [],
  declined: [],
})

/**
 * The actions this order can take right now. An archived order offers none —
 * restore it first, so a mutation is never applied to something filed away.
 *
 * @param {{status?: string, archived_at?: string|null}} order
 * @returns {ReadonlyArray<{key: string, label: string, tone: string, needsRef?: boolean}>}
 */
export function availableActions(order) {
  if (!order || order.archived_at) return []
  return TRANSITIONS[order.status] ?? []
}

/**
 * @param {{status?: string, archived_at?: string|null}} order
 * @returns {boolean}
 */
export function canEditLines(order) {
  if (!order || order.archived_at) return false
  return order.status === 'requested' || order.status === 'confirmed'
}

// Both mirror atelier-api's src/orders/order-states.js, the pure leaf module the
// API's own delete guard reads.
const RESERVING_KINDS = Object.freeze(['order_request', 'backorder_request', 'manual'])
const DELETABLE_STATUSES = Object.freeze(['requested', 'confirmed', 'declined'])

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
 * Two different facts refuse it. A card checkout is the record of a payment
 * taken at Stripe, whatever its status; every other kind stops being deletable
 * once it reaches `paid` or `shipped`, because money has moved and
 * `xero_invoice_ref` names the invoice raised against it. What is left is a
 * request nobody priced, a confirmed order before payment, a declined one, and
 * a sales order keyed by mistake — none of which destroys anything.
 *
 * An ARCHIVED order is still deletable: archiving is how a finished order leaves
 * the queue, and changing one's mind afterwards must not need a restore first.
 *
 * This mirrors the API's `orderGuard`; the API is the authority and answers a
 * refusal with a 409 the dialog renders. Duplicating it here is so staff are
 * never shown a Delete the API would refuse.
 *
 * @param {{kind?: string, status?: string}} order
 * @returns {boolean}
 */
export function canDeleteOrder(order) {
  if (!order) return false
  return order.kind !== 'checkout' && DELETABLE_STATUSES.includes(order.status)
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
      // cancelled order is declined, not emptied.
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
    qty: line.qty == null ? '' : String(Number(line.qty)),
    price: centsToDollars(line.unit_price_cents),
    cut: line.cut_requirements ?? '',
  }
}

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
      return { ok: false, error: 'An order cannot be left with no lines. Decline it instead.' }
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

/**
 * Who an order is for: the account's own name (or its email when the account is
 * nameless), otherwise the guest email. `Account #<id>` is the last resort for a
 * row whose account has since been deleted — orders.user_id is SET NULL, so that
 * should not survive, but a stale payload must still say something.
 *
 * @param {{client_name?: string|null, client_email?: string|null, guest_email?: string|null, user_id?: number|null}} order
 * @returns {string}
 */
export function contactLabel(order = {}) {
  if (order.client_name) return order.client_name
  if (order.client_email) return order.client_email
  if (order.guest_email) return order.guest_email
  if (order.user_id != null) return `Account #${order.user_id}`
  return 'No contact recorded'
}
