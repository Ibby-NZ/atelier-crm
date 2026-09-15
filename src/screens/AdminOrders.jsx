// Sales orders — the live order book, from atelier-api's /admin/orders. Every
// order the platform holds, whichever door it came in by: card checkouts
// recorded by the Stripe webhook, cut-to-order and backorder requests from the
// storefront, and the sales orders the office keys itself at /admin/orders/new.
//
// **This was two tabs and is now one.** "Web orders" was a second list over the
// same table, and the client asked for it folded in "with an identifier that it
// came from website". That identifier already existed — `orders.kind` — so the
// change is a Source column (Website / Office, derived by `sourceOf` in
// ../admin/orderFlow.js) and a Source filter, not a schema change. The Dynamics
// order mirror is a different data source and stays a separate, read-only tab.
//
// The Source filter is applied IN THE BROWSER, over the page already fetched:
// `GET /admin/orders` has no `kind` filter and Ajv would strip one silently. The
// count line says so rather than reporting the server's total above a narrowed
// page — see SOURCE_FILTER_NOTE in ./adminOrders.js.
//
//   GET    /admin/orders?status=&include_archived=&q=&client=&reference=
//            &po_number=&from=&to=&page=&limit=     → { orders, meta: { total, page, limit } }
//   PATCH  /admin/orders/:id                        → { order }   (lines + header + discount;
//            a body of `notes` ALONE is accepted at any non-archived status)
//   POST   /admin/orders/:id/confirm                → { order }   (+ xero_invoice_ref)
//   POST   /admin/orders/:id/mark-paid|ship|decline → { order }   (ship: { tracking_url? })
//   POST   /admin/orders/:id/archive|restore        → { order }
//   POST   /admin/xero/orders/:id/invoice           → { order, invoice }  (C4;
//            renders only when GET /admin/xero/status says configured+connected)
//   DELETE /admin/orders/:id                        → { deleted } | 409 { blockers }
//
// The state machine and every reservation move live server-side; this screen only
// offers the transitions the order can actually take (src/admin/orderFlow.js) and
// shows the 409 if the two ever disagree.
//
// The tab beside it, "Dynamics (historical)", is the D365 mirror and is
// read-only by design. This tab is the platform's own order table.
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
import { useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
// The signed-in API role. The discount control's Custom option is director-only
// (Rebecca-R2) — a DRAWING decision, like every gate in this app: the API's
// in-handler role check is the real one, and its 403 lands in the error line.
import { useAuth } from '../auth/AuthContext.jsx'
import { apiSend, safeFetch } from '../lib/api.js'
import { diffFields, draftFrom, toNumber } from '../admin/drafts.js'
import { canPushToXero } from './adminXero.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import OrderLinesEditor from '../admin/OrderLinesEditor.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { useConfirmation } from '../admin/useConfirmation.js'
import { addressLines, printOrderPackingSlip } from '../utils/orderPackingSlip.js'
import {
  CUSTOMER_PO_HINT,
  EMPTY_ORDER_SEARCH,
  filterBySource,
  hasOrderFilters,
  HEADER_MAX,
  keepTypedHeader,
  ORDER_HEADER_FIELDS,
  ORDER_LIST_LIMIT,
  orderDraftSeed,
  orderListFilters,
  orderSearchFromParams,
  orderSearchParams,
  referenceLine,
  repPatch,
  shipBody,
  SOURCE_FILTER_NOTE,
  sourceCountNote,
  staffOptions,
  TRACKING_URL_MAX,
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
  ORDER_STATUSES,
  RESERVATION_LABELS,
  SOURCE_OPTIONS,
  STATUS_LABELS,
  STATUS_TONE,
  availableActions,
  buildLinePatch,
  canDeleteOrder,
  canEditLines,
  contactLabel,
  draftFromLine,
  formatCents,
  sourceLabel,
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
} from '../admin/parts.jsx'

const COLUMNS = 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.5fr) 110px minmax(0, 1fr) minmax(0, 1fr) 150px'
const LINE_COLUMNS = '1fr 1.5fr 110px 1fr 1fr'
const filterInput = { height: 34, fontSize: 12.5 }

