// Every rule behind the three supplier-invoice screens (list, new, detail).
// This repo has no jsdom, so a screen cannot be rendered in a test; anything
// that is a decision rather than a layout lives here and is tested from
// ./adminSupplierInvoices.test.js — the split adminPurchaseOrders.js already
// makes for its screens.
//
// The epic in one sentence: ONE supplier sends ONE invoice covering MANY
// purchase orders, every two to four weeks. W13 groups purchase orders by
// BRAND and one supplier sells several brands, so a bill covering two houses
// of one supplier is the ORDINARY case — nothing here treats it as an edge.
//
// **The five rules that are not cosmetic**, each taken from the API's own
// design (atelier-api src/purchasing/supplier-invoices.js) rather than
// invented here:
//
//   1. **EVERY MONEY FIGURE IS FINANCE-GATED, and a masked figure is DELETED
//      from the payload, never nulled.** So `Object.hasOwn` is the test
//      everywhere and a null check never is: `amount: null` is "attached, but
//      nobody has said how much of the bill is this purchase order" — a real
//      and common state — while an ABSENT `amount` is "you may not see this".
//      A login without the grant gets the columns not drawn at all, never
//      blanked, and the money header fields are not offered as inputs (a value
//      it cannot read is a value it must not write back).
//   2. **`unallocated_amount` and `variance` are DERIVED server-side and are
//      read, never recomputed.** They answer different questions — how far
//      through the reconciliation the office is, versus did the house bill
//      what it quoted — and the browser summing allocations itself would
//      disagree with the server's round4 the first time floats drift.
//      `variance` is legitimately null while any attached purchase order
//      carries an unpriced line (`unpriced_purchase_orders` says how many);
//      that is a missing price, not a zero discrepancy, and it is worded as
//      one.
//   3. **The unreconciled difference IS the product.** No CHECK ties
//      SUM(amount) to the total, so over- and under-allocation are both
//      storable and both DRAWN (in clay), never clamped — the screen exists to
//      show a person how much of a €48,000 bill they have accounted for.
//      `matched` is a judgement somebody makes on the PATCH, not arithmetic.
//   4. **Attach and detach are VERBS with routes of their own**, each with its
//      own refusals — the 409 naming the invoice that already holds the
//      purchase order, the 422 naming one raised for another house. The API
//      phrases both well and its sentence is surfaced verbatim. There is no
//      state machine to mirror: `received`/`matched`/`disputed` have no
//      illegal moves between them.
//   5. **`/unbilled` is a SEARCH, not a join.** A house's consolidated bill
//      may not quote Atelier's purchase-order numbers at all, so the office
//      matches by date and amount off the paper; `q` is one filter among
//      several. An amount search is finance end to end and the API answers a
//      login without the grant 403 WITH A REASON — so the amount boxes are
//      only offered where the payload already showed money, and the API's own
//      sentence stays the gate.

import { diffFields } from '../admin/drafts.js'

export const SUPPLIER_INVOICES_PATH = '/admin/supplier-invoices'

/** One place for every addressed path, so a typo is a failing test not a 404. */
export const supplierInvoicePath = (id) => `${SUPPLIER_INVOICES_PATH}/${id}`
// A static segment before `/:id` — Fastify prefers it whatever the order.
export const unbilledPath = `${SUPPLIER_INVOICES_PATH}/unbilled`
export const allocationsPath = (id) => `${supplierInvoicePath(id)}/allocations`
// Addressed by PURCHASE-ORDER id, not by the allocation row's own id: a
// purchase order is on exactly one invoice, so the pair is the identity the
// screen already holds.
export const allocationPath = (id, poId) => `${allocationsPath(id)}/${poId}`

/** The screens' routes, for links. */
export const supplierInvoiceRoute = (id) => `/admin/supplier-invoices/${id}`
export const NEW_SUPPLIER_INVOICE_ROUTE = '/admin/supplier-invoices/new'

/** Rows per page. The endpoint's own DEFAULT_LIMIT; its MAX_LIMIT is 200. */
export const SUPPLIER_INVOICE_LIST_LIMIT = 50

