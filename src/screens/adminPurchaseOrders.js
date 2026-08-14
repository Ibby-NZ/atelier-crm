// Every rule behind the three live purchase-order screens (list, new, detail).
// This repo has no jsdom, so a screen cannot be rendered in a test; anything
// that is a decision rather than a layout lives here and is tested from
// ./adminPurchaseOrders.test.js — the split adminSuppliers.js, adminOrders.js
// and adminSamples.js already make.
//
// It mirrors atelier-api's src/purchasing/po-states.js the way ../admin/orderFlow.js
// mirrors the order state machine: the API is the authority and answers a wrong
// move with a 409, and the mirror only exists so staff are never shown a door
// that is locked.
//
// **The five rules that are not cosmetic**, each taken from the API's own design
// rather than invented here:
//
//   1. **RECEIPT STATE IS THE SERVER'S AND IS NEVER RECOMPUTED.** There is no
//      `qty_received` column; the API derives it from the append-only ledger at
//      read time and sends `qty_received`, `qty_outstanding` and `receipt_state`
//      on every line and on the order. A browser summing the receipts itself
//      would answer with whichever page it happened to hold — and would silently
//      disagree with the very figure the office is chasing. `receiptState` and
//      `rollUpReceiptState` are deliberately NOT ported.
//   2. **`closed` IS NOT `full`.** `status` is what a person did (draft / sent /
//      closed / cancelled); the receipt state is what arrived. A purchase order
//      closed short because the house discontinued the balance is a DECISION,
//      and drawing "Closed" where the office reads "everything came in" is the
//      one mistake this screen can make that costs money. So both are printed,
//      and `closedShort` names the disagreement out loud.
//   3. **OVER-RECEIPT IS LEGITIMATE AND IS NEVER CLAMPED.** Suppliers over-ship
//      rolls. `qty_outstanding` is legitimately negative and the receipt box has
//      no maximum — the demo screen's `Math.min(q, out)` is exactly the line
//      that had to be dropped in the port.
//   4. **A RECEIPT IS APPEND-ONLY: a mistake is reversed with a NEGATIVE row.**
//      There is no PATCH and no DELETE on a receipt, so the quantity box accepts
//      a negative and refuses only zero (which is the database's `CHECK (qty <> 0)`).
//   5. **A HOUSE WITH NO SUPPLIER IS A 422 NAMING IT, and that fires often.**
//      `supplier_id` is derived from `brands.supplier_id` and can never be sent;
//      `backfill:suppliers` has linked a minority of houses. The refusal is
//      surfaced verbatim, the plan's `blocked` list is rendered rather than
//      dropped, and the create form marks an unlinked house in the picker from
//      the brand rows it has already fetched (which is reading what the API
//      said, not a pre-flight).
//
// Cost figures are finance-gated server-side and a masked figure is DELETED from
// the payload rather than nulled — so `unit_price` ABSENT and `unit_price: null`
// are different facts (the second is "nobody has priced this line"). Everything
// here tests with `Object.hasOwn`, never with `== null`.

import { deriveBackorders } from '../utils/backorders.js'

export const PURCHASE_ORDERS_PATH = '/admin/purchase-orders'

/** One place for every addressed path, so a typo is a failing test not a 404. */
export const purchaseOrderPath = (id) => `${PURCHASE_ORDERS_PATH}/${id}`
export const purchaseOrderMovePath = (id, verb) => `${purchaseOrderPath(id)}/${verb}`
export const planPath = `${PURCHASE_ORDERS_PATH}/plan`
export const generatePath = `${PURCHASE_ORDERS_PATH}/generate`
export const receiptsPath = (lineId) => `/admin/purchase-order-lines/${lineId}/receipts`

/** The screen's route, for the list → detail link. */
export const purchaseOrderRoute = (id) => `/admin/purchase-orders/${id}`

/** Rows per page. The endpoint's own DEFAULT_LIMIT; its MAX_LIMIT is 200. */
export const PURCHASE_ORDER_LIST_LIMIT = 50

