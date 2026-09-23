// One sales order on its own page — /admin/orders/:id. The WooCommerce shape
// the client asked for (16 Sep 2026): the list is the list, and everything
// about ONE order — who, what, the money, what happens next, the customer's
// history — is here, with room for it. Until this page the order opened as an
// expanded row inside the queue.
//
//   GET    /admin/orders/:id                        → { order }
//   PATCH  /admin/orders/:id                        → { order }   (lines + header + discount;
//            a body of `notes` ALONE is accepted at any non-archived status, and
//            one of `shipping_address` ALONE until the order ships — Edit delivery)
//   POST   /admin/orders/:id/confirm                → { order }   (+ xero_invoice_ref)
//   POST   /admin/orders/:id/mark-paid              → { order, xero_payment? }
//   POST   /admin/orders/:id/ship|decline           → { order }   (ship: { tracking_url? })
//   POST   /admin/orders/:id/archive|restore        → { order }
//   POST   /admin/xero/orders/:id/invoice           → { order, invoice }  (C4;
//            renders only when GET /admin/xero/status says configured+connected)
//
// The state machine and every reservation move live server-side; this page only
// offers the transitions the order can actually take (src/admin/orderFlow.js)
// and shows the 409 if the two ever disagree. Delete stays on the list: it is
// the kit's flow, bound to a list it can reload, and an order that is gone has
// no page to stay on.
//
// **Two rules, both server-enforced:**
//   - **A request arrives priced at 0 and is priced HERE.** Set the unit
//     prices, add or remove lines, then confirm against the Xero reference. The
//     window is requested/confirmed, because after payment the invoice is out.
//   - **Mark paid marks the invoice paid in Xero too.** The API records the
//     payment as part of the transition and answers `xero_payment`; the toast
//     says what happened there (markPaidNote). The order is paid either way.
//
// Every rule is in ./adminOrders.js and ../admin/orderFlow.js; this file is
// layout and effects.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiSend, safeFetch } from '../lib/api.js'
import { diffFields, draftFrom, toNumber } from '../admin/drafts.js'
import { canPushToXero, xeroStatusLabel } from './adminXero.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import OrderLinesEditor from '../admin/OrderLinesEditor.jsx'
import CustomerOrders from '../admin/CustomerOrders.jsx'
import { useConfirmation } from '../admin/useConfirmation.js'
import { addressLines, printOrderPackingSlip } from '../utils/orderPackingSlip.js'
import { DELIVERY_FIELDS, buildDeliveryPatch, canEditDelivery, deliveryDraftFrom } from '../admin/deliveryDetails.js'
import {
  CUSTOMER_PO_HINT,
  HEADER_MAX,
  keepTypedHeader,
  ORDER_HEADER_FIELDS,
  repPatch,
  shipBody,
  staffOptions,
  TRACKING_URL_MAX,
  gstLabel,
  markPaidNote,
  productPath,
  stockPath,
} from './adminOrders.js'
import {
  CUSTOM_DISCOUNT_HINT,
  DIRECTORS_ONLY_NOTE,
  DISCOUNT_OPTIONS,
  EMPTY_DISCOUNT_DRAFT,
  buildDiscountPatch,
  discountAmountCents,
  discountAppliedBy,
  discountDraftFrom,
  formatDiscountPct,
  hasDiscount,
} from './orderDiscount.js'
import {
  KIND_LABELS,
  RESERVATION_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  availableActions,
  buildLinePatch,
  canEditLines,
  contactLabel,
  draftFromLine,
  formatCents,
  sourceLabel,
  unpricedLineCount,
  needsPricing,
  unpricedHint,
  formatQty,
  formatLinePrice,
} from '../admin/orderFlow.js'
import {
  ArchivedTag,
  CheckField,
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  Select,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'

const LINE_COLUMNS = '1fr 1.5fr 110px 1fr 1fr 1fr'

// Notes are the one header column the API takes at ANY non-archived status, so
// "Save notes" sends `{ notes }` and nothing else — the same `text` kind as the
// full header diff, which is what folds an emptied box to null rather than ''.
const NOTES_FIELD = ORDER_HEADER_FIELDS.filter((field) => field.key === 'notes')
// One sentence, printed under the read-only pair and used as the edit form's
// hint: "Reference" alone read as ours.
const CLIENT_REFERENCE_HINT = 'What the client calls this job — a room, a project, a name.'

const statusTone = { muted: 'muted', accent: 'accent', sage: 'sage', clay: 'clay' }
const longDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

// The platform keeps ONE address per order, the delivery (`shipping_address`),
// and the packing slip prints it as Deliver to — so the panel says Delivery.
// Who the order is invoiced to is the Client block beside it.
const customerEmail = (order) => order?.client_email ?? order?.guest_email ?? null

export default function AdminOrder() {
  const { id } = useParams()
  const confirmation = useConfirmation()
  const { message, flash } = useToast()

  // The order, read by id. `status` is the read's own state — an order that
  // does not exist is a page that says so, not an empty desk.
  const [order, setOrder] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | missing | error
  const [loadError, setLoadError] = useState('')
  const read = useCallback(() => safeFetch(`/admin/orders/${id}`), [id])
  const apply = useCallback((data, failure) => {
    if (data?.order) {
      setOrder(data.order)
      setStatus('ready')
    } else if (failure?.status === 404) {
      setStatus('missing')
    } else {
      setLoadError(failure?.message || 'Could not load this order.')
      setStatus('error')
    }
  }, [])
  const load = useCallback(async () => {
    const { data, error: failure } = await read()
    apply(data, failure)
  }, [read, apply])
  // StrictMode mounts twice; the active flag keeps the stale pass silent.
  useEffect(() => {
    let active = true
    setStatus('loading')
    read().then(({ data, error: failure }) => {
      if (active) apply(data, failure)
    })
    return () => {
      active = false
    }
  }, [read, apply])

  // The mutate-then-reload cycle every screen repeats: the reload is the
  // one-order read above, because an edit moves the reservation and re-totals
  // the money, so the row that comes back is the one to trust.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  // The open order's lines as an editable list (see draftFromLine): quantities,
  // prices, notes, plus any line added from the catalogue.
  const [lineDrafts, setLineDrafts] = useState([])
  const [invoiceRef, setInvoiceRef] = useState('')
  // Optional, and only ever read by the Ship action: the office hand-delivers
  // some orders, so a blank box ships exactly as it did before.
  const [trackingUrl, setTrackingUrl] = useState('')
  const [headerDraft, setHeaderDraft] = useState({})
  // The discount control (Rebecca-R2): mode is one of DISCOUNT_OPTIONS' values,
  // pct/reason only mean anything while mode is 'custom'.
  const [discountDraft, setDiscountDraft] = useState(EMPTY_DISCOUNT_DRAFT)
  // Edit delivery (src/admin/deliveryDetails.js). Null while the form is
  // closed; the reload effect below leaves it alone, because it holds what
  // somebody is typing, and a successful save closes it.
  const [deliveryDraft, setDeliveryDraft] = useState(null)

  // A draft belongs to the order it was opened on: a new id starts from an
  // empty header draft, so the effect below seeds it wholesale.
  useEffect(() => {
    setError('')
    setDeliveryDraft(null)
    setHeaderDraft({})
  }, [id, setError])

  // Re-seed the drafts from server truth whenever the order reloads. The
  // header boxes are the exception: they hold what somebody is TYPING, and the
  // order takes a new identity after EVERY mutation (useMutation always awaits
  // reload). A box that has been typed into survives the reload; one still
  // holding server truth re-seeds — see keepTypedHeader.
  useEffect(() => {
    if (!order) return
    setLineDrafts((order.lines ?? []).map((line) => draftFromLine(line)))
    setInvoiceRef(order.xero_invoice_ref ?? '')
    setTrackingUrl(order.tracking_url ?? '')
    setHeaderDraft((draft) => keepTypedHeader(draft, draftFrom(order, ORDER_HEADER_FIELDS)))
    setDiscountDraft(discountDraftFrom(order))
  }, [order])

  // Custom discounts are the director's door. `apiRole` is the API's own word
  // for the account (backoffice/director) — the CRM capability role maps both
  // to 'director' and cannot tell them apart.
  const isDirector = useAuth().user?.apiRole === 'director'
  // The staff roster for the Sales rep select — fetched once; a failure leaves
  // the select empty rather than breaking the page.
  const [staff, setStaff] = useState([])
  useEffect(() => {
    let active = true
    safeFetch('/admin/users?segment=staff&limit=100').then(({ data }) => {
      if (active && data) setStaff(staffOptions(data.users ?? []))
    })
    return () => {
      active = false
    }
  }, [])

  // Whether the API has a live Xero connection (C4). null while loading; the
  // push button only renders when it says configured AND connected.
  const [xeroStatus, setXeroStatus] = useState(null)
  const [emailFromXero, setEmailFromXero] = useState(false)
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

  // The rep is an ANNOTATION the API takes at any status (back-filling a
  // shipped order is the point), so the select saves on change — no draft.
  const assignRep = (event) => {
    const patch = repPatch(event.target.value)
    if (!patch) return
    run(() => apiSend('PATCH', `/admin/orders/${order.id}`, patch), `${order.order_number} — sales rep updated.`)
  }

  // Create the invoice IN Xero (C4): the API links the client to their Xero
  // contact, posts the invoice, and writes both identifiers back onto the
  // order — the reload fills the reference field, and confirming proceeds
  // against it exactly as if it had been typed.
  const pushToXero = () =>
    run(
      () => apiSend('POST', `/admin/xero/orders/${order.id}/invoice`, { email: emailFromXero }),
      (result) =>
        result?.warning
          ? `${order.order_number} — ${result.warning}`
          : `${order.order_number} — invoice created in Xero${emailFromXero ? ' and emailed' : ''}${
              result?.payment?.recorded ? ', and marked paid' : ''
            }.`
    )

  const setHeaderField = (key) => (event) =>
    setHeaderDraft((draft) => ({ ...draft, [key]: event.target.value }))

  const openDelivery = () => {
    setError('')
    setDeliveryDraft(deliveryDraftFrom(order.shipping_address))
  }

  const setDeliveryField = (key) => (event) =>
    setDeliveryDraft((draft) => ({ ...draft, [key]: event.target.value }))

  // The delivery travels ALONE, which is what lets the API take it on a paid
  // order: in company with any other key it is an ordinary edit, frozen from
  // paid on. Every field emptied removes the address (buildDeliveryPatch).
  const saveDelivery = async () => {
    const built = buildDeliveryPatch(order.shipping_address, deliveryDraft)
    if (!built.ok) return setError(built.error)
    if (!built.patch) {
      setDeliveryDraft(null)
      return flash('No changes to save.')
    }
    const saved = await run(
      () => apiSend('PATCH', `/admin/orders/${order.id}`, built.patch),
      built.patch.shipping_address
        ? `${order.order_number} — delivery details saved.`
        : `${order.order_number} — delivery address removed.`
    )
    if (saved) setDeliveryDraft(null)
    return undefined
  }

  const packingSlip = () => {
    setError('')
    flash(
      printOrderPackingSlip(order)
        ? `Packing slip opened for ${order.order_number}.`
        : 'Allow pop-ups to open the packing slip.'
    )
  }

  const act = async (action) => {
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
    // Ship is the transition the client hears about: the API sends the shipped
    // letter on it, and a tracking URL rides along in that letter. Sent only
    // when one was typed — the API's schema leaves it optional — and refused
    // here in our own words when it carries no scheme, because the API's answer
    // is a raw 400 that lands after Ship has been pressed (see shipBody).
    if (action.key === 'ship') {
      const ship = shipBody(trackingUrl)
      if (!ship.ok) return setError(ship.error)
      return run(
        () => apiSend('POST', `/admin/orders/${order.id}/ship`, ship.body),
        `${order.order_number} shipped — the client has been emailed.`
      )
    }
    if (
      action.key === 'decline' &&
      !(await confirmation.ask({
        title: `Cancel ${order.order_number}?`,
        body: `Cancel ${order.order_number}? Any stock it holds is released back to available, and the client is told.`,
        confirmLabel: 'Cancel order',
        confirmTone: 'ink',
      }))
    ) {
      return undefined
    }
    // Mark paid answers with what Xero did as well (markPaidNote).
    if (action.key === 'mark-paid') {
      return run(
        () => apiSend('POST', `/admin/orders/${order.id}/mark-paid`, {}),
        (result) => markPaidNote(order.order_number, result)
      )
    }
    return run(
      () => apiSend('POST', `/admin/orders/${order.id}/${action.key}`, {}),
      `${order.order_number} — ${action.done}.`
    )
  }

  // One PATCH carries the whole edit: line changes, added and removed lines, and
  // the order header (notes, phone, and the client's own reference and PO
  // number). The API re-totals the money from the lines and moves the
  // reservation by the difference.
  const saveOrder = () => {
    const built = buildLinePatch(order.lines ?? [], lineDrafts)
    if (!built.ok) return setError(built.error)

    // diffFields sends only what moved, and its `text` kind clears a emptied box
    // to null rather than to '' — the distinction the API's own applyOrderHeader
    // draws, and the reason a cleared reference stays findable by `IS NULL`.
    const header = diffFields(order, headerDraft, ORDER_HEADER_FIELDS)
    if (header.error) return setError(header.error)

    // Null when the control was not touched, so an ordinary line edit never
    // re-sends (or re-stamps) the discount. A custom value from a non-director
    // is refused here with the API's own words; the API remains the gate.
    const discount = buildDiscountPatch(order, discountDraft, { director: isDirector })
    if (!discount.ok) return setError(discount.error)

    const body = { ...(built.patch ?? {}), ...header.patch, ...(discount.patch ?? {}) }
    if (Object.keys(body).length === 0) return flash('No changes to save.')
    return run(
      () => apiSend('PATCH', `/admin/orders/${order.id}`, body),
      `${order.order_number} updated.`
    )
  }

  // Discard what was typed: back to the row as the API last sent it.
  const discardEdits = () => {
    setError('')
    setHeaderDraft({})
    setLineDrafts((order.lines ?? []).map((line) => draftFromLine(line)))
    setHeaderDraft(draftFrom(order, ORDER_HEADER_FIELDS))
    setDiscountDraft(discountDraftFrom(order))
  }

  // Notes save on their own, because they are the one thing the office adds
  // AFTER the money is fixed — "courier collected 3pm", "client rang about the
  // second roll". The API accepts a notes-only PATCH at any non-archived
  // status; anything else in the body keeps the requested/confirmed guard.
  const saveNotes = () => {
    const { patch, error: invalid } = diffFields(order, headerDraft, NOTES_FIELD)
    if (invalid) return setError(invalid)
    if (Object.keys(patch).length === 0) return flash('No changes to save.')
    return run(
      () => apiSend('PATCH', `/admin/orders/${order.id}`, patch),
      `${order.order_number} — notes saved.`
    )
  }

  const archive = () => {
    const archived = Boolean(order.archived_at)
    run(
      () => apiSend('POST', `/admin/orders/${order.id}/${archived ? 'restore' : 'archive'}`, {}),
      archived ? `${order.order_number} restored.` : `${order.order_number} archived.`
    )
  }

  const backLink = (
    <>
      <Link to="/admin/orders" className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to sales orders
      </Link>
      {' · live'}
    </>
  )

  if (status !== 'ready') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title={status === 'missing' ? 'Order not found' : 'Sales order'} />
        <SectionTabs tabs={ordersTabs} active="sales" />
        <section style={{ ...panel, marginTop: 16 }}>
          {status === 'loading' && <PanelNote>Loading the order…</PanelNote>}
          {status === 'missing' && (
            <PanelNote>
              There is no order #{id}. It may have been deleted — <Link to="/admin/orders">back to the list</Link>.
            </PanelNote>
          )}
          {status === 'error' && <PanelNote tone="danger">{loadError}</PanelNote>}
        </section>
      </div>
    )
  }

  const actions = availableActions(order)
  const unpriced = unpricedLineCount(order.lines)
  const editable = canEditLines(order)
  const address = addressLines(order.shipping_address)
  const deliveryPhone = order.shipping_address?.phone
  const deliveryInstructions = order.shipping_address?.instructions
  const email = customerEmail(order)

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {order.order_number}
            {order.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={`${sourceLabel(order)} · ${KIND_LABELS[order.kind] ?? order.kind} · placed ${longDate(order.created_at)}`}
        right={
          <StatusPill tone={statusTone[STATUS_TONE[order.status]] ?? 'muted'}>
            {STATUS_LABELS[order.status] ?? order.status}
          </StatusPill>
        }
      />
      <SectionTabs tabs={ordersTabs} active="sales" />

      <ErrorLine style={{ padding: '12px 0 0' }}>{error}</ErrorLine>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 16 }}>
        {/* ---- the order itself ------------------------------------------- */}
        <div style={{ flex: '1 1 560px', minWidth: 0, display: 'grid', gap: 20 }}>
          <section style={{ ...panel, minWidth: 0 }}>
            <PanelHead label="Order" />
            <div style={{ padding: '18px 20px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 22 }}>
              <div>
                <span style={sectionLabel}>General</span>
                <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.8 }}>
                  <div>
                    Placed: <span style={{ color: c.ink }}>{longDate(order.created_at)}</span>
                  </div>
                  <div>
                    Status:{' '}
                    <span style={{ fontWeight: 600, color: c.ink }}>{STATUS_LABELS[order.status] ?? order.status}</span>
                  </div>
                  <div>
                    Source: <span style={{ color: c.ink }}>{sourceLabel(order)}</span>{' '}
                    <span style={{ fontSize: 11 }}>({KIND_LABELS[order.kind] ?? order.kind})</span>
                  </div>
                  <div>
                    Stock: <span style={{ color: c.ink }}>{RESERVATION_LABELS[order.reservation_state] ?? order.reservation_state}</span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Sales rep:{' '}
                    <Select
                      value={order.sales_rep_user_id ?? ''}
                      disabled={busy}
                      onChange={assignRep}
                      aria-label="Sales rep"
                      style={{ ...inputStyle, height: 28, fontSize: 12, width: 'auto', display: 'inline-block' }}
                    >
                      <option value="">Unassigned</option>
                      {staff.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
              <div>
                <span style={sectionLabel}>Client</span>
                <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7 }}>
                  {/* contactLabel is the fallback chain: the account's name,
                      then its email, then the guest's — a guest order has no
                      account at all, so client_name is null on one. */}
                  <div style={{ fontWeight: 500, color: c.ink }}>{contactLabel(order)}</div>
                  {email && (
                    <div>
                      <a href={`mailto:${email}`} style={{ color: c.accent }}>{email}</a>
                    </div>
                  )}
                  {order.contact_phone && <div style={monoText}>{order.contact_phone}</div>}
                  {order.user_id != null ? (
                    <div style={{ marginTop: 6 }}>
                      <Link to={`/clients/accounts?q=${encodeURIComponent(email ?? '')}`} style={{ color: c.accent }}>
                        Open client account
                      </Link>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, fontStyle: 'italic', fontFamily: font.display }}>
                      Guest — no account.
                    </div>
                  )}
                  {/* The client's own numbers sit with the client rather than
                      in a column of their own: they are theirs, not ours. */}
                  <div style={{ marginTop: 10 }}>
                    Client reference: <span style={monoText}>{order.client_reference || '—'}</span>
                  </div>
                  {/* "Client PO" in full, always: Atelier's own purchase orders
                      are a different record entirely. */}
                  <div title={CUSTOMER_PO_HINT}>
                    Client PO number: <span style={monoText}>{order.customer_po_number || '—'}</span>
                  </div>
                  {/* The same sentence the edit form carries. Without it
                      "Reference" reads as one of ours. */}
                  <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{CLIENT_REFERENCE_HINT}</div>
                  {!editable && (
                    <div style={{ fontSize: 11, fontStyle: 'italic', fontFamily: font.display, marginTop: 4 }}>
                      Fixed — these two can no longer be edited past confirmation. Notes still can.
                    </div>
                  )}
                </div>
              </div>
              <div>
                <span style={sectionLabel}>Delivery</span>
                <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7 }}>
                  {order.shipping_zone && <div>Zone: {order.shipping_zone}</div>}
                  {address.length > 0 ? (
                    address.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
                  ) : (
                    <div style={{ fontStyle: 'italic', fontFamily: font.display }}>No address collected.</div>
                  )}
                  {deliveryPhone && <div style={monoText}>{deliveryPhone}</div>}
                  {deliveryInstructions && (
                    <div style={{ color: c.ink, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{deliveryInstructions}</div>
                  )}
                  {order.tracking_url && (
                    <div>
                      Tracking:{' '}
                      <a href={order.tracking_url} target="_blank" rel="noreferrer" style={{ color: c.accent }}>
                        {order.tracking_url}
                      </a>
                    </div>
                  )}
                  {canEditDelivery(order) && !deliveryDraft && (
                    <div style={{ marginTop: 8 }}>
                      <GhostButton disabled={busy} onClick={openDelivery}>
                        Edit delivery
                      </GhostButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Edit delivery, full width under the four blocks: nine fields
                do not fit in a quarter of the panel. Open until the order
                ships (canEditDelivery), paid included. */}
            {deliveryDraft && (
              <div style={{ padding: '18px 20px 22px', borderTop: `1px solid ${c.line}` }}>
                <span style={sectionLabel}>Edit delivery details</span>
                <div
                  style={{
                    marginTop: 12,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                  }}
                >
                  {DELIVERY_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      hint={field.hint}
                      style={field.multiline ? { gridColumn: '1 / -1' } : undefined}
                    >
                      {field.multiline ? (
                        <textarea
                          value={deliveryDraft[field.key]}
                          disabled={busy}
                          rows={2}
                          maxLength={field.max}
                          onChange={setDeliveryField(field.key)}
                          style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
                        />
                      ) : (
                        <input
                          value={deliveryDraft[field.key]}
                          disabled={busy}
                          maxLength={field.max}
                          onChange={setDeliveryField(field.key)}
                          style={field.mono ? { ...inputStyle, fontFamily: font.mono } : inputStyle}
                        />
                      )}
                    </Field>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <GhostButton tone="accent" disabled={busy} onClick={saveDelivery}>
                    Save delivery
                  </GhostButton>
                  <GhostButton disabled={busy} onClick={() => setDeliveryDraft(null)}>
                    Cancel
                  </GhostButton>
                  <span style={{ ...mutedText, fontSize: 11.5 }}>
                    Prints on the packing slip as Deliver to. Clear every field to remove the address.
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* ---- the lines and the money -------------------------------- */}
          <section style={{ ...panel, minWidth: 0 }}>
            <PanelHead
              label="Items"
              right={
                editable ? (
                  <span style={{ ...mutedText, fontSize: 11 }}>Editable until the order is paid.</span>
                ) : null
              }
            />
            {/* Editable while requested or confirmed: this is where a
                storefront request (every line priced at 0) becomes an
                invoiceable sales order. */}
            {editable ? (
              <div style={{ padding: '16px 20px 0' }}>
                <OrderLinesEditor lines={lineDrafts} onChange={setLineDrafts} busy={busy} onError={setError} />
                <div style={{ marginTop: 18, display: 'grid', gap: 10, maxWidth: 520 }}>
                  <Field label="Contact phone">
                    <input
                      value={headerDraft.contact_phone ?? ''}
                      disabled={busy}
                      maxLength={HEADER_MAX.contact_phone}
                      onChange={setHeaderField('contact_phone')}
                      style={{ ...inputStyle, fontFamily: font.mono }}
                    />
                  </Field>
                  {/* The client's own two numbers. They arrive later than the
                      order does — a PO number usually comes in a follow-up
                      email — which is why they are edited here rather than
                      fixed at creation. */}
                  <Field label="Client reference" hint={CLIENT_REFERENCE_HINT}>
                    <input
                      value={headerDraft.client_reference ?? ''}
                      disabled={busy}
                      maxLength={HEADER_MAX.client_reference}
                      onChange={setHeaderField('client_reference')}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Client PO number" hint={CUSTOMER_PO_HINT}>
                    <input
                      value={headerDraft.customer_po_number ?? ''}
                      disabled={busy}
                      maxLength={HEADER_MAX.customer_po_number}
                      onChange={setHeaderField('customer_po_number')}
                      style={{ ...inputStyle, fontFamily: font.mono }}
                    />
                  </Field>
                  {/* The discount (Rebecca-R2). Standard tiers for everyone;
                      Custom is the director-only override and is greyed out
                      (not hidden) for back-office users. The API's in-handler
                      role check is the real gate; a 403 lands in the error line. */}
                  <Field label="Discount" hint={isDirector ? undefined : DIRECTORS_ONLY_NOTE}>
                    <Select
                      value={discountDraft.mode}
                      disabled={busy}
                      onChange={(e) => setDiscountDraft((draft) => ({ ...draft, mode: e.target.value }))}
                      style={inputStyle}
                      aria-label="Discount"
                    >
                      {DISCOUNT_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={option.value === 'custom' && !isDirector}
                        >
                          {option.label}
                          {option.value === 'custom' && !isDirector ? ' (directors only)' : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {discountDraft.mode === 'custom' && (
                    <>
                      <Field label="Custom discount %">
                        <input
                          value={discountDraft.pct}
                          disabled={busy || !isDirector}
                          inputMode="decimal"
                          onChange={(e) => setDiscountDraft((draft) => ({ ...draft, pct: e.target.value }))}
                          style={{ ...inputStyle, fontFamily: font.mono, maxWidth: 120 }}
                          placeholder="e.g. 7.5"
                        />
                      </Field>
                      <Field label="Discount reason" hint={CUSTOM_DISCOUNT_HINT}>
                        <textarea
                          value={discountDraft.reason}
                          disabled={busy || !isDirector}
                          rows={2}
                          onChange={(e) => setDiscountDraft((draft) => ({ ...draft, reason: e.target.value }))}
                          style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
                          placeholder="Why this order carries a unique discount."
                        />
                      </Field>
                    </>
                  )}
                </div>
                <div
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 3,
                    marginTop: 14,
                    padding: '12px 0',
                    background: c.paper,
                    borderTop: `1px solid ${c.line}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <GhostButton tone="accent" disabled={busy} onClick={saveOrder}>
                    Save order
                  </GhostButton>
                  <GhostButton disabled={busy} onClick={discardEdits}>
                    Discard changes
                  </GhostButton>
                  <span style={{ ...mutedText, fontSize: 11.5 }}>
                    The total is recomputed from the lines (less any discount); the stock this order
                    holds moves by the difference.
                  </span>
                </div>
              </div>
            ) : (order.lines ?? []).length === 0 ? (
              <PanelNote>This order has no lines.</PanelNote>
            ) : (
              <>
                <HeaderRow
                  columns={LINE_COLUMNS}
                  labels={['SKU', 'Product', 'Quantity', 'Unit price', 'Line total', 'Stock behind it']}
                  numeric={[2, 3, 4]}
                />
                {(order.lines ?? []).map((line) => (
                  <Row key={line.id} columns={LINE_COLUMNS} style={{ alignItems: 'start' }}>
                    <span style={{ ...monoText, paddingTop: 9, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {/* The SKU opens the DESIGN on the Products screen (16 Sep
                          2026); the stock row behind it stays one press away. */}
                      {productPath(line.product_id) ? (
                        <Link to={productPath(line.product_id)} style={{ color: 'inherit' }}>
                          {line.sku}
                        </Link>
                      ) : (
                        line.sku
                      )}
                    </span>
                    <span style={{ minWidth: 0, paddingTop: 9 }}>
                      <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {productPath(line.product_id) ? (
                          <Link to={productPath(line.product_id)} style={{ color: 'inherit' }}>
                            {line.product_name}
                          </Link>
                        ) : (
                          line.product_name
                        )}
                      </span>
                      {line.colourway_name && (
                        <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>{line.colourway_name}</span>
                      )}
                      {line.cut_requirements && (
                        <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>{line.cut_requirements}</span>
                      )}
                    </span>
                    <span style={{ ...monoText, paddingTop: 9, textAlign: 'right' }}>{formatQty(line.qty, line.unit)}</span>
                    <span
                      style={
                        Number(line.unit_price_cents) === 0
                          ? { ...mutedText, paddingTop: 9, textAlign: 'right' }
                          : { ...monoText, paddingTop: 9, textAlign: 'right' }
                      }
                    >
                      {formatLinePrice(line.unit_price_cents)}
                    </span>
                    <span style={{ ...monoText, paddingTop: 9, textAlign: 'right' }}>
                      {Number(line.unit_price_cents) === 0
                        ? '—'
                        : formatCents(Math.round(toNumber(line.qty) * toNumber(line.unit_price_cents)))}
                    </span>
                    <span style={{ ...mutedText, fontSize: 11.5, paddingTop: 9, fontFamily: font.mono }}>
                      {line.inventory
                        ? `${toNumber(line.inventory.qty_available)} avail · ${toNumber(line.inventory.qty_reserved)} reserved · ${toNumber(line.reserved_qty)} this order`
                        : 'No stock row'}
                      {' · '}
                      <Link to={stockPath(line.sku)} style={{ color: c.accent }}>
                        stock
                      </Link>
                    </span>
                  </Row>
                ))}
              </>
            )}

            {/* The money, under the lines, right-aligned like an invoice. */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px 20px', borderTop: `1px solid ${c.line}` }}>
              <div style={{ minWidth: 260, ...monoText, lineHeight: 1.9 }}>
                <MoneyLine label="Subtotal" value={formatCents(order.subtotal_cents)} />
                {/* The subtotal stays un-discounted (the API's rule); this line
                    is the difference, derived from the server's own three
                    figures rather than recomputed from the pct. */}
                {hasDiscount(order) && (
                  <MoneyLine
                    label={`Discount ${formatDiscountPct(order.discount_pct)}`}
                    value={`−${formatCents(discountAmountCents(order))}`}
                    tone={c.clay}
                  />
                )}
                <MoneyLine label="Shipping" value={formatCents(order.shipping_cents)} />
                <MoneyLine label="Total" value={formatCents(order.total_cents)} strong />
                {/* GST comes from the API, derived from the total and the Xero
                    basis the invoice will use, so the figure here is the figure
                    on the invoice (Userback 8367857). Absent on an older API. */}
                {order.gst && (
                  <>
                    <MoneyLine label={gstLabel(order.gst)} value={formatCents(order.gst.gst_cents)} />
                    <MoneyLine label="Total incl. GST" value={formatCents(order.gst.total_incl_gst_cents)} strong />
                  </>
                )}
                {hasDiscount(order) && (order.discount_reason || discountAppliedBy(order)) && (
                  <div style={{ marginTop: 6, ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                    {order.discount_reason && <div>{order.discount_reason}</div>}
                    {discountAppliedBy(order) && <div>{discountAppliedBy(order)}</div>}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ---- notes ---------------------------------------------------- */}
          {/* Notes sit OUTSIDE the editable window on purpose: the office
              annotates an order long after it is paid or shipped, and the API
              takes a notes-only PATCH at any non-archived status. An archived
              order reads only — restore it to write. */}
          <section style={{ ...panel, minWidth: 0 }}>
            <PanelHead label="Notes" />
            <div style={{ padding: '16px 20px 20px' }}>
              {order.archived_at ? (
                <div style={{ ...mutedText, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{order.notes || '—'}</div>
              ) : (
                <>
                  <textarea
                    value={headerDraft.notes ?? ''}
                    disabled={busy}
                    rows={3}
                    maxLength={HEADER_MAX.notes}
                    onChange={setHeaderField('notes')}
                    aria-label="Order notes"
                    style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <GhostButton disabled={busy} onClick={saveNotes}>
                      Save notes
                    </GhostButton>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* ---- the sidebar: what happens next, the invoice, the customer -- */}
        <aside style={{ flex: '0 1 340px', minWidth: 280, display: 'grid', gap: 20 }}>
          <section style={panel}>
            <PanelHead label="Order actions" />
            <div style={{ padding: '16px 20px 20px', display: 'grid', gap: 12 }}>
              {actions.length === 0 && (
                <div style={{ ...mutedText, fontStyle: 'italic', fontFamily: font.display }}>
                  {order.archived_at ? 'Archived — restore it to act on it.' : 'Nothing further to do on this order.'}
                </div>
              )}
              {actions.some((action) => action.needsRef) && (
                <Field
                  label="Xero invoice reference"
                  hint={
                    canPushToXero(order, xeroStatus)
                      ? 'Create in Xero fills this — or record a reference you raised by hand.'
                      : 'Invoicing is manual — record the reference you raised.'
                  }
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
              {/* Same shape as the Xero-ref field above: an inline box the
                  action beside it reads. Optional — a hand-delivered order
                  ships with it empty. */}
              {actions.some((action) => action.key === 'ship') && (
                <Field label="Tracking URL (optional)" hint="Goes out in the shipped email. Leave it blank for a hand delivery.">
                  <input
                    value={trackingUrl}
                    disabled={busy}
                    maxLength={TRACKING_URL_MAX}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                    style={{ ...inputStyle, fontFamily: font.mono }}
                    placeholder="https://…"
                  />
                </Field>
              )}
              {canPushToXero(order, xeroStatus) && (
                <div>
                  <GhostButton tone="accent" disabled={busy || unpriced > 0} onClick={pushToXero}>
                    Create invoice in Xero
                  </GhostButton>
                  <div style={{ marginTop: 6 }}>
                    <CheckField
                      label="Email it from Xero"
                      checked={emailFromXero}
                      onChange={(e) => setEmailFromXero(e.target.checked)}
                      disabled={busy}
                    />
                  </div>
                </div>
              )}
              {actions.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {actions.map((action) => (
                    <GhostButton
                      key={action.key}
                      tone={action.tone}
                      disabled={busy || (needsPricing(action) && unpriced > 0)}
                      onClick={() => act(action)}
                    >
                      {action.label}
                    </GhostButton>
                  ))}
                </div>
              )}
              {/* Why Confirm / Mark paid / Create invoice are greyed: the API
                  refuses a $0.00 line with this same count. */}
              {unpriced > 0 && (actions.some(needsPricing) || canPushToXero(order, xeroStatus)) && (
                <div style={{ ...mutedText, fontSize: 12 }}>{unpricedHint(unpriced)}</div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: `1px solid ${c.line}` }}>
                <GhostButton disabled={busy} onClick={packingSlip}>
                  Packing slip
                </GhostButton>
                {/* Archive stays red on this desk even beside a Delete on the
                    list: a paid or shipped order can never be deleted, so
                    archive is the most permanent verb most orders carry. */}
                <GhostButton disabled={busy} tone={order.archived_at ? 'ink' : 'danger'} onClick={archive}>
                  {order.archived_at ? 'Restore' : 'Archive'}
                </GhostButton>
              </div>
            </div>
          </section>

          <section style={panel}>
            <PanelHead label="Invoice" />
            <div style={{ padding: '16px 20px 20px', ...mutedText, lineHeight: 1.7 }}>
              {/* A card checkout was settled at Stripe and the receipt went out
                  with it, so "Not invoiced yet" read as money outstanding. Xero
                  is a separate question on one of these — it may never be
                  pushed — which is why the two lines are stacked rather than
                  one replacing the other. */}
              {order.kind === 'checkout' && <div style={monoText}>Paid by card at checkout — receipt emailed</div>}
              {order.xero_invoice_ref ? (
                <div>
                  Xero invoice: <span style={monoText}>{order.xero_invoice_ref}</span>
                  {order.xero_invoice_status && (
                    <span style={{ marginLeft: 8 }}>— {xeroStatusLabel(order.xero_invoice_status)}</span>
                  )}
                </div>
              ) : (
                <div style={{ fontStyle: 'italic', fontFamily: font.display }}>
                  {order.kind === 'checkout' ? 'Not yet in Xero.' : 'Not invoiced yet.'}
                </div>
              )}
            </div>
          </section>

          <section style={panel}>
            <PanelHead label="Customer history" />
            <div style={{ padding: '16px 20px 20px' }}>
              <CustomerOrders email={email} excludeId={order.id} refreshKey={`${order.status}:${order.total_cents}`} />
            </div>
          </section>
        </aside>
      </div>

      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}

function MoneyLine({ label, value, strong = false, tone = null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: tone ?? (strong ? c.ink : undefined), fontWeight: strong ? 600 : 400 }}>
      <span>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}