// Notes are the one header column the API takes at ANY non-archived status, so
// "Save notes" sends `{ notes }` and nothing else — the same `text` kind as the
// full header diff, which is what folds an emptied box to null rather than ''.
const NOTES_FIELD = ORDER_HEADER_FIELDS.filter((field) => field.key === 'notes')
// One sentence, printed under the read-only pair and used as the edit form's
// hint: "Reference" alone read as ours.
const CLIENT_REFERENCE_HINT = 'What the client calls this job — a room, a project, a name.'

const statusColour = { muted: c.muted, accent: c.accent, sage: c.sage, clay: c.clay }
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function AdminOrders() {
  const confirmation = useConfirmation()
  // Website vs office. Not a query param: see SOURCE_FILTER_NOTE.
  const [sourceFilter, setSourceFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // The committed search, and what the boxes currently hold. Two of them, the
  // AdminPriceListItems arrangement: every keystroke is not a request, and the
  // list only moves when Search is pressed.
  //
  // The committed half is split across two homes. `q`, `from`, `to` and the
  // status live in the URL, because the Report Library links a row through to
  // the order behind it and this screen is usually already mounted when it does
  // — a search held in state would ignore the link and the back button would not
  // undo it (see adminOrders.js). The other three boxes stay local: nothing
  // links to them.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSearch = orderSearchFromParams(searchParams)
  const statusFilter = urlSearch.status
  const [localSearch, setLocalSearch] = useState(EMPTY_ORDER_SEARCH)
  const search = { ...localSearch, ...urlSearch }
  const [searchDraft, setSearchDraft] = useState(EMPTY_ORDER_SEARCH)
  const [openId, setOpenId] = useState(null)
  // The open order's lines as an editable list (see draftFromLine): quantities,
  // prices, cut requirements, plus any line added from the catalogue.
  const [lineDrafts, setLineDrafts] = useState([])
  const [invoiceRef, setInvoiceRef] = useState('')
  // Optional, and only ever read by the Ship action: the office hand-delivers
  // some orders, so a blank box ships exactly as it did before.
  const [trackingUrl, setTrackingUrl] = useState('')
  const [headerDraft, setHeaderDraft] = useState({})
  // The discount control (Rebecca-R2): mode is one of DISCOUNT_OPTIONS' values,
  // pct/reason only mean anything while mode is 'custom'.
  const [discountDraft, setDiscountDraft] = useState(EMPTY_DISCOUNT_DRAFT)

  // Custom discounts are the director's door. `apiRole` is the API's own word
  // for the account (backoffice/director) — the CRM capability role maps both
  // to 'director' and cannot tell them apart.
  const isDirector = useAuth().user?.apiRole === 'director'
  // The staff roster for the Sales rep select — fetched once; a failure leaves
  // the select empty rather than breaking the queue.
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

  // The rep is an ANNOTATION the API takes at any status (back-filling a
  // shipped order is the point), so the select saves on change — no draft.
  const assignRep = (order) => (event) => {
    const patch = repPatch(event.target.value)
    if (!patch) return
    run(
      () => apiSend('PATCH', `/admin/orders/${order.id}`, patch),
      `${order.order_number} — sales rep updated.`
    )
  }
  // Whether the API has a live Xero connection (C4). null while loading; the
  // push button only renders when it says configured AND connected, so the
  // screen is identical to before on an un-integrated deployment.
  const [xeroStatus, setXeroStatus] = useState(null)
  const [emailFromXero, setEmailFromXero] = useState(false)

  // The list, the toast, the mutate-then-reload cycle and the delete flow.
  const crud = useCrudScreen({
    path: '/admin/orders',
    key: 'orders',
    limit: ORDER_LIST_LIMIT,
    filters: orderListFilters({ showArchived, ...search }),
    entity: 'order',
    describe: (order) => order.order_number,
    // A refused delete offers this instead, straight out of the 409's
    // `archivable` flag — which is the only way out for a paid order.
    archive: (order) => apiSend('POST', `/admin/orders/${order.id}/archive`, {}),
  })
  // `orders` stays the list's own array — a stable identity, which the effect
  // below depends on. `visible` is the narrowed copy the table renders; keying
  // that effect on it instead would hand it a fresh array every render and it
  // would set state for ever.
  const orders = crud.list.rows
  const visible = filterBySource(orders, sourceFilter)
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
    setTrackingUrl(order.tracking_url ?? '')
    // The header boxes are the exception: they hold what somebody is TYPING,
    // and `orders` takes a new identity after EVERY mutation (useMutation
    // always awaits reload). Re-seeding them wholesale meant assigning a rep —
    // or shipping, the annotate-then-ship workflow Notes exists for — silently
    // discarded an unsaved note. So a box that has been typed into survives the
    // reload; one still holding server truth re-seeds. `toggle` empties the
    // draft, so opening a different order always starts from that order's row.
    //
    // ponytail: "typed into" means "differs from the row just fetched". A
    // header field changed by someone ELSE meanwhile keeps the stale box until
    // the order is closed and reopened; per-field dirty tracking if that ever
    // bites.
    setHeaderDraft((draft) => keepTypedHeader(draft, draftFrom(order, ORDER_HEADER_FIELDS)))
    setDiscountDraft(discountDraftFrom(order))
  }, [openId, orders])

  // One status read decides whether the Xero push renders at all. StrictMode
  // mounts twice — the active flag keeps the stale pass silent.
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

  // Emptying the header draft here is what lets the effect above keep a typed
  // box across a reload: a draft belongs to the order it was opened on, and
  // this is the only place an order is opened.
  const toggle = (order) => {
    setError('')
    setHeaderDraft({})
    setOpenId((current) => (current === order.id ? null : order.id))
  }

  // Create the invoice IN Xero (C4): the API links the client to their Xero
  // contact, posts the invoice, and writes both identifiers back onto the
  // order — the reload fills the reference field, and confirming proceeds
  // against it exactly as if it had been typed.
  const pushToXero = (order) =>
    run(
      () => apiSend('POST', `/admin/xero/orders/${order.id}/invoice`, { email: emailFromXero }),
      `${order.order_number} — invoice created in Xero${emailFromXero ? ' and emailed' : ''}.`
    )

  // A link that arrives with a search in it has to fill the boxes as well as
  // narrow the queue — a bar reading empty over a filtered list says those are
  // all the orders there are. Keyed on the serialised THREE the boxes hold, a
  // primitive: an effect keyed on the params object would take a new identity
  // every render, and one keyed on the whole querystring also fired on the
  // status select's own URL write — erasing a search typed but not yet
  // submitted (orderDraftSeed says why).
  const draftSeed = orderDraftSeed(urlSearch)
  useEffect(() => {
    setSearchDraft((draft) => ({ ...draft, q: urlSearch.q, from: urlSearch.from, to: urlSearch.to }))
  }, [draftSeed])

  // useAdminList resets to page 1 whenever the serialised filters change, so a
  // narrower search never lands past the end of its own result set — there is
  // nothing to do here but commit what was typed.
  const runSearch = (event) => {
    event.preventDefault()
    setError('')
    setOpenId(null)
    setLocalSearch(searchDraft)
    setSearchParams(orderSearchParams({ ...searchDraft, status: statusFilter }), { replace: true })
  }

  const clearSearch = () => {
    setError('')
    setOpenId(null)
    setSearchDraft(EMPTY_ORDER_SEARCH)
    setLocalSearch(EMPTY_ORDER_SEARCH)
    setSearchParams({}, { replace: true })
  }

  // The status select commits on the spot, as it always has — it is a closed
  // list, not something typed, so there is no draft to hold back.
  const selectStatus = (value) => {
    setOpenId(null)
    setSearchParams(orderSearchParams({ ...search, status: value }), { replace: true })
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

  const act = async (order, action) => {
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
        title: `Decline ${order.order_number}?`,
        body: `Decline ${order.order_number}? Any stock it holds is released back to available.`,
        confirmLabel: 'Decline',
        confirmTone: 'ink',
      }))
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

  // Notes save on their own, because they are the one thing the office adds
  // AFTER the money is fixed — "courier collected 3pm", "client rang about the
  // second roll". The API accepts a notes-only PATCH at any non-archived
  // status; anything else in the body keeps the requested/confirmed guard.
  const saveNotes = (order) => {
    const { patch, error: invalid } = diffFields(order, headerDraft, NOTES_FIELD)
    if (invalid) return setError(invalid)
    if (Object.keys(patch).length === 0) return flash('No changes to save.')
    return run(
      () => apiSend('PATCH', `/admin/orders/${order.id}`, patch),
      `${order.order_number} — notes saved.`
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
      {/* "New sales order" is not here any more: it is a SECTION action on the
          tab strip below, so it is present on every tab of Orders rather than
          only on this one. */}
      <PageHeader
        eyebrow="Orders · live"
        title={<>Sales orders</>}
        subtitle="Every order the platform holds — from the website and from the office. Confirming records the Xero reference; shipping draws the held stock down."
      />
      <SectionTabs tabs={ordersTabs} active="sales" />

      <section style={{ ...panel, minWidth: 0, overflow: 'clip', marginTop: 16 }}>
        <PanelHead
          label="Queue"
          right={
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.inkSoft, textAlign: 'right' }}>
              {sourceCountNote({
                shown: visible.length,
                loaded: orders.length,
                total: crud.list.total,
                source: sourceFilter,
              })}
            </span>
          }
        />

        {/* The four the client asked for — client, date, reference and their PO
            number — plus the catch-all box the Dynamics mirror beside this
            screen already offers, which searches our order number too. */}
        <form
          onSubmit={runSearch}
          style={{ display: 'grid', gap: 14, padding: '14px 20px', background: c.surface, borderBottom: `1px solid ${c.line}` }}
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Field label="Search orders" style={{ flex: '1.5 1 200px' }}>
              <input
                value={searchDraft.q}
                onChange={setSearchField('q')}
                placeholder="Search order #, client, reference or PO"
                style={{ ...inputStyle, ...filterInput }}
                aria-label="Search orders"
              />
            </Field>
            <Field label="Client" style={{ flex: '1 1 150px' }}>
              <input
                value={searchDraft.client}
                onChange={setSearchField('client')}
                placeholder="Client"
                style={{ ...inputStyle, ...filterInput }}
                aria-label="Filter by client"
              />
            </Field>
            <Field label="Client reference" style={{ flex: '1 1 150px' }}>
              <input
                value={searchDraft.reference}
                onChange={setSearchField('reference')}
                placeholder="Client reference"
                style={{ ...inputStyle, ...filterInput }}
                aria-label="Filter by client reference"
              />
            </Field>
            <Field label="Client PO number" style={{ flex: '1 1 150px' }}>
              <input
                value={searchDraft.po_number}
                onChange={setSearchField('po_number')}
                placeholder="Client PO number"
                title={CUSTOMER_PO_HINT}
                style={{ ...inputStyle, ...filterInput }}
                aria-label="Filter by the client's PO number"
              />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: 14, borderTop: `1px solid ${c.line}` }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* Native date inputs: they hand back YYYY-MM-DD, which is exactly what
                  the endpoint parses, and '' until what was typed is a real date. */}
              <Field label="Ordered on or after">
                <input
                  type="date"
                  value={searchDraft.from}
                  onChange={setSearchField('from')}
                  style={{ ...inputStyle, ...filterInput, width: 170 }}
                  aria-label="Ordered on or after"
                />
              </Field>
              <Field label="Ordered on or before">
                <input
                  type="date"
                  value={searchDraft.to}
                  onChange={setSearchField('to')}
                  style={{ ...inputStyle, ...filterInput, width: 170 }}
                  aria-label="Ordered on or before"
                />
              </Field>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34 }}>
                <GhostButton type="submit" disabled={busy}>
                  Search
                </GhostButton>
                {/* Clear takes the status select with it: the committed search now
                    carries the status, so leaving it behind would clear the boxes and
                    keep narrowing the queue with a filter the bar no longer shows. */}
                {hasOrderFilters(search) && (
                  <GhostButton disabled={busy} onClick={clearSearch}>
                    Clear
                  </GhostButton>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginLeft: 'auto' }}>
              {/* The old Web orders tab, as a filter. It narrows what is already
                  loaded — the count beside it says so. */}
              <Field label="Source">
                <Select
                  value={sourceFilter}
                  disabled={busy}
                  onChange={(e) => {
                    setSourceFilter(e.target.value)
                    setOpenId(null)
                  }}
                  style={{ ...inputStyle, ...filterInput, width: 'auto' }}
                  aria-label="Filter by source"
                  title={SOURCE_FILTER_NOTE}
                >
                  <option value="">All sources</option>
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={statusFilter}
                  disabled={busy}
                  onChange={(e) => selectStatus(e.target.value)}
                  style={{ ...inputStyle, ...filterInput, width: 'auto' }}
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  {/* The dashboard's tiles deep-link these SETS; offering them
                      here keeps a linked-in filter visible instead of leaving the
                      select on a value the list is not actually showing. */}
                  <option value="open">Open — awaiting fulfilment</option>
                  <option value="sold">Sold — paid or shipped</option>
                  {ORDER_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />{' '}
                Show archived
              </label>
            </div>
          </div>
        </form>
        {sourceFilter && <PanelNote>{SOURCE_FILTER_NOTE}</PanelNote>}

        <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
        {crud.list.status === 'loading' && <PanelNote>Loading orders…</PanelNote>}
        {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
        {/* "Nothing matches" and "there is nothing yet" are opposite answers;
            showing the second one under a search reads as a broken screen. */}
        {crud.list.status === 'ready' && visible.length === 0 && (
          <PanelNote>
            {hasOrderFilters(search) || sourceFilter
              ? 'No orders match those filters.'
              : 'No orders yet.'}
          </PanelNote>
        )}

        {crud.list.status === 'ready' && visible.length > 0 && (
          <>
            <HeaderRow
              columns={COLUMNS}
              labels={['Order', 'Source', 'Client', 'Status', 'Total', 'Stock', '']}
              sticky
              numeric={[4]}
            />
            {visible.map((order) => {
              const open = openId === order.id
              const actions = availableActions(order)
              const editable = canEditLines(order)
              const address = addressLines(order.shipping_address)
              return (
                <div key={order.id}>
                  <Row
                    columns={COLUMNS}
                    archived={Boolean(order.archived_at)}
                    style={{ paddingTop: 12, paddingBottom: 12, lineHeight: 1.5, ...(open ? { background: c.surface, borderLeft: `3px solid ${c.accent}`, paddingLeft: 17 } : {}) }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(order)}
                      aria-expanded={open}
                      className="ab-t"
                      style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                    >
                      <span style={{ ...monoText, display: 'block', fontSize: 13, fontWeight: 600, color: c.ink, overflowWrap: 'anywhere' }}>
                        {order.order_number}
                        {order.archived_at && <ArchivedTag />}
                      </span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11, marginTop: 4 }}>
                        {shortDate(order.created_at)}
                      </span>
                    </button>
                    {/* Website or Office, with the channel underneath: the
                        source is what the client asked to see on the row, the
                        kind is the finer answer for whoever needs it. */}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, color: c.ink }}>
                        {sourceLabel(order)}
                      </span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                        {KIND_LABELS[order.kind] ?? order.kind}
                      </span>
                    </span>
                    {/* contactLabel is the fallback chain: the account's name,
                        then its email, then the guest's — a guest order has no
                        account at all, so client_name is null on one. */}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ ...mutedText, display: 'block', fontWeight: 500, color: c.ink, overflowWrap: 'anywhere' }}>
                        {contactLabel(order)}
                      </span>
                      {referenceLine(order) && (
                        <span style={{ ...mutedText, display: 'block', fontSize: 11, marginTop: 4, overflowWrap: 'anywhere' }}>
                          {referenceLine(order)}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: statusColour[STATUS_TONE[order.status]] ?? c.muted }}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span style={{ ...monoText, color: c.ink, fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{formatCents(order.total_cents)}</span>
                    <span style={{ ...mutedText, fontSize: 11.5 }}>
                      {RESERVATION_LABELS[order.reservation_state] ?? order.reservation_state}
                    </span>
                    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                    <div style={{ padding: '20px 20px 24px 17px', background: c.surface, borderLeft: `3px solid ${c.accent}`, borderBottom: `1px solid ${c.line}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                        <div>
                          <span style={sectionLabel}>Money</span>
                          <div style={{ marginTop: 10, ...monoText, lineHeight: 1.8 }}>
                            <div>Subtotal {formatCents(order.subtotal_cents)}</div>
                            {/* The subtotal stays un-discounted (the API's rule);
                                this line is the difference, derived from the
                                server's own three figures rather than recomputed
                                from the pct — the API owns the rounding. */}
                            {hasDiscount(order) && (
                              <div style={{ color: c.clay }}>
                                Discount {formatDiscountPct(order.discount_pct)} −
                                {formatCents(discountAmountCents(order))}
                              </div>
                            )}
                            <div>Shipping {formatCents(order.shipping_cents)}</div>
                            <div style={{ color: c.ink, fontWeight: 500 }}>
                              Total {formatCents(order.total_cents)}
                            </div>
                          </div>
                          {hasDiscount(order) && (order.discount_reason || discountAppliedBy(order)) && (
                            <div style={{ marginTop: 8, ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                              {order.discount_reason && <div>{order.discount_reason}</div>}
                              {discountAppliedBy(order) && <div>{discountAppliedBy(order)}</div>}
                            </div>
                          )}
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
                            {order.tracking_url && (
                              <div>
                                Tracking:{' '}
                                <a
                                  href={order.tracking_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: c.accent }}
                                >
                                  {order.tracking_url}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <span style={sectionLabel}>Invoice</span>
                          <div style={{ marginTop: 10 }}>
                            {/* A card checkout was settled at Stripe and the
                                receipt went out with it, so "Not invoiced yet"
                                read as money outstanding. Xero is a separate
                                question on one of these — it may never be
                                pushed — which is why the two lines are stacked
                                rather than one replacing the other. */}
                            {order.kind === 'checkout' && (
                              <div style={{ ...monoText, marginBottom: 6 }}>
                                Paid by card at checkout — receipt emailed
                              </div>
                            )}
                            {order.xero_invoice_ref ? (
                              <span style={monoText}>{order.xero_invoice_ref}</span>
                            ) : (
                              <span style={{ ...mutedText, fontStyle: 'italic', fontFamily: font.display }}>
                                {order.kind === 'checkout' ? 'Not yet in Xero.' : 'Not invoiced yet.'}
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
                              Client reference:{' '}
                              <span style={monoText}>{order.client_reference || '—'}</span>
                            </div>
                            {/* "Client PO" in full, always: Atelier's own
                                purchase orders are a different record entirely. */}
                            <div title={CUSTOMER_PO_HINT}>
                              Client PO number:{' '}
                              <span style={monoText}>{order.customer_po_number || '—'}</span>
                            </div>
                            {/* The same sentence the edit form carries. Without
                                it "Reference" reads as one of ours. */}
                            <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                              {CLIENT_REFERENCE_HINT}
                            </div>
                            <div style={{ marginTop: 8 }}>
                              Sales rep:{' '}
                              <Select
                                value={order.sales_rep_user_id ?? ''}
                                disabled={busy}
                                onChange={assignRep(order)}
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
                            {/* The API refuses a PATCH outside requested /
                                confirmed, so these two stop being editable at
                                the same moment the lines do. */}
                            {!editable && (
                              <div style={{ fontSize: 11, fontStyle: 'italic', fontFamily: font.display }}>
                                Fixed — these two can no longer be edited past confirmation. Notes still can.
                              </div>
                            )}
                            <div style={{ marginTop: 10 }}>
                              <GhostButton disabled={busy} onClick={() => packingSlip(order)}>
                                Packing slip
                              </GhostButton>
                            </div>
                          </div>
                        </div>
                        {/* Notes sit OUTSIDE the editable window on purpose:
                            the office annotates an order long after it is paid
                            or shipped, and the API takes a notes-only PATCH at
                            any non-archived status. An archived order reads
                            only — restore it to write. */}
                        <div>
                          <span style={sectionLabel}>Notes</span>
                          {order.archived_at ? (
                            <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                              {order.notes || '—'}
                            </div>
                          ) : (
                            <div style={{ marginTop: 10 }}>
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
                                <GhostButton disabled={busy} onClick={() => saveNotes(order)}>
                                  Save notes
                                </GhostButton>
                              </div>
                            </div>
                          )}
                        </div>
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
                            <Field label="Contact phone">
                              <input
                                value={headerDraft.contact_phone ?? ''}
                                disabled={busy}
                                maxLength={HEADER_MAX.contact_phone}
                                onChange={setHeaderField('contact_phone')}
                                style={{ ...inputStyle, fontFamily: font.mono }}
                              />
                            </Field>
                            {/* The client's own two numbers. They arrive later
                                than the order does — a PO number usually comes
                                in a follow-up email — which is why they are
                                edited here rather than fixed at creation. */}
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
                            {/* The discount (Rebecca-R2). Standard tiers for
                                everyone; Custom is the director-only override
                                and is greyed out (not hidden — an option that
                                exists but is not yours reads better than one
                                that appears for some logins) for back-office
                                users. The API's in-handler role check is the
                                real gate; a 403 lands in the error line. */}
                            <Field
                              label="Discount"
                              hint={isDirector ? undefined : DIRECTORS_ONLY_NOTE}
                            >
                              <Select
                                value={discountDraft.mode}
                                disabled={busy}
                                onChange={(e) =>
                                  setDiscountDraft((draft) => ({ ...draft, mode: e.target.value }))
                                }
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
                                    {option.value === 'custom' && !isDirector
                                      ? ' (directors only)'
                                      : ''}
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
                                    onChange={(e) =>
                                      setDiscountDraft((draft) => ({ ...draft, pct: e.target.value }))
                                    }
                                    style={{ ...inputStyle, fontFamily: font.mono, maxWidth: 120 }}
                                    placeholder="e.g. 7.5"
                                  />
                                </Field>
                                <Field
                                  label="Discount reason"
                                  hint={CUSTOM_DISCOUNT_HINT}
                                >
                                  <textarea
                                    value={discountDraft.reason}
                                    disabled={busy || !isDirector}
                                    rows={2}
                                    onChange={(e) =>
                                      setDiscountDraft((draft) => ({ ...draft, reason: e.target.value }))
                                    }
                                    style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
                                    placeholder="Why this order carries a unique discount."
                                  />
                                </Field>
                              </>
                            )}
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
                                numeric={[2, 3]}
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
                                  <span style={{ ...monoText, paddingTop: 9, textAlign: 'right' }}>{line.qty ?? '—'}</span>
                                  <span style={{ ...monoText, paddingTop: 9, textAlign: 'right' }}>
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
                                hint={
                                  canPushToXero(order, xeroStatus)
                                    ? 'Create in Xero fills this — or record a reference you raised by hand.'
                                    : 'Invoicing is manual — record the reference you raised.'
                                }
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
                            {/* Same shape as the Xero-ref field above: an
                                inline box the action beside it reads. Optional
                                — a hand-delivered order ships with it empty. */}
                            {actions.some((action) => action.key === 'ship') && (
                              <Field
                                label="Tracking URL (optional)"
                                hint="Goes out in the shipped email. Leave it blank for a hand delivery."
                                style={{ maxWidth: 320 }}
                              >
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
                              <div style={{ marginBottom: 2 }}>
                                <GhostButton
                                  tone="accent"
                                  disabled={busy}
                                  onClick={() => pushToXero(order)}
                                >
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
                      {editable && (
                          <div style={{ position: 'sticky', bottom: 0, zIndex: 3, marginTop: 14, padding: '12px 0', background: c.surface, borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                            <GhostButton tone="accent" disabled={busy} onClick={() => saveOrder(order)}>
                              Save order
                            </GhostButton>
                            <GhostButton disabled={busy} onClick={() => toggle(order)}>
                              Cancel
                            </GhostButton>
                            <span style={{ ...mutedText, fontSize: 11.5 }}>
                              The total is recomputed from the lines (less any discount); the
                              stock this order holds moves by the difference.
                            </span>
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
      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
