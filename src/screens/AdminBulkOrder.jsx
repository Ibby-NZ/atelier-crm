// One bulk order — the several purchase orders that went to a house in one
// letter (24 Sep 2026), and the screen they are received on.
//
//   GET  /admin/purchase-orders/bulk/:id              → { bulk_order } (members, lines, allocations)
//   POST /admin/purchase-order-lines/:id/receipts     → { receipt, stock, purchase_order } (201)
//   POST /admin/orders/:id/stock-arrived { note }     → { order, email }
//
// Receiving splits the delivery back to the sales orders it was bought for
// (bulkReceiveGroups): "separate the POs to their individual Sales orders
// again to confirm stock availability for client email". Each line is booked
// in against its own purchase order — the receipt adds it to stock, and the
// last line of a purchase order marks it Received — and once everything a
// sales order is waiting on has arrived (groupReady), "Confirm stock & email
// client" moves a back-ordered order on and tells the client. Stock buys (lines
// no sales order is waiting on) are received the same way, with no client to
// tell.
//
// Every rule is in ./adminPurchaseOrders.js; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import {
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  monoCellInput,
  monoText,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  RECEIPT_LABELS,
  RECEIPT_TONE,
  STATUS_LABELS,
  STATUS_TONE,
  bulkOrderPath,
  bulkReceiveGroups,
  buildReceiptBody,
  groupReady,
  purchaseOrderRoute,
  qtyText,
  receiptDefault,
  receiptNote,
  receiptsPath,
} from './adminPurchaseOrders.js'
import { orderPath } from './adminOrders.js'
import { STATUS_LABELS as ORDER_STATUS_LABELS } from '../admin/orderFlow.js'

const PO_COLUMNS = 'minmax(0, 1fr) minmax(0, 1.2fr) 150px 150px'
const LINE_COLUMNS = '110px minmax(0, 1.4fr) 90px 90px 90px 110px 160px'

