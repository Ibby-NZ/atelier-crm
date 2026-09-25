// The Bulk purchase orders tab — ONE letter to a house for several purchase
// orders (24 Sep 2026: "send a single purchase order to the supplier that can
// contain different purchase orders from different client sales orders").
// Renamed from "Bulk orders" and given its filter bar on 25 Sep 2026.
//
//   GET  /admin/purchase-orders?status=ready_to_send&limit=200 → grouped here
//   POST /admin/purchase-orders/pdf { purchase_order_ids, document } → the PDF preview
//   POST /admin/purchase-orders/bulk { purchase_order_ids } → { bulk_order, xero_bills? } (201)
//   POST /admin/purchase-orders/statement { purchase_order_ids } → { statement }
//   GET  /admin/purchase-orders/bulk                    → { bulk_orders } (the history)
//
// Ready to send: every purchase order marked READY TO SEND (25 Sep 2026 — a
// draft is still being written), grouped by its supplier (readyBySupplier).
// Tick the ones to go together, then either button opens the PDF first:
//   - Send bulk purchase order previews the order the house will receive; its
//     Send posts the bulk — one letter with every line under its own PO number
//     and that PDF attached, each purchase order to Pending payment with its
//     bill in Xero — exactly Send PO, for all of them at once.
//   - Generate statement (beside it, 25 Sep 2026: "ask for invoice should be
//     merged with bulk purchase orders") previews the statement asking the
//     house for ONE invoice covering them; its Email statement sends it with
//     the PDF attached. It moves no status.
// Receiving happens on the bulk purchase order's own page, split back to the
// sales orders.
//
// The filter bar narrows both panels client-side (neither read takes filters).
// Both buttons only ever take the ticked purchase orders ON SCREEN: one the bar
// hides stays behind, and the group and the preview both say how many.
//
// Every rule is in ./adminPurchaseOrders.js; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import PdfPreviewDialog from '../admin/PdfPreviewDialog.jsx'
import {
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  Select,
  ToastLine,
  cellInput,
  messageOf,
  monoText,
  mutedText,
  panel,
  useToast,
} from '../admin/parts.jsx'
import {
  BULKABLE_STATUS,
  BULK_ORDERS_PATH,
  BULK_STATUS_OPTIONS,
  EMPTY_BULK_FILTERS,
  PURCHASE_ORDERS_PATH,
  PURCHASE_ORDER_PDF_PATH,
  STATEMENT_PATH,
  STATUS_LABELS,
  STATUS_TONE,
  bulkCountNote,
  bulkOrderRoute,
  bulkSupplierOptions,
  filterBulkReady,
  filterSentBulkOrders,
  hasBulkFilters,
  pdfBody,
  previewFilename,
  purchaseOrderRoute,
  readyBySupplier,
  salesOrdersOf,
  showsCost,
  showsReady,
  showsSent,
  statementBody,
  statementSentNote,
  totalCostText,
} from './adminPurchaseOrders.js'

const READY_COLUMNS = '32px minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 1.2fr) 90px 80px 120px'
const READY_COLUMNS_NO_COST = '32px minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 1.2fr) 90px 80px'
const SENT_COLUMNS = 'minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.6fr) 110px'
const filterInput = { ...cellInput, fontSize: 12.5 }
const filterGroup = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }
const countStyle = { fontFamily: font.mono, fontSize: 11, color: c.inkSoft, textAlign: 'right' }
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const orders = (count) => `${count} purchase order${count === 1 ? '' : 's'}`
const hiddenNote = (group) =>
  group.hidden > 0
    ? ` ${orders(group.hidden)} for this supplier ${group.hidden === 1 ? 'is' : 'are'} hidden by the filters and left out.`
    : ''

