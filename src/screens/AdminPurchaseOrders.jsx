// Purchase orders — LIVE, on atelier-api's /admin/purchase-orders. This replaces
// the demo screen that was backed by localStorage; /purchase-orders now
// redirects here.
//
//   GET    /admin/purchase-orders?status=&brand_id=&supplier_id=&from=&to=&page=&limit=
//                                            → { purchase_orders, meta }
//   POST   /admin/purchase-orders/plan       → { plan }   DRY RUN — writes nothing
//   POST   /admin/purchase-orders/generate   → { purchase_orders, blocked, candidate_lines }
//   DELETE /admin/purchase-orders/:id        → 200, or 409 { message, blockers }
//
// **Plan before generate, structurally.** They are two routes rather than one
// with a `?dry_run=` flag, and they run the SAME planner server-side — so what
// the office reads here is exactly what will be written, and the Raise button
// does not exist until a plan has come back. Same shape AdminProductSheet's
// validate/apply takes.
//
// **A house with no supplier is reported, never guessed.** `supplier_id` is
// derived from `brands.supplier_id`; the plan puts such a house in `blocked`
// with a sentence naming it, and this screen renders that list rather than
// dropping it — it fires on most houses until `backfill:suppliers` has run, and
// it is the thing to schedule, not discover.
//
// Every rule is in ./adminPurchaseOrders.js; this file is layout.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  sectionLabel,
} from '../admin/parts.jsx'
import {
  EMPTY_PURCHASE_ORDER_SEARCH,
  PURCHASE_ORDERS_PATH,
  PURCHASE_ORDER_LIST_LIMIT,
  PURCHASE_ORDER_STATUSES,
  RECEIPT_LABELS,
  RECEIPT_TONE,
  STATUS_LABELS,
  canDeletePurchaseOrder,
  closedShort,
  describePurchaseOrder,
  generateBody,
  generatePath,
  hasPurchaseOrderFilters,
  outstandingLabel,
  planLineLabel,
  planPath,
  planSummary,
  purchaseOrderFilters,
  purchaseOrderRoute,
  qtyText,
} from './adminPurchaseOrders.js'