/** Candidates per unbilled search — a pick list, not a ledger page. */
export const UNBILLED_SEARCH_LIMIT = 20

// `supplier_invoices_status_check`, as the route spends it for its enum. No
// transitions module beside it, deliberately: `matched` is a judgement a
// person makes about a variance and an invoice goes straight back to
// `disputed` the moment somebody spots something — a spine would be a rule to
// fight rather than a rule to keep.
export const SUPPLIER_INVOICE_STATUSES = Object.freeze(['received', 'matched', 'disputed'])

export const STATUS_LABELS = Object.freeze({
  received: 'Received',
  matched: 'Matched',
  disputed: 'Disputed',
})

export const STATUS_TONE = Object.freeze({
  received: 'muted',
  matched: 'sage',
  // Not an error tone in spirit: a dispute is a fact about the paper the
  // office is taking up with the house, called out so it is not filed as done.
  disputed: 'clay',
})

const blankToNull = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// --- finance gating ---------------------------------------------------------

/**
 * Does this payload carry money figures at all?
 *
 * A login without finance visibility gets them DELETED from the response
 * rather than nulled, precisely so a reader can tell "not permitted" from "not
 * stated". So the test is `Object.hasOwn`, never a null check — and
 * `total_amount` is the sentinel because the API builds every money key
 * together or none of them.
 *
 * @param {object} [invoice]
 * @returns {boolean}
 */
export function showsMoney(invoice = {}) {
  return Object.hasOwn(invoice, 'total_amount')
}

/** The list-wide gate: any row carrying money means this login sees it. */
export function listShowsMoney(rows = []) {
  return rows.some((row) => showsMoney(row))
}

// One sentence under a masked list, so the missing columns are announced
// rather than left looking like the table is complete — the rule the report
// library's mask note already states.
export const MASKED_MONEY_NOTE =
  'Money figures are not shown on your access — totals, allocation amounts and ' +
  'the variance are finance-gated. The bills themselves are still navigable.'

// --- money display ----------------------------------------------------------

/**
 * An amount in the invoice's own currency — NOT cents. Supplier invoices are
 * numeric(12,4) exactly as purchase-order prices are: foreign, fractional and
 * unconverted, and treating €48.0000 as 48 cents is a mistake nothing in the
 * schema objects to.
 *
 * `null` prints as an em dash rather than a 0, because `Number(null)` is 0 and
 * a zero reads as an answer ("stated as nil") the data never gave.
 *
 * @param {number|string|null|undefined} amount
 * @param {string|null} [currency]
 * @returns {string}
 */
export function moneyText(amount, currency = null) {
  if (amount == null || amount === '') return '—'
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  const figure = value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return currency ? `${figure} ${currency}` : figure
}

/**
 * An allocation's stated amount. NULL is "attached, but nobody has said how
 * much of the total is this one" — the ordinary half-done state a consolidated
 * bill arrives in — and it is worded as that, never as zero. A figure the
 * login may not see never reaches here (the key is absent and the column is
 * not drawn).
 */
export function allocationAmountText(allocation = {}, currency = null) {
  if (!Object.hasOwn(allocation, 'amount')) return ''
  return allocation.amount == null ? 'Not stated' : moneyText(allocation.amount, currency)
}

/**
 * A purchase order's own costed total, or why there is not one. The API sends
 * `purchase_order_cost: null` while any line is unpriced — a cost over a
 * partly-priced order reads as the cost of the whole thing while describing
 * part of it — with `unpriced_lines` beside it so the reader can tell "€0"
 * from "nobody has priced this".
 */
export function poCostText(row = {}, currency = null) {
  const key = Object.hasOwn(row, 'purchase_order_cost')
    ? 'purchase_order_cost'
    : Object.hasOwn(row, 'ordered_cost')
      ? 'ordered_cost'
      : null
  if (!key) return ''
  if (row[key] != null) return moneyText(row[key], currency)
  const unpriced = Number(row.unpriced_lines) || 0
  return unpriced > 0
    ? `Not priced — ${unpriced} line${unpriced === 1 ? '' : 's'}`
    : 'Not priced'
}

