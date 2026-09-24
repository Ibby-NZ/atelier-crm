// One purchase order — LIVE, on atelier-api. The receipting desk: what was
// ordered, what has arrived, what is still owed, and the ledger of every
// movement.
//
//   GET   /admin/purchase-orders/:id                  → { purchase_order } + receipts
//   PATCH /admin/purchase-orders/:id                  → { purchase_order }
//   POST  /admin/purchase-orders/:id/status           → { purchase_order, xero_bill? }
//         { status } — every move (24 Sep 2026): Send PO is draft → pending_payment
//   POST  /admin/purchase-orders/:id/email            → { template, sent, failed }
//         { letter: 'details'|'status' } — the Emails panel
//   POST  /admin/purchase-order-lines/:id/receipts    → { receipt, sample_register,
//                                                         purchase_order }  (201)
//   POST  /admin/xero/purchase-orders/:id/bill        → { purchase_order, bill } (201)
//   POST  /admin/xero/purchase-orders/:id/bill/sync   → { purchase_order, bill }
//
// The Xero BILL (22 Sep 2026): Send raises the purchase order in Xero as a bill
// against the supplier and answers `xero_bill` (raised, or why not — printed in
// the toast, `sentNote`). The push button is the retry, drawn only on a sent
// order with no bill while Xero is connected (`canPushBill`). Opening an order
// whose bill is unsettled re-asks Xero (`shouldSyncBill`) so "paid" reaches the
// office without a webhook; the answer is mirrored beside `status`, never into
// it — paid is a fact about the bank, not a move the office made.
//
// Sample lines (C18) render in their own section at the BOTTOM of the paper —
// the client's words — with the register tag and the price beside each. On
// receipt the API flows a priced line's value onto the register row its barcode
// names; `sample_register.unmatched` comes back when the tag is not registered,
// and is surfaced as a persistent note because the fix is a person's.
//
// **Four rules this screen exists to get right**, each from the API's own design:
//
//   · **Receipt state is DERIVED and is read, never recomputed.** `qty_received`,
//     `qty_outstanding` and `receipt_state` arrive on every line and on the
//     order, summed server-side from the append-only ledger. Nothing here adds a
//     receipt to a running total — a browser doing that answers with whichever
//     rows it happens to hold.
//   · **`completed` is not `full`.** The status pill and the received pill are
//     two different vocabularies and are drawn as two, because a purchase order
//     completed short is a decision somebody took and "Completed" alone reads
//     as "everything came in".
//   · **Over-receipt is legitimate.** The quantity box has no maximum and the
//     outstanding figure goes negative — the demo screen's `Math.min(qty, out)`
//     is the one line that had to be dropped in the port, because clamping
//     destroys exactly the discrepancy the office takes up with the house.
//   · **A receipt is never edited or deleted; a mistake is a NEGATIVE row.**
//     There is no PATCH and no DELETE on the ledger, so the box accepts a
//     negative and refuses only zero.
//
// Cost figures are finance-gated server-side and a masked one is DELETED from
// the payload rather than nulled — so the cost columns are drawn from
// `showsCost`, and a login without the grant sees the quantities without a
// blanked column implying a figure it is not being shown.
//
// Every rule is in ./adminPurchaseOrders.js; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend, safeFetch } from '../lib/api.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  inputStyle,
  messageOf,
  monoCellInput,
  monoText,
  mutedText,
  panel,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  PURCHASE_ORDER_HEADER_FIELDS,
  RECEIPT_LABELS,
  RECEIPT_TONE,
  STATUS_LABELS,
  availableMoves,
  backordersFor,
  billText,
  buildLineEdits,
  canPushBill,
  buildReceiptBody,
  canEditPurchaseOrder,
  canReceive,
  closeIntent,
  closedShort,
  costText,
  draftFromPurchaseOrderLine,
  goodsLines,
  outstandingLabel,
  purchaseOrderStatusPath,
  purchaseOrderEmailPath,
  bulkOrderRoute,
  freightText,
  moveNote,
  purchaseOrderPath,
  qtyText,
  receiptDefault,
  receiptsPath,
  receiptNote,
  salesOrdersOf,
  sampleLines,
  sampleReceiptOutcome,
  shouldSyncBill,
  showsCost,
  totalCostText,
} from './adminPurchaseOrders.js'
// The sales orders it was raised for link back to their own pages, labelled in
// the order desk's words.
import { addNotifyEmail, orderPath, removeNotifyEmail } from './adminOrders.js'
import { STATUS_LABELS as ORDER_STATUS_LABELS } from '../admin/orderFlow.js'

