// The sample-order lifecycle, as AdminSampleOrders needs to see it. Pure, so
// which moves an order offers is testable without a DOM.
//
// It mirrors atelier-api's src/samples/sample-order-states.js — the API is the
// authority and answers a wrong transition with a 409. Duplicating the machine
// here is not a second gate; it is so staff are never shown a door that is
// locked (the same reason orderFlow.js mirrors the web-order machine). If the
// two ever disagree, the API wins and the 409 message surfaces.
//
//   requested → ordered → in_transit → received → displayed
//   anything short of a terminal state → cancelled
//
// `displayed` and `cancelled` are terminal. An abandoned request is re-raised
// as a new one, never reopened: reopening would leave `cancelled_at` stamped on
// a live order, and the whole point of one stamp per transition is that a NULL
// reads as "has not been there" without consulting `status`.
//
// A MOVE IS A VERB, NOT A STATUS PATCH. `status` is absent from the PATCH
// whitelist on both sides; `POST /admin/sample-orders/:id/transition` is the
// only way a state changes, because a move writes the state AND the stamp that
// dates it, and either alone is a row that contradicts itself.

export const SAMPLE_ORDERS_PATH = '/admin/sample-orders'

// The API pages at 200. 25 keeps the list scannable; the pager is the kit's.
export const SAMPLE_ORDER_LIST_LIMIT = 25

/** `/admin/sample-orders/12`. One place, so a typo is a failing test not a 404. */
export const sampleOrderPath = (id) => `${SAMPLE_ORDERS_PATH}/${id}`

/** The move endpoint. Body `{ status }`; the API stamps the matching column. */
export const transitionPath = (order) => `${sampleOrderPath(order?.id)}/transition`

/**
 * Which lifecycle verb a row offers. An archived order offers `restore`; a live
 * one offers `archive`. Both are POSTs to the same path shape.
 *
 * @param {{ archived_at?: string|null }} order
 * @returns {'archive'|'restore'}
 */
export const archiveVerb = (order) => (order?.archived_at ? 'restore' : 'archive')

/** The endpoint the row's toggle posts to. */
export const archiveTogglePath = (order) => `${sampleOrderPath(order?.id)}/${archiveVerb(order)}`

/**
 * The endpoint "Archive instead" posts to — ALWAYS archive. It is offered on a
 * REFUSED delete, so pointing it at the toggle would answer a request to remove
 * the row by restoring it. Same split adminCatalogue.js draws.
 */
export const archiveInsteadPath = (order) => `${sampleOrderPath(order?.id)}/archive`

// The vocabulary `sample_orders_status_check` holds — what the LIST may filter
// on, and the only states a row can be in.
export const SAMPLE_ORDER_STATUSES = Object.freeze([
  'requested',
  'ordered',
  'in_transit',
  'received',
  'displayed',
  'cancelled',
])

/**
 * The legal moves, keyed by the state being moved FROM. Byte-for-byte the map
 * `ALLOWED_TRANSITIONS` in the API's sample-order-states.js declares;
 * sampleFlow.test.js asserts the machine's internal consistency (every target
 * known, terminals empty) so a hand-edit here cannot half-change it.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['ordered', 'cancelled']),
  ordered: Object.freeze(['in_transit', 'cancelled']),
  in_transit: Object.freeze(['received', 'cancelled']),
  received: Object.freeze(['displayed', 'cancelled']),
  displayed: Object.freeze([]),
  cancelled: Object.freeze([]),
})

/**
 * The column each state stamps when it is reached. `status` answers "where is
 * it now"; the stamps answer "when did it move", which is what a showroom
 * chasing a house asks. A NULL stamp reads as "has not been there".
 */
export const STATUS_STAMPS = Object.freeze({
  requested: 'requested_at',
  ordered: 'ordered_at',
  in_transit: 'in_transit_at',
  received: 'received_at',
  displayed: 'displayed_at',
  cancelled: 'cancelled_at',
})

/**
 * The states a hard delete is still allowed from — the delete policy's "409
 * unless requested or cancelled". An order actually placed with a house is a
 * commercial record; a request nobody acted on is not. The registry's guard is
 * the enforcement; this predicate is so Delete is greyed rather than
 * discovered.
 */
export const DELETABLE_SAMPLE_ORDER_STATUSES = Object.freeze(['requested', 'cancelled'])

/**
 * @param {string} status
 * @returns {boolean}
 */
export const isDeletableStatus = (status) => DELETABLE_SAMPLE_ORDER_STATUSES.includes(status)

// The column stores lower_snake_case; nobody reads "in_transit" as a place.
export const STATUS_LABELS = Object.freeze({
  requested: 'Requested',
  ordered: 'Ordered',
  in_transit: 'In transit',
  received: 'Received',
  displayed: 'Displayed',
  cancelled: 'Cancelled',
})

export const statusLabel = (status) => STATUS_LABELS[status] ?? status ?? '—'

// The colour token each status reads in. Cancelled is the only warning tone;
// received and displayed are settled, requested is still waiting on someone.
export const STATUS_TONE = Object.freeze({
  requested: 'muted',
  ordered: 'muted',
  in_transit: 'muted',
  received: 'sage',
  displayed: 'sage',
  cancelled: 'clay',
})

export const statusTone = (status) => STATUS_TONE[status] ?? 'muted'