/**
 * How far through the reconciliation the office is, in words. Over-allocation
 * is legal (no CHECK ties the sum to the total) and is STATED, never clamped —
 * more apportioned than the bill totals is exactly the mistake the figure
 * exists to surface.
 *
 * @param {object} [invoice]
 * @returns {string} '' where the figure was finance-gated away
 */
export function unallocatedLabel(invoice = {}) {
  if (!Object.hasOwn(invoice, 'unallocated_amount')) return ''
  const value = Number(invoice.unallocated_amount)
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return 'Fully allocated'
  if (value < 0) return `${moneyText(Math.abs(value), invoice.currency)} over-allocated`
  return `${moneyText(value, invoice.currency)} to allocate`
}

/** Clay when anything is still open either way; sage once the bill is square. */
export function unallocatedTone(invoice = {}) {
  const value = Number(invoice.unallocated_amount)
  if (!Number.isFinite(value)) return 'muted'
  return value === 0 ? 'sage' : 'clay'
}

/**
 * The commercial question — did the house bill what it quoted — in words.
 *
 * The variance is measured against the FULL total, freight and duty INCLUDED:
 * apportioning a non-line charge is a rule the client still owes (ADR 006),
 * and the two amounts travel beside the figure so a person can do the
 * subtraction themselves. `null` with attached purchase orders means a price
 * is MISSING, which is a different fact from "no discrepancy" and is worded as
 * one.
 *
 * @param {object} [invoice]
 * @returns {string} '' where the figure was finance-gated away
 */
export function varianceLabel(invoice = {}) {
  if (!Object.hasOwn(invoice, 'variance')) return ''
  if (invoice.variance == null) {
    const unpriced = Number(invoice.unpriced_purchase_orders) || 0
    return unpriced > 0
      ? `No variance yet — ${unpriced} purchase order${unpriced === 1 ? '' : 's'} unpriced`
      : '—'
  }
  const value = Number(invoice.variance)
  if (value === 0) return 'On quote'
  const figure = moneyText(Math.abs(value), invoice.currency)
  return value > 0 ? `${figure} over quote` : `${figure} under quote`
}

export function varianceTone(invoice = {}) {
  if (invoice.variance == null) return 'muted'
  return Number(invoice.variance) === 0 ? 'sage' : 'clay'
}

/**
 * The attached purchase orders, counted — with the ones carrying no stated
 * amount named beside the count. `Number(null)` is 0, so an unstated amount
 * contributes nothing to the allocated sum and would otherwise be invisible;
 * the API counts them (`unstated_allocations`) precisely so a screen can say
 * so.
 */
export function allocationCountLabel(invoice = {}) {
  const count = Number(invoice.allocation_count) || 0
  if (count === 0) return 'None attached'
  const unstated = Number(invoice.unstated_allocations) || 0
  const base = `${count} purchase order${count === 1 ? '' : 's'}`
  return unstated > 0 ? `${base} · ${unstated} unstated` : base
}

/**
 * `invoice_date` arrives as 'YYYY-MM-DD' — a calendar day, never an instant.
 * It is formatted WITHOUT a Date round trip: `new Date('2026-08-01')` parses
 * as UTC midnight, which toLocaleDateString renders as the 31st of July for
 * any reader west of Greenwich. The API went out of its way (`::text`) to keep
 * the day the paper says; a formatter must not put the shift back.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function invoiceDateText(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value.slice(0, 10))) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const name = months[Number(month) - 1]
  return name ? `${day} ${name} ${year}` : '—'
}

/**
 * An invoice's name in the delete dialog and every toast. The number is unique
 * to the house that issued it (two maisons both numbering from 1001 is
 * ordinary), so the house is what disambiguates it.
 */
export function describeSupplierInvoice(invoice = {}) {
  return [invoice.invoice_number, invoice.supplier_name].filter(Boolean).join(' — ')
}

/**
 * Whether the delete button is drawn. The API refuses the delete outright
 * while purchase orders are attached (FR-159 — the way out is to detach, which
 * is a decision about those purchase orders), so the button only appears on a
 * bill with nothing on it; the 409 stays the gate if the row moves under it.
 * There is no archive: `matched` and `disputed` already take a bill off the
 * working list AND say why.
 */