// `purchase_orders_status_check`, as the route spends it for its `status` enum.
export const PURCHASE_ORDER_STATUSES = Object.freeze(['draft', 'sent', 'closed', 'cancelled'])

export const STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  sent: 'Sent',
  closed: 'Closed',
  cancelled: 'Cancelled',
})

export const STATUS_TONE = Object.freeze({
  draft: 'muted',
  sent: 'accent',
  closed: 'sage',
  cancelled: 'clay',
})

// The receipt vocabulary — a SECOND vocabulary, never merged with the one above.
export const RECEIPT_LABELS = Object.freeze({
  none: 'Nothing received',
  part: 'Part received',
  full: 'Received in full',
  over: 'Over-received',
})

export const RECEIPT_TONE = Object.freeze({
  none: 'muted',
  part: 'clay',
  full: 'sage',
  // Not an error tone: an over-ship is a fact about the warehouse, not a fault
  // in the data. It is called out because the office has to raise it with the
  // house, which is a different thing from being wrong.
  over: 'clay',
})

// The machine, keyed by the state being moved FROM. `closed` is reachable only
// from `sent`: closing a draft is a cancellation with the wrong word on it, and
// the two must stay distinguishable in the ledger.
const ALLOWED_TRANSITIONS = Object.freeze({
  draft: ['sent', 'cancelled'],
  sent: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
})

// One entry per verb the API exposes, so a move can never be spelled two ways.
const MOVES = Object.freeze({
  sent: { key: 'send', label: 'Mark sent', tone: 'accent' },
  closed: { key: 'close', label: 'Close', tone: 'ink' },
  cancelled: { key: 'cancel', label: 'Cancel', tone: 'danger' },
})

/**
 * The moves this purchase order can make right now.
 *
 * @param {{status?: string}} [purchaseOrder]
 * @returns {ReadonlyArray<{key: string, label: string, tone: string, target: string}>}
 */
export function availableMoves(purchaseOrder = {}) {
  const targets = ALLOWED_TRANSITIONS[purchaseOrder.status] ?? []
  return targets.map((target) => ({ ...MOVES[target], target }))
}

/**
 * What closing this purchase order means, in words, before it is done. Closing
 * short is legitimate and common — the house discontinued the balance — but it
 * is a decision, so the button says which decision is being taken.
 *
 * @param {{qty_outstanding?: number, receipt_state?: string}} [purchaseOrder]
 * @returns {string}
 */
export function closeIntent(purchaseOrder = {}) {
  return purchaseOrder.receipt_state === 'full'
    ? 'Everything ordered has arrived — closing files the order.'
    : 'Closing SHORT: the balance stops being expected, and the sales orders it ' +
        'covers keep their claim on it (cancelling is what hands demand back).'
}

/**
 * A closed purchase order that never came in full. Two facts that ordinarily
 * disagree, and the reason `closed` is not stored as `full`.
 *
 * @param {{status?: string, receipt_state?: string}} [purchaseOrder]
 * @returns {boolean}
 */
export function closedShort(purchaseOrder = {}) {
  return purchaseOrder.status === 'closed' && purchaseOrder.receipt_state !== 'full'
}

/**
 * Whether a purchase order may be deleted. The API's registry answers
 * authoritatively with a 409 carrying its blockers — a receipt or an allocation
 * each refuse — and `purchase_order` is `archivable: false`, so a refusal offers
 * Cancel alone. Anything already sent has a paper trail, so the button is only
 * drawn on a draft; the 409 stays the gate if the row moves under it.
 *
 * @param {{status?: string, qty_received?: number}} [purchaseOrder]
 * @returns {boolean}
 */
export function canDeletePurchaseOrder(purchaseOrder = {}) {
  return purchaseOrder.status === 'draft' && !(Number(purchaseOrder.qty_received) > 0)
}

/**
 * Whether this purchase order still takes receipts. Only `cancelled` is refused
 * — its demand went back to the order desk — and `draft` is deliberately
 * allowed, because plenty of orders are placed by phone and written up after the
 * rolls turn up.
 *
 * @param {{status?: string}} [purchaseOrder]
 * @returns {boolean}
 */
