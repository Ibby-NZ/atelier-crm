// Web orders — the live queue from atelier-api's /admin/orders. These are the
// orders the storefront actually took: card checkouts recorded by the Stripe
// webhook, and fabric/backorder requests waiting for someone to cut and invoice.
//
//   GET   /admin/orders?status=&include_archived=  → { orders }
//   PATCH /admin/orders/:id                        → { order }   (line quantities)
//   POST  /admin/orders/:id/confirm                → { order }   (+ xero_invoice_ref)
//   POST  /admin/orders/:id/mark-paid|ship|decline → { order }
//   POST  /admin/orders/:id/archive|restore        → { order }
//
// The state machine and every reservation move live server-side; this screen only
// offers the transitions the order can actually take (src/admin/orderFlow.js) and
// shows the 409 if the two ever disagree.
//
// Sales orders and Purchase orders beside it are the Dynamics mirror. This tab is
// the platform's own order table — the one the shop writes into.
//
// **An order offers Archive and nothing more permanent, deliberately: there is no
// delete affordance for an order anywhere in the CRM.** The lifecycle registry
// carries `order` as `deletable: false`, so `deleteOrExplain` throws rather than
// answering, and the reasons are all irreversible — the CASCADE would take the
// lines, the delete would not release `qty_reserved` (corrupting stock with no
// error), and the row carries the Xero reference and the Stripe session id. This
// screen therefore composes useCrudScreen for its list, toast and
// mutate-then-reload cycle and never touches `remove`; there is no ConfirmDialog
// here and no Delete button to open one.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { toNumber } from '../admin/drafts.js'
import Pagination from '../admin/Pagination.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { UNPAGED_LIST_LIMIT, orderListFilters } from './adminLists.js'
import {
  KIND_LABELS,
  ORDER_STATUSES,
  RESERVATION_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  availableActions,
  canEditLines,
  contactLabel,
  formatCents,
  lineEditsChanged,
  parseLineEdits,
} from '../admin/orderFlow.js'
import {
  ArchivedTag,
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
  monoText,
  mutedText,
  panel,
  sectionLabel,
} from '../admin/parts.jsx'

const COLUMNS = '1.2fr 1fr 1.3fr 110px 1fr 1fr 200px'
const LINE_COLUMNS = '1fr 1.5fr 110px 1fr 1fr'

const statusColour = { muted: c.muted, accent: c.accent, sage: c.sage, clay: c.clay }
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

// A Stripe-collected address, as one readable block. Request-kind orders have
// none until someone adds it, so absence is stated rather than left blank.
function addressLines(address) {
  if (!address || typeof address !== 'object') return []
  const parts = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.postal_code].filter(Boolean).join(' '),
    address.state,
    address.country,
  ]
  return parts.filter((part) => part && String(part).trim())
}

