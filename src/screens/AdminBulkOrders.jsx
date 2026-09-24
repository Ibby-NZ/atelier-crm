// The Bulk orders tab — ONE letter to a house for several purchase orders
// (24 Sep 2026: "send a single purchase order to the supplier that can contain
// different purchase orders from different client sales orders").
//
//   GET  /admin/purchase-orders?status=draft&limit=200 → the drafts, grouped here
//   POST /admin/purchase-orders/bulk { purchase_order_ids } → { bulk_order, xero_bills? } (201)
//   GET  /admin/purchase-orders/bulk                    → { bulk_orders } (the history)
//
// Ready to send: every DRAFT purchase order, grouped by its supplier
// (draftsBySupplier). Tick the ones to go together and Send bulk order: the
// house gets one letter with every line under its own PO number, each purchase
// order moves to Pending payment and gets its bill in Xero — exactly Send PO,
// for all of them at once. Receiving happens on the bulk order's own page,
// split back to the sales orders.
//
// Every rule is in ./adminPurchaseOrders.js; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { c } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useConfirmation } from '../admin/useConfirmation.js'
import {
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  messageOf,
  monoText,
  mutedText,
  panel,
  useToast,
} from '../admin/parts.jsx'
import {
  BULK_ORDERS_PATH,
  PURCHASE_ORDERS_PATH,
  STATUS_LABELS,
  STATUS_TONE,
  bulkOrderRoute,
  draftsBySupplier,
  purchaseOrderRoute,
  salesOrdersOf,
  showsCost,
  totalCostText,
} from './adminPurchaseOrders.js'

const DRAFT_COLUMNS = '32px minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 1.2fr) 80px 120px'
const DRAFT_COLUMNS_NO_COST = '32px minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 1.2fr) 80px'
const SENT_COLUMNS = 'minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.6fr) 110px'
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function AdminBulkOrders() {
  const navigate = useNavigate()
  const confirmation = useConfirmation()
  const { message, flash } = useToast()
  const [groups, setGroups] = useState(null)
  const [sent, setSent] = useState(null)
  // Which drafts are ticked, per supplier: every draft starts ticked.
  const [unticked, setUnticked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [drafts, history] = await Promise.all([
        apiFetch(`${PURCHASE_ORDERS_PATH}?status=draft&limit=200`),
        apiFetch(BULK_ORDERS_PATH),
      ])
      setGroups(draftsBySupplier(drafts.purchase_orders ?? []))
      setSent(history.bulk_orders ?? [])
    } catch (err) {
      setError(messageOf(err, 'Could not load the bulk orders.'))
      setGroups([])
      setSent([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (id) =>
    setUnticked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const sendGroup = async (group) => {
    const chosen = group.purchase_orders.filter((po) => !unticked.has(po.id))
    if (chosen.length === 0) return setError('Tick at least one purchase order to send.')
    const ok = await confirmation.ask({
      title: `Send ${chosen.length} purchase order${chosen.length === 1 ? '' : 's'} to ${group.supplier_name}?`,
      body:
        `One letter with every line goes to ${group.po_email ?? 'the house (no PO email on file)'}. ` +
        'Each purchase order moves to Pending payment and gets its bill in Xero.',
      confirmLabel: 'Send bulk order',
      confirmTone: 'ink',
    })
    if (!ok) return undefined
    setBusy(true)
    setError('')
    try {
      const body = await apiSend('POST', BULK_ORDERS_PATH, {
        purchase_order_ids: chosen.map((po) => po.id),
      })
      flash(`${body.bulk_order.bulk_number} sent to ${group.supplier_name}.`)
      navigate(bulkOrderRoute(body.bulk_order.id))
    } catch (err) {
      setError(messageOf(err, 'The bulk order was not sent.'))
      await load()
    } finally {
      setBusy(false)
    }
    return undefined
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow="Orders · live"
        title="Bulk orders"
        subtitle="Send a supplier several purchase orders in one letter, then receive them back against each sales order."
      />
      <SectionTabs tabs={ordersTabs} active="bulk" />
      <ErrorLine style={{ padding: '12px 0 0' }}>{error}</ErrorLine>

      <section style={{ ...panel, marginTop: 16 }}>
        <PanelHead label="Ready to send — drafts by supplier" />
        {groups === null && <PanelNote>Loading the drafts…</PanelNote>}
        {groups !== null && groups.length === 0 && (
          <PanelNote>No draft purchase orders. Raise some from a sales order, or under Purchase orders.</PanelNote>
        )}
        {(groups ?? []).map((group) => {
          // Costs only for finance, as on the purchase order itself.
          const cost = group.purchase_orders.some(showsCost)
          const columns = cost ? DRAFT_COLUMNS : DRAFT_COLUMNS_NO_COST
          return (
            <div key={group.supplier_id} style={{ borderTop: `1px solid ${c.line}` }}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, color: c.ink, fontWeight: 600 }}>{group.supplier_name}</span>
                <span style={{ ...mutedText, fontSize: 12 }}>{group.po_email ?? 'No PO email on file'}</span>
                <span style={{ flex: 1 }} />
                <GhostButton tone="accent" disabled={busy} onClick={() => sendGroup(group)}>
                  Send bulk order
                </GhostButton>
              </div>
              <HeaderRow
                columns={columns}
                labels={['', 'Purchase order', 'House', 'Raised for', 'Lines', ...(cost ? ['Total'] : [])]}
              />
              {group.purchase_orders.map((po) => {
                const orders = salesOrdersOf(po.lines)
                return (
                  <Row key={po.id} columns={columns}>
                    <input
                      type="checkbox"
                      checked={!unticked.has(po.id)}
                      disabled={busy}
                      onChange={() => toggle(po.id)}
                      aria-label={`Include ${po.po_number}`}
                    />
                    <Link to={purchaseOrderRoute(po.id)} style={{ ...monoText, color: c.accent }}>
                      {po.po_number}
                    </Link>
                    <span style={{ minWidth: 0 }}>{po.brand_name}</span>
                    <span style={{ ...mutedText, fontSize: 12, minWidth: 0 }}>
                      {orders.length === 0 ? 'Stock buy' : orders.map((so) => so.order_number).join(', ')}
                    </span>
                    <span style={monoText}>{po.line_count}</span>
                    {cost && <span style={monoText}>{totalCostText(po)}</span>}
                  </Row>
                )
              })}
            </div>
          )
        })}
      </section>

      <section style={{ ...panel, marginTop: 20 }}>
        <PanelHead label="Sent bulk orders" />
        {sent === null && <PanelNote>Loading…</PanelNote>}
        {sent !== null && sent.length === 0 && <PanelNote>No bulk order has been sent yet.</PanelNote>}
        {(sent ?? []).length > 0 && (
          <HeaderRow columns={SENT_COLUMNS} labels={['Bulk order', 'Supplier', 'Purchase orders', 'Sent']} />
        )}
        {(sent ?? []).map((bulk) => (
          <Row key={bulk.id} columns={SENT_COLUMNS}>
            <Link to={bulkOrderRoute(bulk.id)} style={{ ...monoText, color: c.accent }}>
              {bulk.bulk_number}
            </Link>
            <span>{bulk.supplier_name}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
              {bulk.po_numbers.map((number, index) => (
                <StatusPill key={number} tone={STATUS_TONE[bulk.statuses[index]] ?? 'muted'}>
                  {number} · {STATUS_LABELS[bulk.statuses[index]] ?? bulk.statuses[index]}
                </StatusPill>
              ))}
            </span>
            <span style={monoText}>{shortDate(bulk.created_at)}</span>
          </Row>
        ))}
      </section>

      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