export function canDeleteInvoice(invoice = {}) {
  return (Number(invoice.allocation_count) || 0) === 0
}

// --- list filters -----------------------------------------------------------

export const EMPTY_INVOICE_SEARCH = Object.freeze({
  supplier_id: '',
  status: '',
  from: '',
  to: '',
  q: '',
})

/**
 * Filters for `GET /admin/supplier-invoices`.
 *
 * Every unset value leaves as null and buildListQuery drops it: forwarded as
 * '' the status select's "All" becomes `status=`, which the route's enum
 * answers with a 400 that kills the whole list rather than one filter.
 * `to` is INCLUSIVE server-side — `invoice_date` is a DATE, so a range ending
 * on the 31st contains an invoice dated the 31st — which is why nothing here
 * nudges the bound the way a timestamptz filter would need.
 *
 * @param {object} [state]
 * @returns {object}
 */
export function invoiceFilters(state = {}) {
  const number = (value) => {
    const id = Number(String(value ?? '').trim())
    return Number.isInteger(id) && id > 0 ? id : null
  }
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)
  return {
    supplier_id: number(state.supplier_id),
    status: text(state.status),
    from: text(state.from),
    to: text(state.to),
    q: text(state.q),
  }
}

/** Is anything narrowing this list? Decides which empty state to draw. */
export function hasInvoiceFilters(state = {}) {
  return Object.values(invoiceFilters(state)).some((value) => value !== null)
}

// --- the create form --------------------------------------------------------

export const NEW_SUPPLIER_INVOICE = Object.freeze({
  supplier_id: '',
  invoice_number: '',
  invoice_date: '',
  currency: '',
  total_amount: '',
  freight_amount: '',
  duty_amount: '',
  fx_rate: '',
  notes: '',
})

// One rule for every money box on both forms: 0 is real (a zero-value
// replacement consignment), negative is a credit note — a different document
// whose rules nobody has stated — and the API's `minimum: 0` would answer it
// with an Ajv sentence rather than this one.
function parseAmount(raw, label) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  const amount = Number(trimmed)
  if (!Number.isFinite(amount)) {
    return { ok: false, error: `${label} must be an amount, e.g. 2200.00.` }
  }
  if (amount < 0) {
    return {
      ok: false,
      error: `${label} cannot be negative — a credit against a bill is a different document.`,
    }
  }
  return { ok: true, value: amount }
}

// Recorded RAW and multiplied by nothing — the FX basis (invoice date? payment
// date? the bank's rate?) is still owed by the client, so the only thing to
// police is that a rate is a positive number.
function parseFxRate(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  const rate = Number(trimmed)
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: 'The FX rate must be more than zero, e.g. 0.5482.' }
  }
  return { ok: true, value: rate }
}