export default function AdminOrders() {
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [lineDrafts, setLineDrafts] = useState({}) // line id -> qty string
  const [invoiceRef, setInvoiceRef] = useState('')

  // The list, the toast and the mutate-then-reload cycle. `remove` comes back
  // with them and is deliberately never used — see the header note.
  const crud = useCrudScreen({
    path: '/admin/orders',
    key: 'orders',
    limit: UNPAGED_LIST_LIMIT,
    filters: orderListFilters(statusFilter, showArchived),
    entity: 'order',
  })
  const orders = crud.list.rows
  const { message, flash } = crud.toast
  const { busy, error, setError, run } = crud.mutation

  // Re-seed the line drafts from server truth whenever the open order reloads —
  // a quantity edit changes the reservation, so the row that comes back is the
  // one to trust.
  useEffect(() => {
    if (openId == null) return
    const order = orders.find((o) => o.id === openId)
    if (!order) {
      setOpenId(null)
      return
    }
    setLineDrafts(
      (order.lines ?? []).reduce((acc, line) => ({ ...acc, [line.id]: String(line.qty) }), {})
    )
    setInvoiceRef(order.xero_invoice_ref ?? '')
  }, [openId, orders])

  const toggle = (order) => {
    setError('')
    setOpenId((current) => (current === order.id ? null : order.id))
  }

  const act = (order, action) => {
    if (action.needsRef) {
      const ref = invoiceRef.trim()
      if (!ref) {
        return setError('Record the Xero invoice reference before confirming.')
      }
      return run(
        () => apiSend('POST', `/admin/orders/${order.id}/confirm`, { xero_invoice_ref: ref }),
        `${order.order_number} confirmed against ${ref}.`
      )
    }
    if (
      action.key === 'decline' &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Decline ${order.order_number}? Any stock it holds is released back to available.`
      )
    ) {
      return undefined
    }
    return run(
      () => apiSend('POST', `/admin/orders/${order.id}/${action.key}`, {}),
      `${order.order_number} — ${action.label.toLowerCase()}d.`
    )
  }

  const saveLines = (order) => {
    const parsed = parseLineEdits(order.lines ?? [], lineDrafts)
    if (!parsed.ok) return setError(parsed.error)
    if (!lineEditsChanged(order.lines ?? [], parsed.lines)) {
      return flash('No changes to save.')
    }
    run(
      () => apiSend('PATCH', `/admin/orders/${order.id}`, { lines: parsed.lines }),
      `${order.order_number} quantities updated.`
    )
  }

  const archive = (order) => {
    const archived = Boolean(order.archived_at)
    run(
      () => apiSend('POST', `/admin/orders/${order.id}/${archived ? 'restore' : 'archive'}`, {}),
      archived ? `${order.order_number} restored.` : `${order.order_number} archived.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Orders · live"
        title={<>Web orders</>}
        subtitle="Card checkouts and cut-to-order requests from the storefront. Confirming records the Xero reference; shipping draws the held stock down."
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{' '}
            Show archived
          </label>
        }
      />
      <SectionTabs tabs={ordersTabs} active="web" />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead
          label="Queue"
          right={
            <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <select
                value={statusFilter}
                disabled={busy}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setOpenId(null)
                }}
                style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 'auto' }}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {crud.list.total} shown
              </span>
            </span>
          }
        />

        <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
        {crud.list.status === 'loading' && <PanelNote>Loading orders…</PanelNote>}
        {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
        {crud.list.status === 'ready' && orders.length === 0 && (
          <PanelNote>
            {statusFilter ? 'No orders with that status.' : 'No web orders yet.'}
          </PanelNote>
        )}

        {crud.list.status === 'ready' && orders.length > 0 && (
          <>
            <HeaderRow
              columns={COLUMNS}
              labels={['Order', 'Kind', 'Contact', 'Status', 'Total', 'Stock', '']}
            />
            {orders.map((order) => {
              const open = openId === order.id
              const actions = availableActions(order)
              const editable = canEditLines(order)
              const address = addressLines(order.shipping_address)
              return (
                <div key={order.id}>
                  <Row columns={COLUMNS} archived={Boolean(order.archived_at)}>
                    <button
                      type="button"
                      onClick={() => toggle(order)}
                      aria-expanded={open}
                      className="ab-t"
                      style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                    >
                      <span style={{ ...monoText, display: 'block', fontSize: 12.5, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {order.order_number}
                        {order.archived_at && <ArchivedTag />}
                      </span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                        {shortDate(order.created_at)}
                      </span>
                    </button>
                    <span style={mutedText}>{KIND_LABELS[order.kind] ?? order.kind}</span>
                    <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {contactLabel(order)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: statusColour[STATUS_TONE[order.status]] ?? c.muted }}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span style={monoText}>{formatCents(order.total_cents)}</span>
                    <span style={mutedText}>
                      {RESERVATION_LABELS[order.reservation_state] ?? order.reservation_state}
                    </span>
                    <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <GhostButton disabled={busy} onClick={() => toggle(order)}>
                        {open ? 'Close' : 'Open'}
                      </GhostButton>
                      <GhostButton
                        disabled={busy}
                        tone={order.archived_at ? 'ink' : 'danger'}
                        onClick={() => archive(order)}
                      >
                        {order.archived_at ? 'Restore' : 'Archive'}
                      </GhostButton>
                    </span>
                  </Row>

                  {open && (
                    <div style={{ padding: '20px 20px 24px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                        <div>
                          <span style={sectionLabel}>Money</span>
                          <div style={{ marginTop: 10, ...monoText, lineHeight: 1.8 }}>
                            <div>Subtotal {formatCents(order.subtotal_cents)}</div>
                            <div>Shipping {formatCents(order.shipping_cents)}</div>
                            <div style={{ color: c.ink, fontWeight: 500 }}>
                              Total {formatCents(order.total_cents)}
                            </div>
                          </div>
                        </div>
                        <div>
                          <span style={sectionLabel}>Delivery</span>
                          <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7 }}>
                            {order.shipping_zone && <div>Zone: {order.shipping_zone}</div>}
                            {address.length > 0 ? (
                              address.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
                            ) : (
                              <div style={{ fontStyle: 'italic', fontFamily: font.display }}>
                                No address collected.
                              </div>
                            )}
                            {order.contact_phone && (
                              <div style={monoText}>{order.contact_phone}</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <span style={sectionLabel}>Invoice</span>
                          <div style={{ marginTop: 10 }}>
                            {order.xero_invoice_ref ? (
                              <span style={monoText}>{order.xero_invoice_ref}</span>
                            ) : (
                              <span style={{ ...mutedText, fontStyle: 'italic', fontFamily: font.display }}>
                                Not invoiced yet.
                              </span>
                            )}
                            <div style={{ marginTop: 8 }}>
                              <StatusPill tone="muted">
                                {RESERVATION_LABELS[order.reservation_state] ?? order.reservation_state}
                              </StatusPill>
                            </div>
                          </div>
                        </div>
                        {order.notes && (
                          <div>
                            <span style={sectionLabel}>Notes</span>
                            <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                              {order.notes}
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: 24 }}>
                        <span style={sectionLabel}>Lines</span>
                        <div style={{ ...panel, marginTop: 12, background: c.paper }}>
                          {(order.lines ?? []).length === 0 ? (
                            <PanelNote>This order has no lines.</PanelNote>
                          ) : (
                            <>
                              <HeaderRow
                                columns={LINE_COLUMNS}
                                labels={['SKU', 'Product', 'Quantity', 'Unit price', 'Stock behind it']}
                              />
                              {(order.lines ?? []).map((line) => (
                                <Row key={line.id} columns={LINE_COLUMNS} style={{ alignItems: 'start' }}>
                                  <span style={{ ...monoText, paddingTop: 9, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {line.sku}
                                  </span>
                                  <span style={{ minWidth: 0, paddingTop: 9 }}>
                                    <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {line.product_name}
                                    </span>
                                    {line.cut_requirements && (
                                      <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                                        {line.cut_requirements}
                                      </span>
                                    )}
                                  </span>
                                  {editable ? (
                                    <input
                                      value={lineDrafts[line.id] ?? String(line.qty)}
                                      inputMode="decimal"
                                      disabled={busy}
                                      onChange={(e) =>
                                        setLineDrafts((all) => ({ ...all, [line.id]: e.target.value }))
                                      }
                                      style={{ ...cellInput, fontFamily: font.mono }}
                                      aria-label={`Quantity for ${line.sku}`}
                                    />
                                  ) : (
                                    <span style={{ ...monoText, paddingTop: 9 }}>{line.qty}</span>
                                  )}
                                  <span style={{ ...monoText, paddingTop: 9 }}>
                                    {formatCents(line.unit_price_cents)}
                                  </span>
                                  <span style={{ ...mutedText, fontSize: 11.5, paddingTop: 9, fontFamily: font.mono }}>
                                    {line.inventory
                                      ? `${toNumber(line.inventory.qty_available)} avail · ${toNumber(
                                          line.inventory.qty_reserved
                                        )} reserved · ${toNumber(line.reserved_qty)} this order`
                                      : 'No stock row'}
                                  </span>
                                </Row>
                              ))}
                            </>
                          )}
                          {editable && (order.lines ?? []).length > 0 && (
                            <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                              <GhostButton disabled={busy} onClick={() => saveLines(order)}>
                                Save quantities
                              </GhostButton>
                              <span style={{ ...mutedText, fontSize: 11.5 }}>
                                Editing a quantity adjusts the stock this order holds by the
                                difference.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {actions.length > 0 && (
                        <div style={{ marginTop: 24 }}>
                          <span style={sectionLabel}>Next step</span>
                          <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
                            {actions.some((action) => action.needsRef) && (
                              <Field
                                label="Xero invoice reference"
                                hint="Invoicing is manual — record the reference you raised."
                                style={{ maxWidth: 280 }}
                              >
                                <input
                                  value={invoiceRef}
                                  disabled={busy}
                                  onChange={(e) => setInvoiceRef(e.target.value)}
                                  style={{ ...inputStyle, fontFamily: font.mono }}
                                  placeholder="e.g. INV-1042"
                                />
                              </Field>
                            )}
                            {actions.map((action) => (
                              <GhostButton
                                key={action.key}
                                tone={action.tone}
                                disabled={busy}
                                onClick={() => act(order, action)}
                                style={{ marginBottom: 2 }}
                              >
                                {action.label}
                              </GhostButton>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </section>

      <Pagination
        page={crud.list.page}
        totalPages={crud.list.totalPages}
        total={crud.list.total}
        unit="orders"
        onPage={crud.list.setPage}
        busy={busy}
      />

      <ToastLine message={message} />
    </div>
  )
}
