// Pure logic for the Xero screen and the order screen's push button — kept out
// of the JSX so it tests without a DOM (the house pattern).

// The API's status shape: { configured, connected, grant_type, org_name,
// tenant_id }. An unconfigured API answers { configured: false, connected:
// false } and every action route 503s.

// The statuses the API's pushOrderInvoice will accept. It refuses `declined`
// and an order already in Xero, and nothing else — so `paid` belongs here: a
// card checkout arrives paid and never passes requested/confirmed, which left
// the one kind of order that can never be invoiced from this screen. `shipped`
// is absent only because the button lives in the "Next step" block, which a
// shipped order does not render.
const PUSHABLE_STATUSES = Object.freeze(['requested', 'confirmed', 'paid'])

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
      !order.xero_invoice_id &&
      PUSHABLE_STATUSES.includes(order.status)
  )

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

/**
 * The per-row failure list a sync answers with, capped for display. Each row
 * is { key, message } whatever the sync direction called its identifier.
 */
export const syncFailures = (result, cap = 8) => {
  const failures = (result?.failed ?? []).map((f) => ({
    key: f.email ?? f.sku ?? '?',
    message: f.message ?? '',
  }))
  return {
    shown: failures.slice(0, cap),
    more: Math.max(0, failures.length - cap),
  }
}