// How each move reads on a button. Phrased as what the person is recording, not
// where the row ends up: "Mark ordered" is a statement about the house, where
// "ordered" alone reads as an instruction to order something.
const MOVE_LABELS = Object.freeze({
  ordered: 'Mark ordered',
  in_transit: 'Mark in transit',
  received: 'Mark received',
  displayed: 'Mark displayed',
  cancelled: 'Cancel order',
})

/**
 * The moves this order can make right now, as buttons. An archived order offers
 * none — restore it first, so a mutation is never applied to something filed
 * away (the same rule orderFlow.js applies to a web order).
 *
 * @param {{ status?: string, archived_at?: string|null }} order
 * @returns {ReadonlyArray<{ key: string, label: string, tone: 'accent'|'danger' }>}
 */
export function availableMoves(order) {
  if (!order || order.archived_at) return []
  return (ALLOWED_TRANSITIONS[order.status] ?? []).map((target) => ({
    key: target,
    label: MOVE_LABELS[target] ?? `Move to "${target}"`,
    tone: target === 'cancelled' ? 'danger' : 'accent',
  }))
}

/**
 * The order's history so far: one entry per stamped transition, in machine
 * order whatever order the columns were written in. The stamp values are the
 * API's timestamps, rendered verbatim — nothing here reads a clock.
 *
 * @param {object} order
 * @returns {Array<{ key: string, label: string, at: string }>}
 */
export function stampEntries(order = {}) {
  return SAMPLE_ORDER_STATUSES.map((status) => ({
    key: status,
    label: STATUS_LABELS[status],
    at: order[STATUS_STAMPS[status]],
  })).filter((entry) => entry.at != null)
}

/**
 * The date part of an API timestamp, for the history line. A plain slice of the
 * ISO string the API sent — never a Date constructed in this browser, which
 * would re-render the stamp in the device's time zone and disagree with every
 * other reading of the same row.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export const stampDate = (value) => (typeof value === 'string' ? value.slice(0, 10) : '')

// Mirrors SAMPLE_ORDER_UPDATE_COLUMNS in atelier-api's src/samples/
// sample-orders.js — the frozen whitelist a PATCH may write. A key declared
// here and missing there is stripped by Ajv's removeAdditional before the
// handler sees it, so it would silently save nothing. `status` is deliberately
// absent: the transition endpoint is the only way a state moves.
//
// `showroom_id` is required in both directions: the column is NOT NULL — a
// request can be redirected to another showroom but never un-homed — so a
// blank must fail here rather than arrive as the null the route 400s.
export const SAMPLE_ORDER_FIELDS = Object.freeze([
  { key: 'showroom_id', label: 'Showroom', kind: 'ref', required: true },
  { key: 'colourway_id', label: 'Colourway', kind: 'ref' },
  { key: 'supplier_id', label: 'Supplier', kind: 'ref' },
  { key: 'label', label: 'Label', kind: 'text' },
  { key: 'notes', label: 'Notes', kind: 'text' },
])

export const NEW_SAMPLE_ORDER = Object.freeze({
  showroom_id: '',
  colourway_id: '',
  supplier_id: '',
  label: '',
  notes: '',
})

/**
 * The list filters, in the shape buildListQuery expects. Every optional filter
 * is passed as `value || null` so it VANISHES when unset: an "All" select
 * forwarded as an empty string would become `status=`, which the endpoint's
 * enum answers with a 400 that kills the whole list rather than one filter.
 *
 * @param {{ term?: string, status?: string, showroomId?: string|number,
 *   supplierId?: string|number, showArchived?: boolean }} [state]
 */
export function sampleOrderFilters({
  term = '',
  status = '',
  showroomId = '',
  supplierId = '',
  showArchived = false,
} = {}) {
  return {
    q: term,
    status: status || null,
    showroom_id: showroomId || null,
    supplier_id: supplierId || null,
    include_archived: showArchived || null,
  }
}

/**
 * What the order is FOR, as the row's first line. The label wins where staff
 * typed one; otherwise the design the request names. An order may name material
 * the catalogue does not hold — often exactly why it is being ordered — so a
 * row with neither is still a real request, not a broken one.
 *
 * @param {{ label?: string|null, product_name?: string|null, colourway_name?: string|null }} order
 * @returns {string}
 */
export function orderTitle(order = {}) {
  const label = typeof order.label === 'string' ? order.label.trim() : ''
  if (label !== '') return label
  const design = [order.product_name, order.colourway_name]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  if (design.length) return design.join(' — ')
  return 'Unlabelled request'
}

/** One line of catalogue identity for the row's second line. */
export function orderMeta(order = {}) {
  const parts = [order.brand_name, order.product_name, order.colourway_name]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return order.supplier_name ? `From ${order.supplier_name}` : 'Not linked to a design'
}

/**
 * The row's name in the confirm dialog. Nothing on a sample order is unique, so
 * it is named by what it is for and where it is going — the pair a person asks
 * about — rather than pretending one field identifies it.
 *
 * @returns {string|undefined}
 */
export function describeSampleOrder(order) {
  if (!order) return undefined
  const what = orderTitle(order)
  if (what === 'Unlabelled request' && !order.showroom_name) return undefined
  const where = typeof order.showroom_name === 'string' ? order.showroom_name.trim() : ''
  return where === '' ? what : `${what} for ${where}`
}
