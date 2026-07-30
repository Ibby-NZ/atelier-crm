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

export const KIND_LABELS = Object.freeze({
  checkout: 'Card checkout',
  order_request: 'Order request',
  backorder_request: 'Backorder',
})

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
const TRANSITIONS = Object.freeze({
  requested: [
    { key: 'confirm', label: 'Confirm', tone: 'accent', needsRef: true },
    { key: 'decline', label: 'Decline', tone: 'danger' },
  ],
  confirmed: [
    { key: 'mark-paid', label: 'Mark paid', tone: 'accent' },
    { key: 'decline', label: 'Decline', tone: 'danger' },
  ],
  paid: [{ key: 'ship', label: 'Ship', tone: 'accent' }],
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

/**
 * Does this kind of order hold a stock reservation the back office manages?
 * A card checkout does not — the Stripe webhook already decremented it.
 *
 * @param {string} kind
 * @returns {boolean}
 */
export function reservesStock(kind) {
  return kind === 'order_request' || kind === 'backorder_request'
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
 * Who to contact about an order: the guest email when there is one, otherwise
 * the account it was placed under. Mirrors the API's resolveOrderRecipient.
 *
 * @param {{guest_email?: string|null, user_id?: number|null}} order
 * @returns {string}
 */
export function contactLabel(order = {}) {
  if (order.guest_email) return order.guest_email
  if (order.user_id != null) return `Account #${order.user_id}`
  return 'No contact recorded'
}
