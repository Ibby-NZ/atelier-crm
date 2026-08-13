// Web orders — the live queue from atelier-api's /admin/orders. These are the
// orders the storefront actually took: card checkouts recorded by the Stripe
// webhook, and fabric/backorder requests waiting for someone to cut and invoice.
//
//   GET    /admin/orders?status=&include_archived=&q=&client=&reference=
//            &po_number=&from=&to=&page=&limit=     → { orders, meta: { total, page, limit } }
//   PATCH  /admin/orders/:id                        → { order }   (lines + header)
//   POST   /admin/orders/:id/confirm                → { order }   (+ xero_invoice_ref)
//   POST   /admin/orders/:id/mark-paid|ship|decline → { order }
//   POST   /admin/orders/:id/archive|restore        → { order }
//   DELETE /admin/orders/:id                        → { deleted } | 409 { blockers }
//
// The state machine and every reservation move live server-side; this screen only
// offers the transitions the order can actually take (src/admin/orderFlow.js) and
// shows the 409 if the two ever disagree.
//
// Sales orders and Purchase orders beside it are the Dynamics mirror. This tab is
// the platform's own order table — the one the shop writes into, including the
// sales orders the office raises itself at /admin/orders/new.
//
// **Two rules, both server-enforced:**
//   - **A request arrives priced at 0 and is priced HERE.** That is what turns a
//     quote a shopper submitted into an invoiceable sales order: set the unit
//     prices, add or remove lines, then confirm against the Xero reference. The
//     window is requested/confirmed, because after payment the invoice is out.
//   - **Delete is refused the moment an order becomes a financial record.** A
//     card checkout is the record of a payment taken at Stripe, whatever its
//     status; every other kind stops being deletable at `paid`. What is left — a
//     request nobody priced, a sales order keyed by mistake, a declined one —
//     destroys nothing, and the API hands its reservation back inside the delete
//     transaction. Anything refused comes back as a 409 the dialog renders, with
//     Archive offered instead.
//
// **This list PAGES (W12).** The endpoint answers 50 rows and a `meta.total`, and
// its `limit` has a MAXIMUM — so the screen searches rather than scrolls, and the
// bar above the queue drives the six filters the client asked for: client, date,
// reference and their PO number, plus the catch-all box the Dynamics mirror
// beside it already has. Every rule is in ./adminOrders.js; this file is layout.
//
// **The packing slip is the third document off an order and carries no prices at
// all** (US-007) — see ../utils/orderPackingSlip.js, which proves that rather
// than asserting it.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { diffFields, draftFrom, toNumber } from '../admin/drafts.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import OrderLinesEditor from '../admin/OrderLinesEditor.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { addressLines, printOrderPackingSlip } from '../utils/orderPackingSlip.js'
import {
  CUSTOMER_PO_HINT,
  EMPTY_ORDER_SEARCH,
  ORDER_HEADER_FIELDS,
  ORDER_LIST_LIMIT,
  hasOrderFilters,
  orderListFilters,
  referenceLine,
} from './adminOrders.js'
import {
  KIND_LABELS,
  ORDER_STATUSES,
  RESERVATION_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  availableActions,
  buildLinePatch,
  canDeleteOrder,
  canEditLines,
  contactLabel,
  draftFromLine,
  formatCents,
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
  inputStyle,
  monoText,
  mutedText,
  panel,
  sectionLabel,
} from '../admin/parts.jsx'

const COLUMNS = '1.2fr 1fr 1.3fr 110px 1fr 1fr 260px'
const LINE_COLUMNS = '1fr 1.5fr 110px 1fr 1fr'
const filterInput = { height: 34, fontSize: 12.5 }

