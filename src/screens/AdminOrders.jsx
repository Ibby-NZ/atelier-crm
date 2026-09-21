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
//   POST   /admin/orders/:id/archive|restore        → { order }
//   DELETE /admin/orders/:id                        → { deleted } | 409 { blockers }
//
// **This is the LIST, and only the list** (16 Sep 2026: the WooCommerce shape —
// "view the orders in a page, then view the individual order details in a
// separate page"). An order opens on its own page, /admin/orders/:id
// (AdminOrder.jsx), where the lines are priced, the header edited and every
// transition taken. The row here links there; it used to expand in place.
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
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  CUSTOMER_PO_HINT,
  EMPTY_ORDER_SEARCH,
  filterBySource,
  hasOrderFilters,
  ORDER_LIST_LIMIT,
  orderDraftSeed,
  orderListFilters,
  orderPath,
  orderSearchFromParams,
  orderSearchParams,
  referenceLine,
  SOURCE_FILTER_NOTE,
  sourceCountNote,
} from './adminOrders.js'
import {
  KIND_LABELS,
  ORDER_STATUSES,
  SOURCE_OPTIONS,
  STATUS_LABELS,
  STATUS_TONE,
  canDeleteOrder,
  contactLabel,
  priceTypeLabel,
  sourceLabel,
  formatOrderTotal,
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
  Select,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'

const COLUMNS = 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.5fr) 110px minmax(0, 1fr) minmax(0, 1fr) 150px'
const filterInput = { height: 34, fontSize: 12.5 }

const statusColour = { muted: c.muted, accent: c.accent, sage: c.sage, clay: c.clay }
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function AdminOrders() {
  const navigate = useNavigate()
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
  const { message } = crud.toast
  const { busy, error, setError, run } = crud.mutation

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
    setLocalSearch(searchDraft)
    setSearchParams(orderSearchParams({ ...searchDraft, status: statusFilter }), { replace: true })
  }

  const clearSearch = () => {
    setError('')
    setSearchDraft(EMPTY_ORDER_SEARCH)
    setLocalSearch(EMPTY_ORDER_SEARCH)
    setSearchParams({}, { replace: true })
  }

  // The status select commits on the spot, as it always has — it is a closed
  // list, not something typed, so there is no draft to hold back.
  const selectStatus = (value) => {
    setSearchParams(orderSearchParams({ ...search, status: value }), { replace: true })
  }

  const setSearchField = (key) => (event) =>
    setSearchDraft((draft) => ({ ...draft, [key]: event.target.value }))

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
                  onChange={(e) => setSourceFilter(e.target.value)}
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
              labels={['Order', 'Source', 'Client', 'Status', 'Total', 'Price type', '']}
              sticky
              numeric={[4]}
            />
            {visible.map((order) => (
              <Row
                key={order.id}
                columns={COLUMNS}
                archived={Boolean(order.archived_at)}
                style={{ padding: '12px 20px', lineHeight: 1.5 }}
              >
                {/* The order opens on its own page (16 Sep 2026). The number
                    is the link, as it is in every order system the office has
                    used. */}
                <Link to={orderPath(order)} className="ab-t" style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
                  <span style={{ ...monoText, display: 'block', fontSize: 13, fontWeight: 600, color: c.ink, overflowWrap: 'anywhere' }}>
                    {order.order_number}
                    {order.archived_at && <ArchivedTag />}
                  </span>
                  <span style={{ display: 'block', ...mutedText, fontSize: 11, marginTop: 4 }}>
                    {shortDate(order.created_at)}
                  </span>
                </Link>
                {/* Website or Office, with the channel underneath: the source
                    is what the client asked to see on the row, the kind is the
                    finer answer for whoever needs it. */}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, color: c.ink }}>{sourceLabel(order)}</span>
                  <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                    {KIND_LABELS[order.kind] ?? order.kind}
                  </span>
                </span>
                {/* contactLabel is the fallback chain: the account's name, then
                    its email, then the guest's — a guest order has no account
                    at all, so client_name is null on one. */}
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
                <span style={{ ...monoText, color: c.ink, fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
                  {formatOrderTotal(order)}
                </span>
                {/* Which price list the order was written off. This column
                    used to report the reservation ("Stock held"); the basis is
                    what the office reads a sales order by, and the stock a line
                    holds is on the order's own page. */}
                <span style={{ ...mutedText, fontSize: 11.5 }}>{priceTypeLabel(order)}</span>
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <GhostButton disabled={busy} onClick={() => navigate(orderPath(order))} aria-label={`Open ${order.order_number}`}>
                    Open
                  </GhostButton>
                  <GhostButton disabled={busy} tone={order.archived_at ? 'ink' : 'danger'} onClick={() => archive(order)}>
                    {order.archived_at ? 'Restore' : 'Archive'}
                  </GhostButton>
                  {/* Only where the API would allow it — a paid, shipped or
                      card-checkout order is a financial record and answers
                      409. See canDeleteOrder. */}
                  {canDeleteOrder(order) && (
                    <GhostButton disabled={busy} tone="danger" onClick={() => crud.remove.ask(order)}>
                      Delete
                    </GhostButton>
                  )}
                </span>
              </Row>
            ))}
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