// The action cell holds the received pill AND the Receive button side by side,
// and a grid track is fixed: at 130px "Received in full" plus the button
// overflowed LEFT (justify-content: flex-end) straight over the unit price box.
// 210px fits the longest label with the button beside it; ACTION_CELL keeps the
// wrap as the floor, so a longer label some day drops the button under the pill
// rather than back over the column to its left.
const ACTION_COL = '210px'
const ACTION_CELL = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'center',
  paddingTop: 4,
}
const LINE_COLUMNS = `1fr 1.5fr 90px 90px 90px 110px ${ACTION_COL}`
const LINE_COLUMNS_NO_COST = `1fr 1.7fr 90px 90px 90px ${ACTION_COL}`
// The samples section trades the SKU and outstanding columns for the register
// tag: a sample is one hanger, and the barcode is what its value flows by.
const SAMPLE_COLUMNS = `150px 1.5fr 80px 80px 110px ${ACTION_COL}`
const SAMPLE_COLUMNS_NO_COST = `150px 1.7fr 80px 80px ${ACTION_COL}`
const blankReceipt = () => ({ qty: '', received_at: '', consignment_ref: '', notes: '' })
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function AdminPurchaseOrder() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [order, setOrder] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [headerDraft, setHeaderDraft] = useState({})
  const [lineDrafts, setLineDrafts] = useState([])
  // Which line's receive row is open, and what it holds.
  const [receiveFor, setReceiveFor] = useState(null)
  const [receipt, setReceipt] = useState(blankReceipt)
  // What the last receipt did to the sample register (C18). The `warning` half
  // is the actionable one — an unmatched tag means no value flowed and a person
  // has to register it — so it PERSISTS as a note rather than passing as a
  // toast, until the next receipt replaces it.
  const [sampleNote, setSampleNote] = useState(null)
  // The Emails panel's box: the address being typed, and why it was refused.
  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  // Whether the API has a live Xero connection. null while loading; the bill
  // button only renders when it says configured AND connected — the orders
  // screen's posture for the invoice button.
  const [xeroStatus, setXeroStatus] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await safeFetch('/admin/xero/status')
      if (active && data?.xero) setXeroStatus(data.xero)
    })()
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(async () => {
    const body = await apiFetch(purchaseOrderPath(id))
    setOrder(body.purchase_order ?? null)
    return body.purchase_order ?? null
  }, [id])

  // useMutation's cycle, with the DETAIL read standing in for a list reload:
  // every write answers with the whole purchase order, and re-reading it is what
  // makes the derived receipt figures true again.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this purchase order.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Re-seed both drafts from server truth whenever the order reloads — a receipt
  // re-derives every figure on it.
  useEffect(() => {
    if (!order) return
    setHeaderDraft(draftFrom(order, PURCHASE_ORDER_HEADER_FIELDS))
    setLineDrafts((order.lines ?? []).map(draftFromPurchaseOrderLine))
  }, [order])

  // Re-ask Xero about an unsettled bill once per open. Keyed on the bill id
  // (a primitive), not on `order`, or every reload would poll again. A failure
  // is silent: the screen still shows the last mirrored state.
  const billId = order?.xero_bill_id ?? null
  const billSettled = order ? !shouldSyncBill(order) : true
  useEffect(() => {
    if (!billId || billSettled) return undefined
    let active = true
    apiSend('POST', `/admin/xero/purchase-orders/${id}/bill/sync`, {})
      .then((body) => {
        if (active && body?.purchase_order) setOrder(body.purchase_order)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [id, billId, billSettled])

  if (status === 'missing') {
    return (
      <NotFound
        title="Purchase order not found"
        backTo="/admin/purchase-orders"
        backLabel="Back to purchase orders"
        message="That purchase order could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') return <PanelNote>Loading purchase order…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{loadError}</PanelNote>
  if (!order) return null

  const cost = showsCost(order)
  const columns = cost ? LINE_COLUMNS : LINE_COLUMNS_NO_COST
  const sampleColumns = cost ? SAMPLE_COLUMNS : SAMPLE_COLUMNS_NO_COST
  const editable = canEditPurchaseOrder(order)
  const moves = availableMoves(order)
  const backorders = backordersFor(order)
  // The split the client asked for by name: goods in the Lines section, samples
  // in their own section at the BOTTOM of the paper. One drafts array stays
  // aligned with order.lines, so each section finds its draft by the line's id.
  const goods = goodsLines(order.lines ?? [])
  const samples = sampleLines(order.lines ?? [])
  // What it was raised for (24 Sep 2026: "purchase order made should have a
  // link to the Sales order for it"). Empty for a stock buy.
  const salesOrders = salesOrdersOf(order.lines)
  const lineIndexOf = (line) => (order.lines ?? []).findIndex((one) => one.id === line.id)

  const setHeaderField = (key) => (event) =>
    setHeaderDraft((draft) => ({ ...draft, [key]: event.target.value }))
  const setLine = (index, patch) =>
    setLineDrafts((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const save = () => {
    const header = diffFields(order, headerDraft, PURCHASE_ORDER_HEADER_FIELDS)
    if (header.error) return setError(header.error)
    const lines = buildLineEdits(order.lines ?? [], lineDrafts)
    if (!lines.ok) return setError(lines.error)
    const body = { ...header.patch, ...(lines.lines ? { lines: lines.lines } : {}) }
    if (Object.keys(body).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', purchaseOrderPath(order.id), body), `${order.po_number} saved.`)
  }

  // Send answers `xero_bill` beside the order, and the toast says what Xero did.
  const move = (target) =>
    run(
      () => apiSend('POST', purchaseOrderStatusPath(order.id), { status: target }),
      (body) => moveNote(order.po_number, target, body)
    )

  // The Emails panel (24 Sep 2026, "email function like sales order"): the
  // purchase order's own list saves on every add and remove — the whole list,
  // which the API replaces — and the two buttons send the purchase order or
  // its status letter to the house and the list NOW.
  const addEmail = async (event) => {
    event?.preventDefault()
    const added = addNotifyEmail(order, newEmail)
    if (!added.ok) return setEmailError(added.error)
    setEmailError('')
    const email = newEmail.trim()
    const saved = await run(
      () => apiSend('PATCH', purchaseOrderPath(order.id), added.patch),
      `${email} will get every letter about ${order.po_number}.`
    )
    if (saved) setNewEmail('')
    return undefined
  }
  const removeEmail = (email) =>
    run(
      () => apiSend('PATCH', purchaseOrderPath(order.id), removeNotifyEmail(order, email)),
      `${email} will no longer get letters about ${order.po_number}.`
    )
  const sendLetter = (letter) =>
    run(
      () => apiSend('POST', purchaseOrderEmailPath(order.id), { letter }),
      (body) => `${order.po_number} — emailed to ${(body?.sent ?? []).join(', ')}.`
    )

  // Create the bill IN Xero: the API links the house to its Xero contact
  // (flagged supplier), posts an ACCPAY bill for every line at its unit
  // price, and writes the bill's identifiers back onto the order.
  const pushBill = () =>
    run(
      () => apiSend('POST', `/admin/xero/purchase-orders/${order.id}/bill`, {}),
      `${order.po_number} raised in Xero as a bill.`
    )

  const openReceive = (line) => {
    setError('')
    setReceiveFor(line.id)
    setReceipt({ ...blankReceipt(), qty: receiptDefault(line) })
  }

  const bookIn = async (line) => {
    const built = buildReceiptBody(receipt)
    if (!built.ok) return setError(built.error)
    // The response carries `sample_register` — which register rows this receipt
    // valued, and which tags matched nothing. Captured here because `run` only
    // answers true/false.
    let outcome = null
    const ok = await run(
      () =>
        apiSend('POST', receiptsPath(line.id), built.body).then((body) => {
          outcome = sampleReceiptOutcome(body)
          return body
        }),
      (body) => receiptNote(line.sku, built.body.qty, body)
    )
    if (ok) {
      setReceiveFor(null)
      setReceipt(blankReceipt())
      setSampleNote(outcome && (outcome.warning || outcome.flowed) ? outcome : null)
    }
    return undefined
  }

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Link to="/admin/purchase-orders" className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>← Back to purchase orders</Link>
            {' · live'}
          </>
        }
        title={
          <>
            <span style={{ fontFamily: font.mono, fontSize: 28 }}>{order.po_number}</span> —{' '}
            {order.brand_name}
          </>
        }
        subtitle={`Invoiced by ${order.supplier_name || 'an unnamed supplier'}${order.currency ? ` · ${order.currency}` : ''}${order.incoterm ? ` · ${order.incoterm}` : ''}`}
      />
      <SectionTabs tabs={ordersTabs} active="purchase" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        {/* Two vocabularies, two pills. `status` is what a person did; the
            receipt state is what arrived. */}
        <section style={panel}>
          <PanelHead
            label="State"
            right={
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusPill tone={order.status === 'cancelled' ? 'clay' : 'muted'}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </StatusPill>
                <StatusPill tone={RECEIPT_TONE[order.receipt_state] ?? 'muted'}>
                  {RECEIPT_LABELS[order.receipt_state] ?? order.receipt_state}
                </StatusPill>
              </span>
            }
          />
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            {closedShort(order) && (
              <PanelNote tone="danger">
                Closed short — the balance was written off as a decision, not received. The
                quantities below are what actually arrived.
              </PanelNote>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 18 }}>
              <Stat label="Ordered" value={qtyText(order.qty_ordered)} />
              <Stat label="Received" value={qtyText(order.qty_received)} />
              <Stat
                label="Outstanding"
                value={outstandingLabel(order.qty_outstanding)}
                tone={Number(order.qty_outstanding) < 0 ? c.clay : undefined}
              />
              <Stat label="Lines" value={String(order.line_count ?? 0)} />
              {cost && <Stat label="Total cost" value={totalCostText(order)} />}
              <Stat label="Raised" value={`${shortDate(order.created_at)}${order.created_by_name ? ` by ${order.created_by_name}` : ''}`} />
              <Stat
                label="Raised for"
                value={
                  salesOrders.length === 0
                    ? 'Stock buy'
                    : salesOrders.map((so) => (
                        <div key={so.id}>
                          <Link to={orderPath(so)} style={{ color: c.accent }}>
                            {so.order_number}
                          </Link>
                          {so.status && (
                            <span style={{ ...mutedText, fontFamily: font.ui, fontSize: 11.5 }}>
                              {' '}
                              · {ORDER_STATUS_LABELS[so.status] ?? so.status}
                            </span>
                          )}
                        </div>
                      ))
                }
              />
              <Stat label="Sent" value={shortDate(order.sent_at)} />
              {cost && <Stat label="Freight (est.)" value={freightText(order)} />}
              {order.bulk_order && (
                <Stat
                  label="Bulk order"
                  value={
                    <Link to={bulkOrderRoute(order.bulk_order.id)} style={{ color: c.accent }}>
                      {order.bulk_order.bulk_number}
                    </Link>
                  }
                />
              )}
              <Stat label="Paid" value={shortDate(order.paid_at)} />
              <Stat label="Xero bill" value={billText(order)} />
            </div>
            {canPushBill(order, xeroStatus) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <GhostButton tone="accent" disabled={busy || Number(order.unpriced_lines) > 0} onClick={pushBill}>
                  Create bill in Xero
                </GhostButton>
                <span style={{ ...mutedText, fontSize: 11.5 }}>
                  {Number(order.unpriced_lines) > 0
                    ? 'Price every line first — a bill carries what the house charges.'
                    : 'Raised against the supplier; paid in Xero shows here once it is.'}
                </span>
              </div>
            )}
            {moves.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {moves.map((item) => (
                  <GhostButton
                    key={item.key}
                    tone={item.tone}
                    disabled={busy}
                    onClick={() => move(item.target)}
                  >
                    {item.label}
                  </GhostButton>
                ))}
                <span style={{ ...mutedText, fontSize: 11.5 }}>
                  {order.status === 'draft'
                    ? 'Send PO emails the purchase order to the house and raises its bill in Xero. Cancelling releases every sales-order line this covers back to the order desk.'
                    : moves.some((item) => item.target === 'completed')
                      ? closeIntent(order)
                      : 'Mark paid once the house is paid — the Xero bill sync does it itself. The last line booked in full marks it received.'}
                </span>
              </div>
            )}
            <ErrorLine>{error}</ErrorLine>
          </div>
        </section>

        {/* ---- who hears about this purchase order ---------------------- */}
        {/* The house gets Send PO, Paid, Cancelled and a short Completed; the
            list below gets every one of them too (24 Sep 2026, "email
            function like sales order"). The buttons send NOW. The letters
            carry prices, so only staff who can see costs change the list
            (the API answers 403 otherwise). */}
        <section style={panel}>
          <PanelHead label="Emails" />
          <div style={{ padding: 20, display: 'grid', gap: 12, maxWidth: 640 }}>
            <div style={{ ...mutedText, lineHeight: 1.7 }}>
              <span style={{ color: c.ink }}>The house</span>
              <div style={{ ...monoText, overflowWrap: 'anywhere' }}>
                {order.po_email ?? (
                  <span style={{ ...mutedText, fontStyle: 'italic' }}>No PO email on file — add one under The paper.</span>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6, paddingTop: 10, borderTop: `1px solid ${c.line}` }}>
              <span style={{ ...mutedText, color: c.ink }}>Also email</span>
              {(order.notify_emails ?? []).length === 0 && (
                <div style={{ ...mutedText, fontStyle: 'italic' }}>Nobody else yet.</div>
              )}
              {(order.notify_emails ?? []).map((address) => (
                <div key={address} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ ...monoText, overflowWrap: 'anywhere', minWidth: 0 }}>{address}</span>
                  {cost && editable && (
                    <GhostButton disabled={busy} onClick={() => removeEmail(address)} aria-label={`Remove ${address}`}>
                      Remove
                    </GhostButton>
                  )}
                </div>
              ))}
              {cost && editable && (
                <form onSubmit={addEmail} noValidate style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    type="email"
                    value={newEmail}
                    disabled={busy}
                    maxLength={254}
                    onChange={(e) => {
                      setNewEmail(e.target.value)
                      if (emailError) setEmailError('')
                    }}
                    aria-label="Add an email address"
                    placeholder="name@company.co.nz"
                    style={{ ...inputStyle, fontFamily: font.mono, flex: 1, minWidth: 0 }}
                  />
                  <GhostButton type="submit" tone="accent" disabled={busy}>
                    Add
                  </GhostButton>
                </form>
              )}
              {!cost && (
                <div style={{ ...mutedText, fontSize: 12 }}>
                  These letters carry prices, so only staff who can see costs change this list.
                </div>
              )}
              <ErrorLine>{emailError}</ErrorLine>
            </div>
            {order.status !== 'draft' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: `1px solid ${c.line}` }}>
                <GhostButton disabled={busy} onClick={() => sendLetter('details')}>
                  Email the purchase order
                </GhostButton>
                <GhostButton disabled={busy} onClick={() => sendLetter('status')}>
                  Resend status email
                </GhostButton>
              </div>
            )}
          </div>
        </section>

        <section style={panel}>
          <PanelHead
            label="Lines"
            right={
              editable && (
                <GhostButton tone="accent" disabled={busy} onClick={save}>
                  Save changes
                </GhostButton>
              )
            }
          />
          <HeaderRow
            columns={columns}
            labels={
              cost
                ? ['SKU', 'Design', 'Ordered', 'Received', 'Outstanding', 'Unit price', '']
                : ['SKU', 'Design', 'Ordered', 'Received', 'Outstanding', '']
            }
          />
          {goods.length === 0 && <PanelNote>This purchase order has no goods lines.</PanelNote>}
          {goods.map((line) => {
            const index = lineIndexOf(line)
            const draft = lineDrafts[index] ?? draftFromPurchaseOrderLine(line)
            const open = receiveFor === line.id
            const lineOrders = salesOrdersOf([line])
            return (
              <div key={line.id}>
                <Row columns={columns} style={{ alignItems: 'start' }}>
                  <span style={{ ...monoText, paddingTop: 9, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {line.sku}
                  </span>
                  <span style={{ minWidth: 0, paddingTop: 9 }}>
                    <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {line.product_name}
                    </span>
                    <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                      {line.colourway_name} ·{' '}
                      {lineOrders.length === 0
                        ? 'stock buy'
                        : lineOrders.map((so, i) => (
                            <span key={so.id}>
                              {i === 0 ? 'for ' : ', '}
                              <Link to={orderPath(so)} style={{ color: c.accent }}>
                                {so.order_number}
                              </Link>
                            </span>
                          ))}
                    </span>
                  </span>
                  {editable ? (
                    <input
                      value={draft.qty_ordered}
                      disabled={busy}
                      inputMode="decimal"
                      onChange={(e) => setLine(index, { qty_ordered: e.target.value })}
                      aria-label={`Ordered quantity for ${line.sku}`}
                      style={monoCellInput}
                    />
                  ) : (
                    <span style={{ ...monoText, paddingTop: 9 }}>{qtyText(line.qty_ordered)}</span>
                  )}
                  <span style={{ ...monoText, paddingTop: 9 }}>{qtyText(line.qty_received)}</span>
                  <span
                    style={{
                      ...monoText,
                      paddingTop: 9,
                      color: Number(line.qty_outstanding) < 0 ? c.clay : Number(line.qty_outstanding) > 0 ? c.inkSoft : c.sage,
                    }}
                  >
                    {outstandingLabel(line.qty_outstanding)}
                  </span>
                  {cost &&
                    (editable ? (
                      <input
                        value={draft.unit_price ?? ''}
                        disabled={busy}
                        inputMode="decimal"
                        placeholder="Not priced"
                        onChange={(e) => setLine(index, { unit_price: e.target.value })}
                        aria-label={`Unit price for ${line.sku}`}
                        style={monoCellInput}
                      />
                    ) : (
                      <span style={{ ...monoText, paddingTop: 9 }}>
                        {costText(line.unit_price, order.currency)}
                      </span>
                    ))}
                  <span style={ACTION_CELL}>
                    <StatusPill tone={RECEIPT_TONE[line.receipt_state] ?? 'muted'}>
                      {RECEIPT_LABELS[line.receipt_state] ?? line.receipt_state}
                    </StatusPill>
                    {canReceive(order) && !open && (
                      <GhostButton disabled={busy} onClick={() => openReceive(line)}>
                        Receive
                      </GhostButton>
                    )}
                  </span>
                </Row>

                {open && (
                  <ReceiveBlock
                    line={line}
                    receipt={receipt}
                    setReceipt={setReceipt}
                    busy={busy}
                    error={error}
                    onBook={() => bookIn(line)}
                    onCancel={() => {
                      setReceiveFor(null)
                      setReceipt(blankReceipt())
                    }}
                  />
                )}

                <ReceiptLedger receipts={line.receipts} />
              </div>
            )
          })}
        </section>

        {editable && (
          <section style={panel}>
            <PanelHead label="The paper" />
            <div style={{ padding: 20, display: 'grid', gap: 16 }}>
              <span style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                These were taken from the supplier when the order was raised and are a SNAPSHOT:
                correcting them fixes this document, and re-pointing the house at another
                distributor never rewrites it.
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <Field label="Expected">
                  <input
                    type="date"
                    value={(headerDraft.expected_at ?? '').slice(0, 10)}
                    disabled={busy}
                    onChange={(e) => setHeaderDraft((d) => ({ ...d, expected_at: e.target.value }))}
                    aria-label="Expected date"
                    style={inputStyle}
                  />
                </Field>
                <Field label="PO email" hint="A wrong address means the order reaches nobody.">
                  <input
                    value={headerDraft.po_email ?? ''}
                    disabled={busy}
                    onChange={setHeaderField('po_email')}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Agent">
                  <input
                    value={headerDraft.agent ?? ''}
                    disabled={busy}
                    onChange={setHeaderField('agent')}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Incoterm">
                  <input
                    value={headerDraft.incoterm ?? ''}
                    disabled={busy}
                    onChange={setHeaderField('incoterm')}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Currency" hint="The supplier's invoicing currency.">
                  <input
                    value={headerDraft.currency ?? ''}
                    disabled={busy}
                    onChange={setHeaderField('currency')}
                    placeholder="EUR"
                    style={{ ...inputStyle, fontFamily: font.mono }}
                  />
                </Field>
                <Field label="Notes">
                  <input
                    value={headerDraft.notes ?? ''}
                    disabled={busy}
                    onChange={setHeaderField('notes')}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div>
                <GhostButton tone="accent" disabled={busy} onClick={save}>
                  Save changes
                </GhostButton>
              </div>
            </div>
          </section>
        )}

        <section style={panel}>
          <PanelHead label="Back orders · generated on receipt" />
          {backorders.length === 0 ? (
            <PanelNote>Nothing part-received and short.</PanelNote>
          ) : (
            backorders.map((entry) => (
              <Row key={entry.sku} columns="1fr 1.6fr 130px 1fr">
                <span style={monoText}>{entry.sku}</span>
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>{entry.design}</span>
                <span style={{ ...monoText, color: c.clay }}>{entry.qty} short</span>
                <span style={{ ...mutedText, fontSize: 11.5 }}>
                  {entry.so} · {entry.status}
                </span>
              </Row>
            ))
          )}
        </section>

        {/* The client's words for C18: "samples listed with prices at the
            bottom of POs". Receipting one flows the line's price into the
            sample register by barcode — and an unmatched tag is REPORTED here
            rather than failing silently, because the fix (register the tag,
            key the value on the sample) is a person's. */}
        {samples.length > 0 && (
          <section style={panel}>
            <PanelHead
              label="Samples"
              right={
                editable && (
                  <GhostButton tone="accent" disabled={busy} onClick={save}>
                    Save changes
                  </GhostButton>
                )
              }
            />
            <HeaderRow
              columns={sampleColumns}
              labels={
                cost
                  ? ['Barcode', 'Design', 'Ordered', 'Received', 'Unit price', '']
                  : ['Barcode', 'Design', 'Ordered', 'Received', '']
              }
            />
            {samples.map((line) => {
              const index = lineIndexOf(line)
              const draft = lineDrafts[index] ?? draftFromPurchaseOrderLine(line)
              const open = receiveFor === line.id
              return (
                <div key={line.id}>
                  <Row columns={sampleColumns} style={{ alignItems: 'start' }}>
                    {editable ? (
                      <input
                        value={draft.sample_barcode}
                        disabled={busy}
                        placeholder="No tag yet"
                        onChange={(e) => setLine(index, { sample_barcode: e.target.value })}
                        aria-label={`Sample barcode for ${line.sku}`}
                        style={monoCellInput}
                      />
                    ) : (
                      <span style={{ ...monoText, paddingTop: 9 }}>
                        {line.sample_barcode || '—'}
                      </span>
                    )}
                    <span style={{ minWidth: 0, paddingTop: 9 }}>
                      <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {line.product_name}
                      </span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                        {line.colourway_name} · {line.sku}
                      </span>
                    </span>
                    {editable ? (
                      <input
                        value={draft.qty_ordered}
                        disabled={busy}
                        inputMode="decimal"
                        onChange={(e) => setLine(index, { qty_ordered: e.target.value })}
                        aria-label={`Ordered quantity for sample ${line.sku}`}
                        style={monoCellInput}
                      />
                    ) : (
                      <span style={{ ...monoText, paddingTop: 9 }}>{qtyText(line.qty_ordered)}</span>
                    )}
                    <span style={{ ...monoText, paddingTop: 9 }}>{qtyText(line.qty_received)}</span>
                    {cost &&
                      (editable ? (
                        <input
                          value={draft.unit_price ?? ''}
                          disabled={busy}
                          inputMode="decimal"
                          placeholder="Not priced"
                          onChange={(e) => setLine(index, { unit_price: e.target.value })}
                          aria-label={`Unit price for sample ${line.sku}`}
                          style={monoCellInput}
                        />
                      ) : (
                        <span style={{ ...monoText, paddingTop: 9 }}>
                          {costText(line.unit_price, order.currency)}
                        </span>
                      ))}
                    <span style={ACTION_CELL}>
                      <StatusPill tone={RECEIPT_TONE[line.receipt_state] ?? 'muted'}>
                        {RECEIPT_LABELS[line.receipt_state] ?? line.receipt_state}
                      </StatusPill>
                      {canReceive(order) && !open && (
                        <GhostButton disabled={busy} onClick={() => openReceive(line)}>
                          Receive
                        </GhostButton>
                      )}
                    </span>
                  </Row>

                  {open && (
                    <ReceiveBlock
                      line={line}
                      receipt={receipt}
                      setReceipt={setReceipt}
                      busy={busy}
                      error={error}
                      onBook={() => bookIn(line)}
                      onCancel={() => {
                        setReceiveFor(null)
                        setReceipt(blankReceipt())
                      }}
                    />
                  )}

                  <ReceiptLedger receipts={line.receipts} />
                </div>
              )
            })}
            {sampleNote?.warning && <PanelNote tone="danger">{sampleNote.warning}</PanelNote>}
            {sampleNote?.flowed && <PanelNote>{sampleNote.flowed}</PanelNote>}
            <div style={{ padding: '12px 20px', ...mutedText, fontSize: 11.5 }}>
              Receipting a priced sample writes its value onto the register row this barcode
              names — a price of 0 records a free hanger, an empty price records nothing. A tag
              that is not in the register is reported so it can be registered and valued by hand.
            </div>
          </section>
        )}

        <div style={{ ...mutedText, fontSize: 11.5 }}>
          Booking goods in adds them to stock, and a reversal takes them back off; sample lines
          move no stock. To correct a count, use{' '}
          <Link to="/admin/stock" className="ab-link" style={{ color: c.accent, textDecoration: 'none' }}>
            Manage stock
          </Link>
          .
        </div>
      </div>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: at the bottom of the screen file) ---------

// The receive-by-SKU row, ported from the demo screen — with its clamp removed.
// Over-receipt is a fact about the warehouse, and a negative is how a mistake
// is reversed. One component because goods lines and sample lines book in
// through the same door; a proper component (not a closure in the render) so
// its inputs are not remounted on every keystroke.
function ReceiveBlock({ line, receipt, setReceipt, busy, error, onBook, onCancel }) {
  return (
    <div style={{ padding: '16px 20px', background: c.surface, borderBottom: `1px solid ${c.line}`, display: 'grid', gap: 12 }}>
      <span style={sectionLabel}>Book in against {line.sku}</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Quantity" style={{ width: 120 }}>
          <input
            value={receipt.qty}
            disabled={busy}
            inputMode="decimal"
            onChange={(e) => setReceipt((r) => ({ ...r, qty: e.target.value }))}
            aria-label={`Quantity received against ${line.sku}`}
            style={{ ...monoCellInput, height: 38 }}
          />
        </Field>
        <Field label="Received" style={{ width: 160 }}>
          <input
            type="date"
            value={receipt.received_at}
            disabled={busy}
            onChange={(e) => setReceipt((r) => ({ ...r, received_at: e.target.value }))}
            aria-label="Date received"
            style={{ ...cellInput, height: 38 }}
          />
        </Field>
        <Field
          label="Consignment"
          hint="The shipment reference — it belongs on the arrival, not on the order."
          style={{ width: 200 }}
        >
          <input
            value={receipt.consignment_ref}
            disabled={busy}
            onChange={(e) => setReceipt((r) => ({ ...r, consignment_ref: e.target.value }))}
            aria-label="Consignment reference"
            style={{ ...cellInput, height: 38 }}
          />
        </Field>
        <GhostButton tone="accent" disabled={busy} onClick={onBook}>
          Book in
        </GhostButton>
        <GhostButton disabled={busy} onClick={onCancel}>
          Cancel
        </GhostButton>
      </div>
      <span style={{ ...mutedText, fontSize: 11.5 }}>
        More than was ordered is accepted — houses over-ship rolls. A mistake is
        reversed with a negative quantity, never by editing or deleting a receipt.
      </span>
      {/* A refused receipt has to be legible where it was typed; the error line
          at the top of the screen is off-screen by the time a long order is
          being booked in. */}
      <ErrorLine>{error}</ErrorLine>
    </div>
  )
}

// The append-only ledger under a line: every movement, in order, reversals in
// clay. Shared by the goods and samples sections for the same reason the
// receive block is.
function ReceiptLedger({ receipts }) {
  if ((receipts ?? []).length === 0) return null
  return (
    <div style={{ padding: '10px 20px 14px 40px', borderBottom: `1px solid ${c.line}` }}>
      {receipts.map((entry) => (
        <div key={entry.id} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...mutedText, fontSize: 11.5, padding: '3px 0' }}>
          <span style={{ ...monoText, color: entry.qty < 0 ? c.clay : c.sage }}>
            {entry.qty > 0 ? `+${entry.qty}` : entry.qty}
          </span>
          <span style={monoText}>{shortDate(entry.received_at)}</span>
          {entry.consignment_ref && <span style={monoText}>{entry.consignment_ref}</span>}
          {entry.received_by_name && <span>by {entry.received_by_name}</span>}
          {entry.notes && <span>{entry.notes}</span>}
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <span style={{ ...mutedText, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ marginTop: 5, fontFamily: font.mono, fontSize: 14, color: tone ?? c.ink }}>
        {value}
      </div>
    </div>
  )
}