const statusColour = { muted: c.muted, accent: c.accent, sage: c.sage, clay: c.clay }
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function AdminOrders() {
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // The committed search, and what the boxes currently hold. Two states, the
  // AdminPriceListItems arrangement: every keystroke is not a request, and the
  // list only moves when Search is pressed.
  const [search, setSearch] = useState(EMPTY_ORDER_SEARCH)
  const [searchDraft, setSearchDraft] = useState(EMPTY_ORDER_SEARCH)
  const [openId, setOpenId] = useState(null)
  // The open order's lines as an editable list (see draftFromLine): quantities,
  // prices, cut requirements, plus any line added from the catalogue.
  const [lineDrafts, setLineDrafts] = useState([])
  const [invoiceRef, setInvoiceRef] = useState('')
  const [headerDraft, setHeaderDraft] = useState({})

  // The list, the toast, the mutate-then-reload cycle and the delete flow.
  const crud = useCrudScreen({
    path: '/admin/orders',
    key: 'orders',
    limit: ORDER_LIST_LIMIT,
    filters: orderListFilters({ status: statusFilter, showArchived, ...search }),
    entity: 'order',
    describe: (order) => order.order_number,
    // A refused delete offers this instead, straight out of the 409's
    // `archivable` flag — which is the only way out for a paid order.
    archive: (order) => apiSend('POST', `/admin/orders/${order.id}/archive`, {}),
  })
  const orders = crud.list.rows
  const { message, flash } = crud.toast
  const { busy, error, setError, run } = crud.mutation

  // Re-seed the drafts from server truth whenever the open order reloads — an
  // edit moves the reservation and re-totals the money, so the row that comes
  // back is the one to trust.
  useEffect(() => {
    if (openId == null) return
    const order = orders.find((o) => o.id === openId)
    if (!order) {
      setOpenId(null)
      return
    }
    setLineDrafts((order.lines ?? []).map((line) => draftFromLine(line)))
    setInvoiceRef(order.xero_invoice_ref ?? '')
    setHeaderDraft(draftFrom(order, ORDER_HEADER_FIELDS))
  }, [openId, orders])

  const toggle = (order) => {
    setError('')
    setOpenId((current) => (current === order.id ? null : order.id))
  }

  // useAdminList resets to page 1 whenever the serialised filters change, so a
  // narrower search never lands past the end of its own result set — there is
  // nothing to do here but commit what was typed.
  const runSearch = (event) => {
    event.preventDefault()
    setError('')
    setOpenId(null)
    setSearch(searchDraft)
  }

  const clearSearch = () => {
    setError('')
    setOpenId(null)
    setSearchDraft(EMPTY_ORDER_SEARCH)
    setSearch(EMPTY_ORDER_SEARCH)
  }

  const setSearchField = (key) => (event) =>
    setSearchDraft((draft) => ({ ...draft, [key]: event.target.value }))

  const setHeaderField = (key) => (event) =>
    setHeaderDraft((draft) => ({ ...draft, [key]: event.target.value }))

  const packingSlip = (order) => {
    setError('')
    flash(
      printOrderPackingSlip(order)
        ? `Packing slip opened for ${order.order_number}.`
        : 'Allow pop-ups to open the packing slip.'
    )
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

  // One PATCH carries the whole edit: line changes, added and removed lines, and
  // the order header (notes, phone, and the client's own reference and PO
  // number). The API re-totals the money from the lines and moves the
  // reservation by the difference.
  const saveOrder = (order) => {
    const built = buildLinePatch(order.lines ?? [], lineDrafts)
    if (!built.ok) return setError(built.error)

    // diffFields sends only what moved, and its `text` kind clears a emptied box
    // to null rather than to '' — the distinction the API's own applyOrderHeader
    // draws, and the reason a cleared reference stays findable by `IS NULL`.
    const header = diffFields(order, headerDraft, ORDER_HEADER_FIELDS)
    if (header.error) return setError(header.error)

    const body = { ...(built.patch ?? {}), ...header.patch }
    if (Object.keys(body).length === 0) return flash('No changes to save.')
    return run(
      () => apiSend('PATCH', `/admin/orders/${order.id}`, body),
      `${order.order_number} updated.`
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />{' '}
              Show archived
            </label>
            <Link to="/admin/orders/new" style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">New sales order</GhostButton>
            </Link>
          </span>
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
                {crud.list.total.toLocaleString('en-NZ')} matching
              </span>
            </span>
          }
        />

        {/* The four the client asked for — client, date, reference and their PO
            number — plus the catch-all box the Dynamics mirror beside this
            screen already offers, which searches our order number too. */}
        <form
          onSubmit={runSearch}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}
        >
          <input
            value={searchDraft.q}
            onChange={setSearchField('q')}
            placeholder="Search order #, client, reference or PO"
            style={{ ...inputStyle, ...filterInput, width: 260 }}
            aria-label="Search orders"
          />
          <input
            value={searchDraft.client}
            onChange={setSearchField('client')}
            placeholder="Client"
            style={{ ...inputStyle, ...filterInput, width: 150 }}
            aria-label="Filter by client"
          />
          <input
            value={searchDraft.reference}
            onChange={setSearchField('reference')}
            placeholder="Client reference"
            style={{ ...inputStyle, ...filterInput, width: 150 }}
            aria-label="Filter by client reference"
          />
          <input
            value={searchDraft.po_number}
            onChange={setSearchField('po_number')}
            placeholder="Client PO number"
            title={CUSTOMER_PO_HINT}
            style={{ ...inputStyle, ...filterInput, width: 150 }}
            aria-label="Filter by the client's PO number"
          />
          {/* Native date inputs: they hand back YYYY-MM-DD, which is exactly what
              the endpoint parses, and '' until what was typed is a real date. */}
          <input
            type="date"
            value={searchDraft.from}
            onChange={setSearchField('from')}
            style={{ ...inputStyle, ...filterInput, width: 145 }}
            aria-label="Ordered on or after"
          />
          <input
            type="date"
            value={searchDraft.to}
            onChange={setSearchField('to')}
            style={{ ...inputStyle, ...filterInput, width: 145 }}
            aria-label="Ordered on or before"
          />
          <GhostButton type="submit" disabled={busy}>
            Search
          </GhostButton>
          {hasOrderFilters(search) && (
            <GhostButton disabled={busy} onClick={clearSearch}>
              Clear
            </GhostButton>
          )}
        </form>

        <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
        {crud.list.status === 'loading' && <PanelNote>Loading orders…</PanelNote>}
        {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
        {/* "Nothing matches" and "there is nothing yet" are opposite answers;
            showing the second one under a search reads as a broken screen. */}
        {crud.list.status === 'ready' && orders.length === 0 && (
          <PanelNote>
            {hasOrderFilters({ status: statusFilter, ...search })
              ? 'No orders match those filters.'
              : 'No web orders yet.'}
          </PanelNote>
        )}

        {crud.list.status === 'ready' && orders.length > 0 && (
          <>
            <HeaderRow
              columns={COLUMNS}
              labels={['Order', 'Kind', 'Client', 'Status', 'Total', 'Stock', '']}
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
                    {/* contactLabel is the fallback chain: the account's name,
                        then its email, then the guest's — a guest order has no
                        account at all, so client_name is null on one. */}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ ...mutedText, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {contactLabel(order)}
                      </span>
                      {referenceLine(order) && (
                        <span style={{ ...mutedText, display: 'block', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {referenceLine(order)}
                        </span>
                      )}
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
                      {/* Only where the API would allow it — a paid, shipped or
                          card-checkout order is a financial record and answers
                          409. See canDeleteOrder. */}
                      {canDeleteOrder(order) && (
                        <GhostButton
                          disabled={busy}
                          tone="danger"
                          onClick={() => crud.remove.ask(order)}
                        >
                          Delete
                        </GhostButton>
                      )}
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
                        <div>
                          <span style={sectionLabel}>Client’s own numbers</span>
                          <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7 }}>
                            <div>
                              Reference:{' '}
                              <span style={monoText}>{order.client_reference || '—'}</span>
                            </div>
                            {/* "Client PO" in full, always: Atelier's own
                                purchase orders are a different record entirely. */}
                            <div title={CUSTOMER_PO_HINT}>
                              Client PO number:{' '}
                              <span style={monoText}>{order.customer_po_number || '—'}</span>
                            </div>
                            {/* The API refuses a PATCH outside requested /
                                confirmed, so these two stop being editable at
                                the same moment the lines do. */}
                            {!editable && (
                              <div style={{ fontSize: 11, fontStyle: 'italic', fontFamily: font.display }}>
                                Fixed — an order past confirmation can no longer be edited.
                              </div>
                            )}
                            <div style={{ marginTop: 10 }}>
                              <GhostButton disabled={busy} onClick={() => packingSlip(order)}>
                                Packing slip
                              </GhostButton>
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

                      {/* Editable while requested or confirmed: this is where a
                          storefront request (every line priced at 0) becomes an
                          invoiceable sales order. */}
                      {editable && (
                        <div style={{ marginTop: 24 }}>
                          <span style={sectionLabel}>Lines</span>
                          <div style={{ marginTop: 12 }}>
                            <OrderLinesEditor
                              lines={lineDrafts}
                              onChange={setLineDrafts}
                              busy={busy}
                              onError={setError}
                            />
                          </div>
                          <div style={{ marginTop: 14, display: 'grid', gap: 10, maxWidth: 520 }}>
                            <Field
                              label="Notes"
                              hint="Who the order is for, and anything the back office needs."
                            >
                              <textarea
                                value={headerDraft.notes ?? ''}
                                disabled={busy}
                                rows={2}
                                onChange={setHeaderField('notes')}
                                style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
                              />
                            </Field>
                            <Field label="Contact phone">
                              <input
                                value={headerDraft.contact_phone ?? ''}
                                disabled={busy}
                                onChange={setHeaderField('contact_phone')}
                                style={{ ...inputStyle, fontFamily: font.mono }}
                              />
                            </Field>
                            {/* The client's own two numbers. They arrive later
                                than the order does — a PO number usually comes
                                in a follow-up email — which is why they are
                                edited here rather than fixed at creation. */}
                            <Field
                              label="Client reference"
                              hint="What the client calls this job — a room, a project, a name."
                            >
                              <input
                                value={headerDraft.client_reference ?? ''}
                                disabled={busy}
                                onChange={setHeaderField('client_reference')}
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="Client PO number" hint={CUSTOMER_PO_HINT}>
                              <input
                                value={headerDraft.customer_po_number ?? ''}
                                disabled={busy}
                                onChange={setHeaderField('customer_po_number')}
                                style={{ ...inputStyle, fontFamily: font.mono }}
                              />
                            </Field>
                          </div>
                          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                            <GhostButton tone="accent" disabled={busy} onClick={() => saveOrder(order)}>
                              Save order
                            </GhostButton>
                            <span style={{ ...mutedText, fontSize: 11.5 }}>
                              The total is recomputed from the lines; the stock this order holds
                              moves by the difference.
                            </span>
                          </div>
                        </div>
                      )}

                      {!editable && (
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
                                  <span style={{ ...monoText, paddingTop: 9 }}>{line.qty}</span>
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
                        </div>
                      </div>
                      )}

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

      {/* A refused delete keeps this open and explains: the API's 409 carries the
          reason and `archivable`, which is what turns the secondary button into
          "Archive instead". */}
      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