export default function AdminBulkOrders() {
  const navigate = useNavigate()
  const { message, flash } = useToast()
  const [groups, setGroups] = useState(null)
  const [sent, setSent] = useState(null)
  // Which purchase orders are ticked, per supplier: every one starts ticked.
  const [unticked, setUnticked] = useState(new Set())
  const [filters, setFilters] = useState(EMPTY_BULK_FILTERS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The open preview: { kind: 'bulk'|'statement', group, chosen } or null.
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')

  const load = useCallback(async () => {
    try {
      const [readyRows, history] = await Promise.all([
        apiFetch(`${PURCHASE_ORDERS_PATH}?status=${BULKABLE_STATUS}&limit=200`),
        apiFetch(BULK_ORDERS_PATH),
      ])
      setGroups(readyBySupplier(readyRows.purchase_orders ?? []))
      setSent(history.bulk_orders ?? [])
    } catch (err) {
      setError(messageOf(err, 'Could not load the bulk purchase orders.'))
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

  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }))
  const filtered = hasBulkFilters(filters)
  const visibleGroups = filterBulkReady(groups ?? [], filters)
  const visibleSent = filterSentBulkOrders(sent ?? [], filters)
  const supplierOptions = bulkSupplierOptions(groups ?? [], sent ?? [])
  const readyTotal = (groups ?? []).reduce((sum, group) => sum + group.purchase_orders.length, 0)
  const readyShown = visibleGroups.reduce((sum, group) => sum + group.purchase_orders.length, 0)

  // Either button opens the PDF first. `group` is the FILTERED group: what is
  // on screen is what goes.
  const openPreview = (kind, group) => {
    const chosen = group.purchase_orders.filter((po) => !unticked.has(po.id))
    if (chosen.length === 0) {
      return setError(
        kind === 'statement'
          ? 'Tick the purchase orders the statement should ask the house to invoice.'
          : 'Tick at least one purchase order to send.'
      )
    }
    setError('')
    setPreviewError('')
    setPreview({ kind, group, chosen })
    return undefined
  }

  const closePreview = () => {
    setPreview(null)
    setPreviewError('')
  }

  const sendBulk = async ({ group, chosen }) => {
    setBusy(true)
    setPreviewError('')
    try {
      const body = await apiSend('POST', BULK_ORDERS_PATH, {
        purchase_order_ids: chosen.map((po) => po.id),
      })
      flash(`${body.bulk_order.bulk_number} sent to ${group.supplier_name}, with its PDF attached.`)
      setPreview(null)
      navigate(bulkOrderRoute(body.bulk_order.id))
    } catch (err) {
      setPreviewError(messageOf(err, 'The bulk purchase order was not sent.'))
      await load()
    } finally {
      setBusy(false)
    }
  }

  // The statement moves no status, so the page stays; the ready purchase
  // orders are still here to send.
  const sendStatement = async ({ chosen }) => {
    const built = statementBody(chosen)
    if (!built.ok) return setPreviewError(built.error)
    setBusy(true)
    setPreviewError('')
    try {
      const body = await apiSend('POST', STATEMENT_PATH, built.body)
      flash(statementSentNote(body.statement))
      setPreview(null)
    } catch (err) {
      setPreviewError(messageOf(err, 'The statement was not sent.'))
    } finally {
      setBusy(false)
    }
    return undefined
  }

  const previewProps = preview
    ? preview.kind === 'statement'
      ? {
          title: `Statement for ${preview.group.supplier_name}`,
          body:
            `Asks ${preview.group.supplier_name} for ONE invoice covering ${orders(preview.chosen.length)} ` +
            `(${preview.chosen.map((po) => po.po_number).join(', ')}). Email statement sends it with this PDF attached ` +
            `to ${preview.group.po_email ?? 'the house (no PO email on file)'} and anyone on the purchase orders' Emails lists. ` +
            'It moves no status.' +
            hiddenNote(preview.group),
          source: { path: PURCHASE_ORDER_PDF_PATH, payload: pdfBody(preview.chosen, 'statement') },
          filename: previewFilename({
            document: 'statement',
            purchaseOrders: preview.chosen,
            supplierName: preview.group.supplier_name,
          }),
          actionLabel: 'Email statement',
          onAction: () => sendStatement(preview),
        }
      : {
          title: `Send ${orders(preview.chosen.length)} to ${preview.group.supplier_name}?`,
          body:
            `One letter with every line, and this PDF attached, goes to ${preview.group.po_email ?? 'the house (no PO email on file)'}. ` +
            'Each purchase order moves to Pending payment and gets its bill in Xero. The sent PDF carries the bulk ' +
            'purchase order number it is given on sending.' +
            hiddenNote(preview.group),
          source: { path: PURCHASE_ORDER_PDF_PATH, payload: pdfBody(preview.chosen, 'order') },
          filename: previewFilename({
            document: 'order',
            purchaseOrders: preview.chosen,
            supplierName: preview.group.supplier_name,
          }),
          actionLabel: 'Send bulk purchase order',
          onAction: () => sendBulk(preview),
        }
    : {}

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow="Orders · live"
        title="Bulk purchase orders"
        subtitle="Send a supplier several purchase orders in one letter, then receive them back against each sales order."
      />
      <SectionTabs tabs={ordersTabs} active="bulk" />
      <ErrorLine style={{ padding: '12px 0 0' }}>{error}</ErrorLine>

      <form
        onSubmit={(event) => event.preventDefault()}
        role="search"
        aria-label="Filter bulk purchase orders"
        style={{
          ...panel,
          marginTop: 16,
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          padding: '14px 20px',
          background: c.surface,
        }}
      >
        <div style={filterGroup}>
          <Field label="Search">
            <input
              type="search"
              value={filters.q}
              onChange={setFilter('q')}
              placeholder="PO, bulk number, house, sales order…"
              aria-label="Search bulk purchase orders"
              style={{ ...filterInput, width: 240 }}
            />
          </Field>
          <Field label="Supplier">
            <Select
              value={filters.supplier_id}
              onChange={setFilter('supplier_id')}
              style={{ ...filterInput, width: 180 }}
              aria-label="Filter by supplier"
            >
              <option value="">All suppliers</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={filters.status}
              onChange={setFilter('status')}
              style={{ ...filterInput, width: 'auto' }}
              aria-label="Filter by status"
            >
              <option value="">All — ready to send and sent</option>
              {BULK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={filterGroup}>
          <Field label="From">
            <input
              type="date"
              value={filters.from}
              onChange={setFilter('from')}
              style={{ ...filterInput, width: 145 }}
              aria-label="Raised or sent on or after"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={filters.to}
              onChange={setFilter('to')}
              style={{ ...filterInput, width: 145 }}
              aria-label="Raised or sent on or before"
            />
          </Field>
          {filtered && (
            <div style={{ display: 'flex', alignItems: 'center', minHeight: 34 }}>
              <GhostButton onClick={() => setFilters(EMPTY_BULK_FILTERS)}>Clear</GhostButton>
            </div>
          )}
        </div>
      </form>

      {showsReady(filters) && (
        <section style={{ ...panel, marginTop: 16 }}>
          <PanelHead
            label="Ready to send — by supplier"
            right={groups !== null && <span style={countStyle}>{bulkCountNote(readyShown, readyTotal, filters)}</span>}
          />
          {groups === null && <PanelNote>Loading the purchase orders ready to send…</PanelNote>}
          {groups !== null && readyTotal === 0 && (
            <PanelNote>
              No purchase order is ready to send. Open a draft under Purchase orders and mark it Ready to send —
              it appears here, grouped with the others for its supplier.
            </PanelNote>
          )}
          {groups !== null && readyTotal > 0 && visibleGroups.length === 0 && (
            <PanelNote>No purchase order ready to send matches those filters.</PanelNote>
          )}
          {visibleGroups.map((group) => {
            // Costs only for finance, as on the purchase order itself.
            const cost = group.purchase_orders.some(showsCost)
            const columns = cost ? READY_COLUMNS : READY_COLUMNS_NO_COST
            return (
              <div key={group.supplier_id} style={{ borderTop: `1px solid ${c.line}` }}>
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, color: c.ink, fontWeight: 600 }}>{group.supplier_name}</span>
                  <span style={{ ...mutedText, fontSize: 12 }}>{group.po_email ?? 'No PO email on file'}</span>
                  {group.hidden > 0 && (
                    <span style={{ ...mutedText, fontSize: 12 }}>
                      {orders(group.hidden)} hidden by the filters — left out
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {/* Both open the PDF first; nothing goes until its Send. */}
                  <GhostButton disabled={busy} onClick={() => openPreview('statement', group)}>
                    Generate statement
                  </GhostButton>
                  <GhostButton tone="accent" disabled={busy} onClick={() => openPreview('bulk', group)}>
                    Send bulk purchase order
                  </GhostButton>
                </div>
                <HeaderRow
                  columns={columns}
                  labels={['', 'Purchase order', 'House', 'Raised for', 'Raised', 'Lines', ...(cost ? ['Total'] : [])]}
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
                      <span style={monoText}>{shortDate(po.created_at)}</span>
                      <span style={monoText}>{po.line_count}</span>
                      {cost && <span style={monoText}>{totalCostText(po)}</span>}
                    </Row>
                  )
                })}
              </div>
            )
          })}
        </section>
      )}

      {showsSent(filters) && (
        <section style={{ ...panel, marginTop: 20 }}>
          <PanelHead
            label="Sent bulk purchase orders"
            right={sent !== null && <span style={countStyle}>{bulkCountNote(visibleSent.length, sent.length, filters)}</span>}
          />
          {sent === null && <PanelNote>Loading…</PanelNote>}
          {sent !== null && sent.length === 0 && <PanelNote>No bulk purchase order has been sent yet.</PanelNote>}
          {sent !== null && sent.length > 0 && visibleSent.length === 0 && (
            <PanelNote>No sent bulk purchase order matches those filters.</PanelNote>
          )}
          {visibleSent.length > 0 && (
            <HeaderRow columns={SENT_COLUMNS} labels={['Bulk purchase order', 'Supplier', 'Purchase orders', 'Sent']} />
          )}
          {visibleSent.map((bulk) => (
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
      )}

      <PdfPreviewDialog
        open={preview !== null}
        {...previewProps}
        busy={busy}
        error={previewError}
        onClose={closePreview}
      />
      <ToastLine message={message} />
    </div>
  )
}