/**
 * Turn the create form into the `POST /admin/supplier-invoices` body, or name
 * what is missing.
 *
 * **`supplier_id` IS chosen here, unlike on a purchase order — that is the
 * API's own design, not a drift.** A purchase order's supplier is derived from
 * the brand; an invoice ARRIVES from a house and the house is the primary fact
 * on the paper. What replaces the derivation is the supplier agreement: every
 * purchase order attached later must belong to this house, and the attach 422s
 * naming any that does not.
 *
 * Blanks are OMITTED rather than sent as null: a blank currency is "use the
 * house's invoicing currency", which the server does on the absent key, and
 * `status` is never sent — the server files a new bill as `received`.
 *
 * @param {object} [draft]
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildInvoiceBody(draft = NEW_SUPPLIER_INVOICE) {
  const supplierId = Number(String(draft.supplier_id ?? '').trim())
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return { ok: false, error: 'Choose the house this invoice arrived from.' }
  }

  const invoiceNumber = blankToNull(draft.invoice_number)
  if (invoiceNumber == null) {
    return { ok: false, error: 'Enter the invoice number exactly as the paper states it.' }
  }

  const invoiceDate = blankToNull(draft.invoice_date)
  if (invoiceDate == null || !ISO_DATE.test(invoiceDate)) {
    return { ok: false, error: 'Enter the invoice date, e.g. 2026-08-01.' }
  }

  const total = parseAmount(draft.total_amount, 'The total')
  if (!total.ok) return { ok: false, error: total.error }
  if (total.value == null) {
    return { ok: false, error: 'Enter the invoice total — the full figure, freight and duty included.' }
  }

  const currencyText = blankToNull(draft.currency)
  let currency = null
  if (currencyText != null) {
    currency = currencyText.toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { ok: false, error: 'The currency must be a three-letter code, e.g. EUR — or blank for the house’s own.' }
    }
  }

  const freight = parseAmount(draft.freight_amount, 'Freight')
  if (!freight.ok) return { ok: false, error: freight.error }
  const duty = parseAmount(draft.duty_amount, 'Duty')
  if (!duty.ok) return { ok: false, error: duty.error }
  const fx = parseFxRate(draft.fx_rate)
  if (!fx.ok) return { ok: false, error: fx.error }
  const notes = blankToNull(draft.notes)

  return {
    ok: true,
    body: {
      supplier_id: supplierId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      total_amount: total.value,
      ...(currency ? { currency } : {}),
      ...(freight.value != null ? { freight_amount: freight.value } : {}),
      ...(duty.value != null ? { duty_amount: duty.value } : {}),
      ...(fx.value != null ? { fx_rate: fx.value } : {}),
      ...(notes ? { notes } : {}),
    },
  }
}

// --- the detail screen's header ---------------------------------------------

/**
 * The header `PATCH /admin/supplier-invoices/:id` accepts, declared once so
 * the draft is formatted and parsed by the same rule (../admin/drafts.js) —
 * split in two because the money half is finance-gated (see headerFieldsFor).
 * Mirrors the API's frozen SUPPLIER_INVOICE_UPDATE_COLUMNS: a key declared
 * here and missing there is stripped by Ajv's removeAdditional and saves
 * nothing.
 *
 * `supplier_id` is ABSENT AND MUST STAY ABSENT: moving an invoice to another
 * house would leave every already-attached purchase order belonging to the old
 * one — the supplier agreement broken retroactively by a field that looks like
 * a typo fix. An invoice keyed against the wrong house is deleted and
 * re-entered (anything attached blocks the delete, which is exactly the review
 * that should happen).
 *
 * `status` IS here rather than on a verb route, and that is the API's rule not
 * an exception to it: it writes one column of one row and dates nothing, and
 * `matched` is a judgement a person makes rather than a transition.
 */
