// Pure logic for the Xero screen and the order screen's push button — kept out
// of the JSX so it tests without a DOM (the house pattern).

import { INVOICEABLE_STATUSES } from '../admin/orderFlow.js'

// The API's status shape: { configured, connected, grant_type, org_name,
// tenant_id }. An unconfigured API answers { configured: false, connected:
// false } and every action route 503s.

// The statuses the API's pushOrderInvoice will accept — its INVOICEABLE_STATUSES
// (quote_accepted → completed; mirrored in ../admin/orderFlow.js). An
// unaccepted quote is not awaiting an invoice and a cancelled order never will
// be; `paid` and beyond stay in because a card checkout arrives paid and must
// still be invoiceable. The push moves an order it can to pending_payment.
const PUSHABLE_STATUSES = INVOICEABLE_STATUSES

/**
 * Whether the orders screen offers "Create invoice in Xero" for this order.
 * A pushed order never offers twice: xero_invoice_id is the API's own
 * duplicate gate.
 */
export const canPushToXero = (order, status) =>
  Boolean(
    status?.configured &&
      status?.connected &&
      order &&
      (!order.xero_invoice_id || isDeadInXero(order.xero_invoice_status)) &&
      PUSHABLE_STATUSES.includes(order.status)
  )

/** Xero has voided or deleted the pushed copy: the API allows a fresh push. */
export const isDeadInXero = (xeroStatus) => xeroStatus === 'VOIDED' || xeroStatus === 'DELETED'

// The purchase-order statuses the API's pushPurchaseOrderBill accepts: the
// order has gone to the house. A draft is a plan; a cancelled one never was.
const BILLABLE_STATUSES = Object.freeze(['sent', 'closed'])

/** Whether the purchase-order screen offers "Create bill in Xero". */
export const canPushBillToXero = (purchaseOrder, status) =>
  Boolean(
    status?.configured &&
      status?.connected &&
      purchaseOrder &&
      (!purchaseOrder.xero_bill_id || isDeadInXero(purchaseOrder.xero_bill_status)) &&
      BILLABLE_STATUSES.includes(purchaseOrder.status)
  )

const XERO_STATUS_WORDS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'awaiting approval',
  AUTHORISED: 'awaiting payment',
  PAID: 'paid',
  VOIDED: 'voided',
  DELETED: 'deleted',
})

/** Xero's status word for a pushed invoice or bill, as a phrase. '' when none. */
export const xeroStatusLabel = (xeroStatus) =>
  xeroStatus ? `${XERO_STATUS_WORDS[xeroStatus] ?? xeroStatus} in Xero` : ''

/**
 * The ?connected=1/0&reason=… query the API's OAuth callback redirects back
 * with. Returns { outcome: 'connected' | 'failed', reason } or null when the
 * screen was opened normally. `search` is location.search (HashRouter keeps
 * the query inside the hash, and react-router still surfaces it there).
 */
export const parseXeroReturn = (search) => {
  const params = new URLSearchParams(search || '')
  const connected = params.get('connected')
  if (connected === null) return null
  if (connected === '1') return { outcome: 'connected', reason: null }
  return { outcome: 'failed', reason: params.get('reason') || null }
}

/** "Linked 3 · created 2 · 1 failed" — the contacts sync result as one line. */
export const describeContactSync = (result) => {
  if (!result) return ''
  const bits = [`linked ${result.linked ?? 0}`, `created ${result.created ?? 0}`]
  const failed = result.failed?.length ?? 0
  if (failed > 0) bits.push(`${failed} failed`)
  return bits.join(' · ')
}

/** "Pushed 214 · 3 failed" — the items sync result as one line. */
export const describeItemSync = (result) => {
  if (!result) return ''
  const bits = [`pushed ${result.pushed ?? 0}`]
  const failed = result.failed?.length ?? 0
  if (failed > 0) bits.push(`${failed} failed`)
  return bits.join(' · ')
}

const countBits = (counts, keys) =>
  keys.filter((k) => (counts?.[k] ?? 0) > 0).map((k) => `${k} ${counts[k]}`).join(', ')

/** "12 seen · clients updated 3, linked 1 · suppliers created 1 · 4 skipped" */
export const describePullContacts = (result) => {
  if (!result) return ''
  const bits = [`${result.seen ?? 0} seen`]
  const companies = countBits(result.companies, ['updated', 'linked', 'created'])
  const suppliers = countBits(result.suppliers, ['updated', 'linked', 'created'])
  const people = countBits(result.people, ['updated'])
  if (companies) bits.push(`clients ${companies}`)
  if (suppliers) bits.push(`suppliers ${suppliers}`)
  if (people) bits.push(`people ${people}`)
  if ((result.skipped ?? 0) > 0) bits.push(`${result.skipped} skipped`)
  const failed = result.failed?.length ?? 0
  if (failed > 0) bits.push(`${failed} failed`)
  return bits.join(' · ')
}

/** "invoices checked 5, updated 2, marked paid AT-1 · bills checked 2, updated 1" */
export const describePullStatuses = (result) => {
  if (!result) return ''
  const side = (label, r, extra = []) => {
    const bits = [`checked ${r?.checked ?? 0}`, `updated ${r?.updated ?? 0}`, ...extra]
    const failed = r?.failed?.length ?? 0
    if (failed > 0) bits.push(`${failed} failed`)
    return `${label} ${bits.join(', ')}`
  }
  const paid = (result.invoices?.orders_marked_paid ?? []).map((o) => o.order_number)
  return [
    side('invoices', result.invoices, paid.length ? [`marked paid ${paid.join(' ')}`] : []),
    side('bills', result.bills),
  ].join(' · ')
}

/**
 * The per-row failure list a sync answers with, capped for display. Each row
 * is { key, message } whatever the sync direction called its identifier.
 */
export const syncFailures = (result, cap = 8) => {
  const failures = (result?.failed ?? []).map((f) => ({
    key: f.key ?? f.email ?? f.sku ?? '?',
    message: f.message ?? '',
  }))
  return {
    shown: failures.slice(0, cap),
    more: Math.max(0, failures.length - cap),
  }
}