export function canReceive(purchaseOrder = {}) {
  return purchaseOrder.status !== 'cancelled'
}

/** The API refuses a PATCH on a cancelled order: that document is closed. */
export function canEditPurchaseOrder(purchaseOrder = {}) {
  return purchaseOrder.status !== 'cancelled'
}

/**
 * Does this payload carry cost figures at all?
 *
 * A login without finance visibility gets them DELETED from the response rather
 * than nulled, precisely so a reader can tell "not permitted" from "not priced".
 * So the test is `Object.hasOwn`, never a null check — `unit_price: null` is a
 * line nobody has priced and must still draw its (empty) column.
 *
 * @param {object} [purchaseOrder]
 * @returns {boolean}
 */
export function showsCost(purchaseOrder = {}) {
  if (Object.hasOwn(purchaseOrder, 'total_cost')) return true
  return (purchaseOrder.lines ?? []).some((line) => Object.hasOwn(line, 'unit_price'))
}

// --- filters ---------------------------------------------------------------

export const EMPTY_PURCHASE_ORDER_SEARCH = Object.freeze({
  status: '',
  brand_id: '',
  supplier_id: '',
  from: '',
  to: '',
})

/**
 * Filters for `GET /admin/purchase-orders`.
 *
 * Every unset value leaves as null and buildListQuery drops it: forwarded as ''
 * the status select's "All" becomes `status=`, which the route's enum answers
 * with a 400 that kills the whole list rather than one filter. The two id
 * filters are integers server-side, so an empty string is a 400 there too.
 *
 * @param {object} [state]
 * @returns {object}
 */
export function purchaseOrderFilters(state = {}) {
  const number = (value) => {
    const id = Number(String(value ?? '').trim())
    return Number.isInteger(id) && id > 0 ? id : null
  }
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)
  return {
    status: text(state.status),
    brand_id: number(state.brand_id),
    supplier_id: number(state.supplier_id),
    from: text(state.from),
    to: text(state.to),
  }
}

/** Is anything narrowing this list? Decides which empty state to draw. */
export function hasPurchaseOrderFilters(state = {}) {
  return Object.values(purchaseOrderFilters(state)).some((value) => value !== null)
}

// --- the create form -------------------------------------------------------

export const NEW_PURCHASE_ORDER = Object.freeze({
  brand_id: '',
  expected_at: '',
  notes: '',
})

/** A blank line, as the form holds it (every field a string). */
export const newPurchaseOrderLine = (colourway = {}) => ({
  colourway_id: colourway.id,
  sku: colourway.sku ?? '',
  product_name: colourway.product_name ?? '',
  colourway_name: colourway.name ?? '',
  qty_ordered: '1',
  // NULL, never 0. Nothing in the schema can derive a purchase price for a
  // colourway, and a zero purchase price reads as "the house gave it to us".
  unit_price: '',
  supplier_code: '',
  notes: '',
})