export default function AdminBulkOrder() {
  const { id } = useParams()
  const { message, flash } = useToast()
  const [bulk, setBulk] = useState(null)
  const [status, setStatus] = useState('loading')
  // The quantity typed against each line, by line id — blank means the
  // outstanding balance (receiptDefault).
  const [typed, setTyped] = useState({})

  const load = useCallback(async () => {
    try {
      const body = await apiFetch(bulkOrderPath(id))
      setBulk(body.bulk_order)
      setStatus('ready')
    } catch (err) {
      setStatus(err?.status === 404 ? 'missing' : 'error')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  const bookIn = (line) => {
    const built = buildReceiptBody({ qty: typed[line.line_id] ?? receiptDefault(line) })
    if (!built.ok) return setError(built.error)
    return run(
      () => apiSend('POST', receiptsPath(line.line_id), built.body),
      (body) => receiptNote(line.sku, built.body.qty, body)
    ).then((ok) => {
      if (ok) setTyped((current) => ({ ...current, [line.line_id]: undefined }))
    })
  }

  const confirmStock = (group) =>
    run(
      () =>
        apiSend('POST', `/admin/orders/${group.order_id}/stock-arrived`, {
          note: `Stock arrived on ${bulk.bulk_number}.`,
        }),
      (body) =>
        body?.email?.sent?.length
          ? `${group.order_number} — stock confirmed; emailed ${body.email.sent.join(', ')}.`
          : `${group.order_number} — stock confirmed. Nobody was emailed (no address on the order, or email is off).`
    )

  if (status !== 'ready') {
    return (
      <div>
        <PageHeader eyebrow={<Link to="/admin/purchase-orders/bulk">← Bulk orders</Link>} title="Bulk order" />
        <SectionTabs tabs={ordersTabs} active="bulk" />
        <section style={{ ...panel, marginTop: 16 }}>
          {status === 'loading' && <PanelNote>Loading the bulk order…</PanelNote>}
          {status === 'missing' && <PanelNote>There is no bulk order #{id}.</PanelNote>}
          {status === 'error' && <PanelNote tone="danger">Could not load this bulk order.</PanelNote>}
        </section>
      </div>
    )
  }

  const groups = bulkReceiveGroups(bulk)

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={
          <Link to="/admin/purchase-orders/bulk" className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
            ← Bulk orders
          </Link>
        }
        title={`${bulk.bulk_number} — ${bulk.supplier_name}`}
        subtitle={`Sent ${new Date(bulk.created_at).toLocaleString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${bulk.created_by_name ? ` by ${bulk.created_by_name}` : ''} · ${bulk.purchase_orders.length} purchase orders in one letter`}
      />
      <SectionTabs tabs={ordersTabs} active="bulk" />
      <ErrorLine style={{ padding: '12px 0 0' }}>{error}</ErrorLine>

      <section style={{ ...panel, marginTop: 16 }}>
        <PanelHead label="Purchase orders in this bulk order" />
        <HeaderRow columns={PO_COLUMNS} labels={['Purchase order', 'House', 'Status', 'Received']} />
        {bulk.purchase_orders.map((po) => (
          <Row key={po.id} columns={PO_COLUMNS}>
            <Link to={purchaseOrderRoute(po.id)} style={{ ...monoText, color: c.accent }}>
              {po.po_number}
            </Link>
            <span>{po.brand_name}</span>
            <span>
              <StatusPill tone={STATUS_TONE[po.status] ?? 'muted'}>{STATUS_LABELS[po.status] ?? po.status}</StatusPill>
            </span>
            <span>
              <StatusPill tone={RECEIPT_TONE[po.receipt_state] ?? 'muted'}>
                {RECEIPT_LABELS[po.receipt_state] ?? po.receipt_state}
              </StatusPill>
            </span>
          </Row>
        ))}
      </section>

      {/* ---- receiving, split back to the sales orders ------------------ */}
      {groups.map((group) => {
        const ready = groupReady(group)
        return (
          <section key={group.order_id ?? 'stock'} style={{ ...panel, marginTop: 20 }}>
            <PanelHead
              label={
                group.order_id ? (
                  <span>
                    Sales order{' '}
                    <Link to={orderPath({ id: group.order_id })} style={{ color: c.accent }}>
                      {group.order_number}
                    </Link>
                    {group.order_status && (
                      <span style={{ ...mutedText, fontSize: 11.5 }}>
                        {' '}
                        · {ORDER_STATUS_LABELS[group.order_status] ?? group.order_status}
                      </span>
                    )}
                  </span>
                ) : (
                  'Stock buys — no sales order waiting'
                )
              }
              right={
                group.order_id ? (
                  <GhostButton tone="accent" disabled={busy || !ready} onClick={() => confirmStock(group)}>
                    Confirm stock &amp; email client
                  </GhostButton>
                ) : null
              }
            />
            <HeaderRow
              columns={LINE_COLUMNS}
              labels={['Purchase order', 'Design', 'For this order', 'Ordered', 'Received', 'State', 'Book in']}
            />
            {group.lines.map((line) => (
              <Row key={`${group.order_id}-${line.line_id}`} columns={LINE_COLUMNS} style={{ alignItems: 'center' }}>
                <span style={monoText}>{line.po_number}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, color: c.ink }}>{line.product_name}</span>
                  <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                    {line.colourway_name} · {line.sku}
                  </span>
                </span>
                <span style={monoText}>{line.allocated_qty == null ? '—' : qtyText(line.allocated_qty)}</span>
                <span style={monoText}>{qtyText(line.qty_ordered)}</span>
                <span style={monoText}>{qtyText(line.qty_received)}</span>
                <span>
                  <StatusPill tone={RECEIPT_TONE[line.receipt_state] ?? 'muted'}>
                    {RECEIPT_LABELS[line.receipt_state] ?? line.receipt_state}
                  </StatusPill>
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={typed[line.line_id] ?? receiptDefault(line)}
                    disabled={busy}
                    inputMode="decimal"
                    onChange={(e) => setTyped((current) => ({ ...current, [line.line_id]: e.target.value }))}
                    aria-label={`Quantity received for ${line.sku} on ${line.po_number}`}
                    style={{ ...monoCellInput, width: 70, fontFamily: font.mono }}
                  />
                  <GhostButton disabled={busy} onClick={() => bookIn(line)}>
                    Book in
                  </GhostButton>
                </span>
              </Row>
            ))}
            {group.order_id && !ready && (
              <PanelNote>Book in every line above to confirm this client&rsquo;s stock.</PanelNote>
            )}
          </section>
        )
      })}

      <ToastLine message={message} />
    </div>
  )
}