const COLUMNS = '150px 1.4fr 110px 1fr 1fr 110px 110px'
const filterInput = { height: 34, fontSize: 12.5 }
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function AdminPurchaseOrders() {
  const [searchDraft, setSearchDraft] = useState(EMPTY_PURCHASE_ORDER_SEARCH)
  const [search, setSearch] = useState(EMPTY_PURCHASE_ORDER_SEARCH)
  const [brands, setBrands] = useState([])
  // The dry run, held until it is raised or dismissed. Null means "not planned".
  const [plan, setPlan] = useState(null)
  const [planning, setPlanning] = useState(false)

  const crud = useCrudScreen({
    path: PURCHASE_ORDERS_PATH,
    key: 'purchase_orders',
    limit: PURCHASE_ORDER_LIST_LIMIT,
    filters: purchaseOrderFilters(search),
    entity: 'purchase order',
    describe: describePurchaseOrder,
    // No `archive` action: `purchase_orders` has no `archived_at` column and the
    // API says `archivable: false`, so a refusal correctly offers Cancel alone —
    // `cancelled` and `closed` are what take a finished order off this list, and
    // they say WHY, which an archive flag cannot.
  })
  const rows = crud.list.rows
  const { busy, error, setError, run } = crud.mutation

  // The house filter's options, and what the derivation is up against. Read once
  // — /admin/brands returns the whole list with no meta.
  useEffect(() => {
    let active = true
    apiFetch('/admin/brands')
      .then((body) => {
        if (active) setBrands(body.brands ?? [])
      })
      .catch(() => {
        // A filter that could not load is not a broken screen: the list still
        // works unfiltered, and every real refusal surfaces on the list itself.
        if (active) setBrands([])
      })
    return () => {
      active = false
    }
  }, [])

  const runSearch = (event) => {
    event.preventDefault()
    setError('')
    setSearch(searchDraft)
  }

  const clearSearch = () => {
    setError('')
    setSearchDraft(EMPTY_PURCHASE_ORDER_SEARCH)
    setSearch(EMPTY_PURCHASE_ORDER_SEARCH)
  }

  const setSearchField = (key) => (event) =>
    setSearchDraft((draft) => ({ ...draft, [key]: event.target.value }))

  // The dry run. Deliberately NOT through crud.mutation.run: it writes nothing,
  // so reloading the list would say something happened, and the catch there
  // flattens the result away.
  const runPlan = async () => {
    setError('')
    setPlanning(true)
    try {
      const body = await apiSend('POST', planPath, {})
      setPlan(body.plan ?? null)
    } catch (err) {
      setError(messageOf(err, 'Could not read the open demand.'))
    } finally {
      setPlanning(false)
    }
  }

  // The same grouping, written. `brand_ids` are the houses just previewed, so a
  // house that has become unlinked in between is a 422 naming it rather than a
  // silent omission.
  const generate = async () => {
    const ok = await run(
      () => apiSend('POST', generatePath, generateBody(plan)),
      (result) => {
        const made = result.purchase_orders?.length ?? 0
        return made === 0
          ? 'Nothing was raised — re-run the plan to see what is left.'
          : `${made} purchase order${made === 1 ? '' : 's'} raised.`
      }
    )
    if (ok) setPlan(null)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Orders · live"
        title={<>Purchase orders</>}
        subtitle="What Atelier has on order with the houses. Raise them from the day's open sales demand, or key one by hand; goods are booked in against the lines."
      />
      <SectionTabs tabs={ordersTabs} active="purchase" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Raise from open demand"
            right={
              <span style={{ display: 'flex', gap: 8 }}>
                <GhostButton disabled={busy || planning} onClick={runPlan}>
                  {plan ? 'Re-run the plan' : 'Plan today’s demand'}
                </GhostButton>
                {plan && (
                  <GhostButton disabled={busy} onClick={() => setPlan(null)}>
                    Dismiss
                  </GhostButton>
                )}
              </span>
            }
          />
          <div style={{ padding: '14px 20px', ...mutedText, lineHeight: 1.6 }}>
            The plan is a preview: it writes nothing. It groups every open
            sales-order line that is not already covered by a purchase order,{' '}
            <strong>by house</strong> — so one supplier selling two houses
            correctly produces two purchase orders, each with its own paper.
          </div>
          {planning && <PanelNote>Reading the open demand…</PanelNote>}
          {plan && <PlanPreview plan={plan} busy={busy} onGenerate={generate} />}
        </section>

        <section style={panel}>
          <PanelHead
            label="Purchase orders"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {crud.list.total.toLocaleString('en-NZ')} matching
              </span>
            }
          />

          <form
            onSubmit={runSearch}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}
          >
            <select
              value={searchDraft.status}
              onChange={setSearchField('status')}
              style={{ ...inputStyle, ...filterInput, width: 'auto' }}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {PURCHASE_ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={searchDraft.brand_id}
              onChange={setSearchField('brand_id')}
              style={{ ...inputStyle, ...filterInput, width: 200 }}
              aria-label="Filter by house"
            >
              <option value="">All houses</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={searchDraft.from}
              onChange={setSearchField('from')}
              style={{ ...inputStyle, ...filterInput, width: 145 }}
              aria-label="Raised on or after"
            />
            <input
              type="date"
              value={searchDraft.to}
              onChange={setSearchField('to')}
              style={{ ...inputStyle, ...filterInput, width: 145 }}
              aria-label="Raised on or before"
            />
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
            {hasPurchaseOrderFilters(search) && (
              <GhostButton disabled={busy} onClick={clearSearch}>
                Clear
              </GhostButton>
            )}
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {crud.list.status === 'loading' && <PanelNote>Loading purchase orders…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && rows.length === 0 && (
            <PanelNote>
              {hasPurchaseOrderFilters(search)
                ? 'No purchase order matches those filters.'
                : 'No purchase orders yet — plan the open demand above, or key one by hand.'}
            </PanelNote>
          )}

          {crud.list.status === 'ready' && rows.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['Number', 'House · supplier', 'Status', 'Received', 'Quantities', 'Expected', '']}
              />
              {rows.map((row) => (
                <Row key={row.id} columns={COLUMNS}>
                  <span style={{ minWidth: 0 }}>
                    <Link
                      to={purchaseOrderRoute(row.id)}
                      className="ab-link"
                      style={{ ...monoText, fontSize: 12.5, color: c.accent, textDecoration: 'none' }}
                    >
                      {row.po_number}
                    </Link>
                    <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                      {shortDate(row.created_at)}
                    </span>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.brand_name}
                    </span>
                    {/* The snapshot, as the paper said on the day — never
                        re-read from the supplier record. */}
                    <span style={{ display: 'block', ...mutedText, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.supplier_name || 'No supplier named'}
                    </span>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, color: c.ink }}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    {/* Closed is NOT full. A purchase order closed short is a
                        decision somebody took, and drawing only "Closed" reads
                        as "it all came in". */}
                    {closedShort(row) && (
                      <span style={{ display: 'block', fontSize: 11, color: c.clay }}>Closed short</span>
                    )}
                  </span>
                  <span>
                    <StatusPill tone={RECEIPT_TONE[row.receipt_state] ?? 'muted'}>
                      {RECEIPT_LABELS[row.receipt_state] ?? row.receipt_state}
                    </StatusPill>
                  </span>
                  <span style={{ ...monoText, fontSize: 11.5 }}>
                    {qtyText(row.qty_received)} of {qtyText(row.qty_ordered)} ·{' '}
                    {outstandingLabel(row.qty_outstanding)} out
                  </span>
                  <span style={{ ...monoText, fontSize: 11.5 }}>{shortDate(row.expected_at)}</span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={purchaseOrderRoute(row.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    {/* Only on a draft nothing has arrived against: a receipt
                        and an allocation each RESTRICT the delete, and the
                        API's 409 stays the gate if the row moves. */}
                    {canDeletePurchaseOrder(row) && (
                      <GhostButton disabled={busy} tone="danger" onClick={() => crud.remove.ask(row)}>
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
          unit="purchase orders"
          onPage={crud.list.setPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={crud.toast.message} />
    </div>
  )
}

// --- sub-components (house style: at the bottom of the screen file) ---------

// The dry run, drawn. Groups first, then the houses that cannot be ordered from
// at all — which is a list to act on, not an error.
function PlanPreview({ plan, busy, onGenerate }) {
  const groups = plan.groups ?? []
  const blocked = plan.blocked ?? []
  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ ...mutedText, fontSize: 12.5, color: c.ink, marginBottom: 14 }}>
        {planSummary(plan)}
      </div>

      {groups.map((group) => (
        <div key={group.brand_id} style={{ ...panel, marginBottom: 12, background: c.paper }}>
          <div style={{ padding: '11px 14px', borderBottom: `1px solid ${c.line}`, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: c.ink }}>
              {group.brand_name}
              <span style={{ ...mutedText, fontSize: 11.5 }}>
                {' '}· invoiced by {group.supplier_name || 'an unnamed supplier'}
              </span>
            </span>
            <span style={{ ...monoText, fontSize: 11.5 }}>
              {group.line_count} line{group.line_count === 1 ? '' : 's'} · {group.total_qty} ·{' '}
              {group.order_count} sales order{group.order_count === 1 ? '' : 's'}
            </span>
          </div>
          {(group.lines ?? []).map((line) => (
            <div
              key={line.colourway_id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 90px', gap: 12, padding: '8px 14px', borderBottom: `1px solid ${c.line}` }}
            >
              <span style={{ ...monoText, fontSize: 11.5 }}>{line.sku}</span>
              <span style={{ fontSize: 12.5, color: c.inkSoft, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {line.product_name}
                <span style={{ ...mutedText, fontSize: 11 }}> · {planLineLabel(line)}</span>
              </span>
              <span style={{ ...monoText, fontSize: 12, textAlign: 'right' }}>{line.qty_ordered}</span>
            </div>
          ))}
        </div>
      ))}

      {blocked.length > 0 && (
        <div style={{ ...panel, background: c.surface, marginBottom: 12 }}>
          <div style={{ padding: '11px 14px', borderBottom: `1px solid ${c.line}` }}>
            <span style={sectionLabel}>Cannot be ordered from</span>
          </div>
          {blocked.map((entry) => (
            <div key={entry.brand_id} style={{ padding: '10px 14px', borderBottom: `1px solid ${c.line}` }}>
              {/* The API's own sentence, verbatim: it names the house and the
                  fix, and re-phrasing it here would lose one or the other. */}
              <span style={{ fontSize: 12.5, color: c.clay }}>{entry.message}</span>
              <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                {entry.order_line_ids?.length ?? 0} open sales-order line
                {(entry.order_line_ids?.length ?? 0) === 1 ? '' : 's'} waiting ·{' '}
                <Link to="/admin/brands" className="ab-link" style={{ color: c.accent, textDecoration: 'none' }}>
                  link a supplier on Houses →
                </Link>
              </span>
            </div>
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <GhostButton tone="accent" disabled={busy} onClick={onGenerate}>
            Raise {groups.length} purchase order{groups.length === 1 ? '' : 's'}
          </GhostButton>
          <span style={{ ...mutedText, fontSize: 11.5 }}>
            One transaction: either the whole run happened or none of it did.
          </span>
        </div>
      )}
    </div>
  )
}