const blankToNull = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * One draft line → the numbers the API wants, or a message naming the row.
 *
 * `qty_ordered` is `exclusiveMinimum: 0`; `unit_price` is nullable with
 * `minimum: 0`, because 0 ("free, and we know it") and null ("nobody has priced
 * this") are different facts and `Number(null)` is 0.
 */
function parseLine(draft) {
  const label = draft.sku || draft.product_name || `colourway ${draft.colourway_id}`
  const qtyText = String(draft.qty_ordered ?? '').trim()
  if (qtyText === '') return { error: `${label}: a quantity is required.` }
  const qty = Number(qtyText)
  if (!Number.isFinite(qty)) return { error: `${label}: the quantity must be a number.` }
  if (qty <= 0) return { error: `${label}: the quantity must be more than zero.` }

  const priceText = String(draft.unit_price ?? '').trim()
  let unitPrice = null
  if (priceText !== '') {
    const price = Number(priceText)
    if (!Number.isFinite(price) || price < 0) {
      return { error: `${label}: the unit price must be an amount, e.g. 48.5000.` }
    }
    unitPrice = price
  }

  return {
    line: {
      colourway_id: draft.colourway_id,
      qty_ordered: qty,
      unit_price: unitPrice,
      supplier_code: blankToNull(draft.supplier_code),
      notes: blankToNull(draft.notes),
    },
  }
}

/**
 * Turn the create form into the `POST /admin/purchase-orders` body, or name what
 * is missing.
 *
 * **`supplier_id` is not built here and never will be.** It is derived from
 * `brands.supplier_id` server-side; a client-chosen value produces a
 * well-formed purchase order addressed to the WRONG HOUSE, and Ajv would strip
 * the key rather than reject it, so nothing would say so.
 *
 * @param {object} draft
 * @param {ReadonlyArray<object>} lines
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildPurchaseOrderBody(draft = NEW_PURCHASE_ORDER, lines = []) {
  const brandId = Number(String(draft.brand_id ?? '').trim())
  if (!Number.isInteger(brandId) || brandId <= 0) {
    return { ok: false, error: 'Choose the house this purchase order is for.' }
  }
  if (lines.length === 0) {
    return { ok: false, error: 'Add at least one line.' }
  }
  const parsed = []
  for (const draftLine of lines) {
    const outcome = parseLine(draftLine)
    if (outcome.error) return { ok: false, error: outcome.error }
    parsed.push(outcome.line)
  }
  const expected = blankToNull(draft.expected_at)
  const notes = blankToNull(draft.notes)
  return {
    ok: true,
    body: {
      brand_id: brandId,
      ...(expected ? { expected_at: expected } : {}),
      ...(notes ? { notes } : {}),
      lines: parsed,
    },
  }
}

// --- the detail screen's header --------------------------------------------

/**
 * The header `PATCH /admin/purchase-orders/:id` accepts, declared once so the
 * draft is formatted and parsed by the same rule (../admin/drafts.js). Mirrors
 * the API's frozen PURCHASE_ORDER_UPDATE_COLUMNS exactly: a key declared here
 * and missing there is stripped by Ajv's removeAdditional and saves nothing.
 *
 * `brand_id`, `supplier_id`, `po_number` and `status` are all absent, each for
 * its own reason — the first two are derived, the third is the sequence's, and
 * the fourth moves through the verb routes so the state and the stamp that dates
 * it are written together.
 *
 * The four SNAPSHOT fields ARE editable, deliberately: a wrong PO address means
 * the order reaches nobody, and correcting the paper is not the same act as
 * re-pointing the house at a new distributor (which still cannot rewrite this
 * document).
 *
 * `expected_at` is the `naive` kind, not `date`: it is a timestamptz, and
 * slicing its ISO string reads the UTC day, which is a day early under an NZ
 * session for anything stored at local midnight.
 */
export const PURCHASE_ORDER_HEADER_FIELDS = Object.freeze([
  { key: 'expected_at', label: 'Expected', kind: 'naive' },
  { key: 'po_email', label: 'PO email', kind: 'text' },
  { key: 'agent', label: 'Agent', kind: 'text' },
  { key: 'incoterm', label: 'Incoterm', kind: 'text' },
  { key: 'currency', label: 'Currency', kind: 'upper' },
  { key: 'notes', label: 'Notes', kind: 'text' },
])

/** A saved line as the detail screen edits it. Strings, because inputs are. */
export const draftFromPurchaseOrderLine = (line = {}) => ({
  id: line.id,
  sku: line.sku ?? '',
  qty_ordered: line.qty_ordered == null ? '' : String(line.qty_ordered),
  // Absent (finance-gated away) and null (unpriced) are different: the first
  // must never be rendered as an input at all, so it stays undefined here.
  unit_price: Object.hasOwn(line, 'unit_price')
    ? line.unit_price == null
      ? ''
      : String(line.unit_price)
    : undefined,
  supplier_code: line.supplier_code ?? '',
  notes: line.notes ?? '',
})

const sameText = (draftValue, saved) => blankToNull(draftValue) === (saved ?? null)

/**
 * Diff the edited lines against the ones the API last returned, producing the
 * `lines` half of a PATCH body — or null when nothing moved, because the route's
 * `anyOf` refuses a body with no recognised key and a no-op save would be a 400.
 *
 * A line the login may not price carries NO `unit_price` key in either
 * direction: the figure was deleted from the payload server-side, so sending one
 * back would be writing a number nobody on this screen can read.
 *
 * @param {ReadonlyArray<object>} saved  purchase_order.lines as the API sent them
 * @param {ReadonlyArray<object>} drafts
 * @returns {{ok: true, lines: object[]|null}|{ok: false, error: string}}
 */
export function buildLineEdits(saved = [], drafts = []) {
  const edits = []
  for (const draft of drafts) {
    const before = saved.find((line) => line.id === draft.id)
    if (!before) continue
    const label = draft.sku || `line ${draft.id}`

    const qtyText = String(draft.qty_ordered ?? '').trim()
    if (qtyText === '') return { ok: false, error: `${label}: a quantity is required.` }
    const qty = Number(qtyText)
    if (!Number.isFinite(qty)) return { ok: false, error: `${label}: the quantity must be a number.` }
    if (qty <= 0) return { ok: false, error: `${label}: the quantity must be more than zero.` }

    const change = { id: draft.id }
    if (Number(before.qty_ordered) !== qty) change.qty_ordered = qty

    if (draft.unit_price !== undefined && Object.hasOwn(before, 'unit_price')) {
      const priceText = String(draft.unit_price).trim()
      let price = null
      if (priceText !== '') {
        const parsed = Number(priceText)
        if (!Number.isFinite(parsed) || parsed < 0) {
          return { ok: false, error: `${label}: the unit price must be an amount, e.g. 48.5000.` }
        }
        price = parsed
      }
      const savedPrice = before.unit_price == null ? null : Number(before.unit_price)
      if (savedPrice !== price) change.unit_price = price
    }

    if (!sameText(draft.supplier_code, before.supplier_code)) {
      change.supplier_code = blankToNull(draft.supplier_code)
    }
    if (!sameText(draft.notes, before.notes)) {
      change.notes = blankToNull(draft.notes)
    }

    // `minProperties: 2` on a line edit: the id alone changes nothing.
    if (Object.keys(change).length > 1) edits.push(change)
  }
  return { ok: true, lines: edits.length > 0 ? edits : null }
}

/**
 * Which houses can be ordered from, and what to say about the ones that cannot.
 *
 * `supplier_id` is on the admin brand projection, so this is read from rows the
 * screen has ALREADY fetched — the distinction AdminShipping's `annotateTiers`
 * draws: reading what the API said is not a pre-flight, asking it again is.
 * A house with no supplier is still offered, because the 422 it earns names the
 * fix ("link one on the house record first") and hiding it would leave the
 * office wondering where the maison went.
 *
 * @param {ReadonlyArray<object>} brands
 * @returns {ReadonlyArray<{id: number, name: string, linked: boolean, label: string}>}
 */
export function brandOptions(brands = []) {
  return brands.map((brand) => {
    const linked = brand.supplier_id != null
    return {
      id: brand.id,
      name: brand.name,
      linked,
      label: linked ? brand.name : `${brand.name} — no supplier linked`,
    }
  })
}

/** The standing warning under the house picker, or '' when every house is linked. */
export function unlinkedBrandNote(brands = []) {
  const unlinked = brandOptions(brands).filter((option) => !option.linked).length
  if (unlinked === 0) return ''
  return (
    `${unlinked} house${unlinked === 1 ? '' : 's'} here ${unlinked === 1 ? 'has' : 'have'} no ` +
    'supplier linked. A purchase order is addressed to whoever invoices the house, so one ' +
    'of those is refused until the link is made on the Houses screen.'
  )
}

// --- the derivation (plan → generate) ---------------------------------------

/**
 * The body for `POST /admin/purchase-orders/generate` after a plan has been
 * read: exactly the houses the office just looked at, so what is raised is what
 * was previewed. A house that has become blocked in between is then a 422 naming
 * it — which is the honest answer, not a regression.
 *
 * `brand_ids` has `maxItems: 100`, so a larger plan falls back to the unfiltered
 * run (which reports its own `blocked` list rather than refusing everything).
 *
 * @param {{groups?: ReadonlyArray<{brand_id: number}>}} [plan]
 * @returns {object}
 */
export function generateBody(plan = {}) {
  const ids = (plan.groups ?? []).map((group) => group.brand_id)
  return ids.length > 0 && ids.length <= 100 ? { brand_ids: ids } : {}
}

/**
 * What the dry run found, as one sentence. `candidate_lines` is every open
 * sales-order line the derivation looked at, which is why "nothing to raise"
 * and "nothing is owed" read differently: the first can mean every candidate
 * belongs to a house with no supplier.
 *
 * @param {{groups?: ReadonlyArray<object>, blocked?: ReadonlyArray<object>, candidate_lines?: number}} [plan]
 * @returns {string}
 */
export function planSummary(plan = {}) {
  const groups = plan.groups ?? []
  const blocked = plan.blocked ?? []
  const candidates = Number(plan.candidate_lines) || 0
  if (groups.length === 0 && blocked.length === 0) {
    return 'Nothing is owed to a supplier right now — every open sales-order line is already covered.'
  }
  const raised = groups.length === 0
    ? 'Nothing can be raised'
    : `${groups.length} purchase order${groups.length === 1 ? '' : 's'} would be raised`
  const houses = blocked.length > 0
    ? `, and ${blocked.length} house${blocked.length === 1 ? '' : 's'} cannot be ordered from`
    : ''
  return `${raised}${houses}, from ${candidates} open sales-order line${candidates === 1 ? '' : 's'}.`
}

/** One planned group's line, as one short line of text for the preview. */
export function planLineLabel(line = {}) {
  const orders = (line.allocations ?? []).map((allocation) => allocation.order_number)
  const unique = [...new Set(orders.filter(Boolean))]
  return unique.length > 0 ? `for ${unique.join(', ')}` : 'stock buy'
}

// --- receipting -------------------------------------------------------------

/**
 * Parse a typed receipt quantity.
 *
 * **No upper bound and no clamp.** Over-receipt is legitimate — suppliers
 * over-ship rolls — and the demo screen's `Math.min(qty, outstanding)` is
 * exactly the line that destroys the discrepancy the office has to take up with
 * the house. **Negative is legal too**: the ledger is append-only, so reversing
 * a mistaken 42 is a −42 row rather than an edit. Only zero is refused, which is
 * the database's own `CHECK (qty <> 0)`.
 *
 * @param {string} raw
 * @returns {{ok: true, qty: number}|{ok: false, error: string}}
 */
export function parseReceiptQty(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return { ok: false, error: 'Enter the quantity that arrived.' }
  const qty = Number(trimmed)
  if (!Number.isFinite(qty)) return { ok: false, error: 'The quantity must be a number.' }
  if (qty === 0) {
    return {
      ok: false,
      error:
        'A receipt quantity must be a non-zero number. Reverse a mistake with a negative ' +
        'quantity rather than editing or deleting the original row.',
    }
  }
  return { ok: true, qty }
}

/**
 * The body for `POST /admin/purchase-order-lines/:id/receipts`.
 *
 * A blank date is OMITTED rather than sent as null: the column is NOT NULL with
 * a `now()` default, and the API COALESCEs an explicit null to now() only
 * because it has to — sending nothing is what the default is for.
 *
 * @param {{qty?: string, received_at?: string, consignment_ref?: string, notes?: string}} draft
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildReceiptBody(draft = {}) {
  const parsed = parseReceiptQty(draft.qty)
  if (!parsed.ok) return parsed
  const received = blankToNull(draft.received_at)
  const ref = blankToNull(draft.consignment_ref)
  const notes = blankToNull(draft.notes)
  return {
    ok: true,
    body: {
      qty: parsed.qty,
      ...(received ? { received_at: received } : {}),
      ...(ref ? { consignment_ref: ref } : {}),
      ...(notes ? { notes } : {}),
    },
  }
}

/**
 * What the box is pre-filled with: the outstanding balance, or blank once the
 * line is square or over. Never a negative — a reversal is typed deliberately,
 * not offered as the default.
 *
 * @param {{qty_outstanding?: number}} [line]
 * @returns {string}
 */
export function receiptDefault(line = {}) {
  const outstanding = Number(line.qty_outstanding)
  return Number.isFinite(outstanding) && outstanding > 0 ? String(outstanding) : ''
}

/**
 * The outstanding balance in words. A NEGATIVE outstanding is an over-receipt
 * and is stated as one rather than clamped to zero: the discrepancy is the whole
 * point of the figure.
 *
 * @param {number|string|null|undefined} outstanding
 * @returns {string}
 */
export function outstandingLabel(outstanding) {
  // `Number(null)` is 0, which would print a missing figure as "square".
  if (outstanding == null || outstanding === '') return '—'
  const value = Number(outstanding)
  if (!Number.isFinite(value)) return '—'
  if (value < 0) return `${Math.abs(value)} over`
  return String(value)
}

/**
 * The lines that are part-received and still short — reusing the demo screen's
 * `deriveBackorders`, which had this arithmetic right, one line at a time so
 * each entry carries the sales orders ITS allocations name rather than one
 * whole-order origin.
 *
 * A line with nothing received is not a back order: it has not arrived at all.
 *
 * @param {object} [purchaseOrder]
 * @returns {ReadonlyArray<object>}
 */
export function backordersFor(purchaseOrder = {}) {
  return (purchaseOrder.lines ?? []).flatMap((line) =>
    deriveBackorders(
      [
        {
          sku: line.sku,
          name: line.product_name,
          ordered: Number(line.qty_ordered) || 0,
          received: Number(line.qty_received) || 0,
        },
      ],
      { so: planLineLabel(line), client: purchaseOrder.brand_name ?? '—' }
    )
  )
}

/**
 * A purchase order's name in the delete dialog and every toast. The number is
 * unique across the whole ledger; the house is what a person recognises.
 *
 * @param {{po_number?: string, brand_name?: string}} [purchaseOrder]
 * @returns {string}
 */
export function describePurchaseOrder(purchaseOrder = {}) {
  return [purchaseOrder.po_number, purchaseOrder.brand_name].filter(Boolean).join(' — ')
}

/**
 * A quantity as the screen prints it. pg hands numerics back as strings, so
 * everything here goes through Number() first; a missing figure is an em dash
 * rather than a 0, because `Number(null)` is 0 and a zero reads as an answer.
 *
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function qtyText(value) {
  if (value == null || value === '') return '—'
  const number = Number(value)
  return Number.isFinite(number) ? String(number) : '—'
}

/**
 * A cost in the supplier's own currency — NOT cents. Purchasing has no
 * integer-cents column anywhere: a purchase is foreign, fractional and
 * unconverted, and treating €48.0000 as 48 cents is a mistake nothing in the
 * schema objects to.
 *
 * `null` is "nobody has priced this" and prints as such; a figure the login may
 * not see never reaches here at all (the key is absent).
 *
 * @param {number|string|null|undefined} amount
 * @param {string|null} [currency]
 * @returns {string}
 */
export function costText(amount, currency = null) {
  if (amount == null) return 'Not priced'
  const value = Number(amount)
  if (!Number.isFinite(value)) return 'Not priced'
  const figure = value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return currency ? `${figure} ${currency}` : figure
}

/**
 * The order's total, or why there is not one. The API sends `total_cost: null`
 * with `unpriced_lines` beside it while any line is unpriced — a total over a
 * partly-priced order reads as the cost of the whole thing while describing part
 * of it.
 *
 * @param {object} [purchaseOrder]
 * @returns {string}
 */
export function totalCostText(purchaseOrder = {}) {
  if (!Object.hasOwn(purchaseOrder, 'total_cost')) return ''
  if (purchaseOrder.total_cost != null) {
    return costText(purchaseOrder.total_cost, purchaseOrder.currency)
  }
  const unpriced = Number(purchaseOrder.unpriced_lines) || 0
  return unpriced > 0
    ? `No total — ${unpriced} line${unpriced === 1 ? '' : 's'} unpriced`
    : 'No total'
}