export const SUPPLIER_INVOICE_HEADER_FIELDS = Object.freeze([
  { key: 'invoice_number', label: 'Invoice number', kind: 'text', required: true },
  { key: 'invoice_date', label: 'Invoice date', kind: 'date', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper' },
  { key: 'status', label: 'Status', kind: 'enum' },
  { key: 'notes', label: 'Notes', kind: 'text' },
])

export const SUPPLIER_INVOICE_MONEY_FIELDS = Object.freeze([
  { key: 'total_amount', label: 'Total', kind: 'decimal', required: true },
  { key: 'freight_amount', label: 'Freight', kind: 'decimal' },
  { key: 'duty_amount', label: 'Duty', kind: 'decimal' },
  { key: 'fx_rate', label: 'FX rate', kind: 'decimal' },
])

/**
 * Which fields this login's copy of the invoice can offer as inputs. The money
 * figures were DELETED from a non-finance payload, so drafting them would draw
 * four blank boxes over real figures and a save would "clear" values the
 * screen never saw — a field the login cannot read is a field it must not
 * write.
 */
export function headerFieldsFor(invoice = {}) {
  return showsMoney(invoice)
    ? [...SUPPLIER_INVOICE_HEADER_FIELDS, ...SUPPLIER_INVOICE_MONEY_FIELDS]
    : SUPPLIER_INVOICE_HEADER_FIELDS
}

/**
 * Diff the header draft against the invoice, adding the two bounds the
 * `decimal` kind cannot state: the API's schema says `minimum: 0` on the
 * amounts and `exclusiveMinimum: 0` on the rate, and letting a negative
 * through would answer with Ajv's sentence instead of one a person can act on.
 *
 * @param {object} invoice  the row as the API last returned it
 * @param {object} draft
 * @returns {{patch: object}|{error: string}}
 */
export function invoiceHeaderPatch(invoice, draft) {
  const outcome = diffFields(invoice, draft, headerFieldsFor(invoice))
  if (outcome.error) return outcome
  for (const field of SUPPLIER_INVOICE_MONEY_FIELDS) {
    if (!Object.hasOwn(outcome.patch, field.key)) continue
    const value = outcome.patch[field.key]
    if (field.key === 'fx_rate') {
      if (value != null && value <= 0) {
        return { error: 'The FX rate must be more than zero, e.g. 0.5482.' }
      }
    } else if (value != null && value < 0) {
      return {
        error: `${field.label} cannot be negative — a credit against a bill is a different document.`,
      }
    }
  }
  return outcome
}

// --- the matching search (/unbilled) ----------------------------------------

export const EMPTY_UNBILLED_SEARCH = Object.freeze({
  q: '',
  from: '',
  to: '',
  amount_min: '',
  amount_max: '',
})

/**
 * Filters for `GET /admin/supplier-invoices/unbilled`, always scoped to the
 * house whose bill is on the desk — a candidate from another supplier could
 * only earn the attach 422, so it is never offered.
 *
 * The amount bounds are two plain numbers, not a tolerance (a tolerance is a
 * policy — absolute? percentage? — nobody has settled), and they are validated
 * here so a stray letter is named before a round trip. **They are finance end
 * to end**: the API answers a bounded search from a login without the grant
 * 403 with a reason, and the screen only offers the boxes where the invoice
 * payload already carried money — but the refusal, not the hiding, is the
 * gate.
 *
 * @param {object} [state]
 * @param {number} supplierId  the invoice's own supplier
 * @returns {{ok: true, filters: object}|{ok: false, error: string}}
 */
export function buildUnbilledFilters(state = {}, supplierId) {
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)
  const min = parseAmount(state.amount_min, 'Amount from')
  if (!min.ok) return { ok: false, error: min.error }
  const max = parseAmount(state.amount_max, 'Amount to')
  if (!max.ok) return { ok: false, error: max.error }
  if (min.value != null && max.value != null && min.value > max.value) {
    return { ok: false, error: 'The amount range is inside out — "from" is more than "to".' }
  }
  return {
    ok: true,
    filters: {
      supplier_id: supplierId,
      q: text(state.q),
      from: text(state.from),
      to: text(state.to),
      amount_min: min.value,
      amount_max: max.value,
      limit: UNBILLED_SEARCH_LIMIT,
    },
  }
}

// --- attach / detach --------------------------------------------------------

/**
 * The body for `POST /admin/supplier-invoices/:id/allocations`.
 *
 * A blank amount is NULL, never 0 and never omitted-and-guessed: "attached,
 * but nobody has said how much of the total is this one" is the ordinary
 * half-done state a consolidated bill arrives in — the paper often does not
 * break its total down per purchase order at all — and 0 would state "charged
 * at nil" as a fact the office never gave.
 *
 * @param {number} purchaseOrderId
 * @param {string} [amountRaw]
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildAttachBody(purchaseOrderId, amountRaw = '') {
  const amount = parseAmount(amountRaw, 'The allocated amount')
  if (!amount.ok) return { ok: false, error: amount.error }
  return {
    ok: true,
    body: { purchase_order_id: purchaseOrderId, amount: amount.value },
  }
}

/**
 * The detach confirmation's copy. Detaching is a hard delete of the join row —
 * what makes it "an explicit act that is recorded" is that it is a route of
 * its own, and this dialog is the moment of explicitness on the screen side.
 * The stated amount goes with the row, so the dialog says so.
 *
 * @param {{po_number?: string}} [allocation]
 * @returns {{title: string, body: string, confirmLabel: string}}
 */
export function detachDialog(allocation = {}) {
  const name = allocation.po_number || 'this purchase order'
  return {
    title: `Take ${name} off this bill?`,
    body:
      'Detaching frees the purchase order for the invoice it belongs on. The allocation ' +
      'row is removed — its stated amount is not kept — and the derived figures above ' +
      'are re-read from what remains.',
    confirmLabel: 'Detach',
  }
}
