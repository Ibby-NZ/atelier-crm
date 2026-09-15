// One supplier invoice — LIVE, on atelier-api (W14). The reconciliation desk:
// the bill as the paper states it, the purchase orders it covers, and the two
// derived differences between them.
//
//   GET    /admin/supplier-invoices/:id                    → { supplier_invoice }
//   PATCH  /admin/supplier-invoices/:id                    → { supplier_invoice }
//   GET    /admin/supplier-invoices/unbilled?…             → { purchase_orders, meta }
//   POST   /admin/supplier-invoices/:id/allocations        → { supplier_invoice }  (201)
//   DELETE /admin/supplier-invoices/:id/allocations/:poId  → { supplier_invoice }
//
// **Four rules this screen exists to get right**, each from the API's own design:
//
//   · **The derived figures are READ, never recomputed.** `allocated_amount`,
//     `unallocated_amount`, `purchase_orders_cost` and `variance` arrive on the
//     document, summed and rounded server-side; every write answers with the
//     whole invoice and the reload is what makes them true again. A browser
//     summing the allocations itself drifts from the server's round4.
//   · **The two differences answer different questions and are drawn as two.**
//     Unallocated is how far through the reconciliation the office is;
//     variance is whether the house billed what it quoted — measured against
//     the FULL total, freight and duty included, because apportioning a
//     non-line charge is a rule the client still owes (the two amounts sit
//     beside it so a person can do the subtraction themselves). Neither is
//     ever clamped: over-allocated shows in clay, not as zero.
//   · **Attach and detach are verbs with their own refusals.** The 409 names
//     the invoice that already holds the purchase order; the 422 names one
//     raised for another house. Both sentences are surfaced verbatim. Detach
//     is confirmed first — it is a hard delete of the join row, and the stated
//     amount goes with it.
//   · **Money is finance-gated server-side and a masked figure is DELETED from
//     the payload**, so the money stats, columns and header inputs are drawn
//     from `showsMoney` — a login without the grant works the bill's identity
//     and its purchase orders without blanked figures, and is never offered an
//     amount box whose saved value it could not read back.
//
// The house itself has no input anywhere here: an invoice keyed against the
// wrong house is deleted and re-entered, because moving it would strand every
// attached purchase order under the old supplier agreement.
//
// Every rule is in ./adminSupplierInvoices.js; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiDelete, apiFetch, apiSend } from '../lib/api.js'
import { buildListQuery, listPath } from '../admin/list.js'
import { draftFrom } from '../admin/drafts.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
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
  inputStyle,
  messageOf,
  monoCellInput,
  monoText,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  EMPTY_UNBILLED_SEARCH,
  MASKED_MONEY_NOTE,
  STATUS_LABELS,
  STATUS_TONE,
  SUPPLIER_INVOICE_STATUSES,
  allocationAmountText,
  allocationCountLabel,
  allocationsPath,
  allocationPath,
  buildAttachBody,
  buildUnbilledFilters,
  detachDialog,
  headerFieldsFor,
  invoiceDateText,
  invoiceHeaderPatch,
  moneyText,
  poCostText,
  showsMoney,
  supplierInvoicePath,
  unbilledPath,
  varianceLabel,
  varianceTone,
  unallocatedLabel,
  unallocatedTone,
} from './adminSupplierInvoices.js'
import {
  STATUS_LABELS as PO_STATUS_LABELS,
  STATUS_TONE as PO_STATUS_TONE,
  purchaseOrderRoute,
} from './adminPurchaseOrders.js'

const ALLOC_COLUMNS = '150px 1.2fr 100px 130px 150px 1fr 100px'
const ALLOC_COLUMNS_NO_MONEY = '150px 1.3fr 110px 1fr 100px'
const HIT_COLUMNS = '150px 1.1fr 100px 140px 130px 100px'
const HIT_COLUMNS_NO_MONEY = '150px 1.4fr 110px 100px'
const filterInput = { height: 34, fontSize: 12.5 }
const toneColor = { sage: c.sage, clay: c.clay, muted: c.muted }
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function AdminSupplierInvoice() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [invoice, setInvoice] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [headerDraft, setHeaderDraft] = useState({})
  // The matching search: its filters, its hits, and a per-hit amount box.
  const [unbilledDraft, setUnbilledDraft] = useState(EMPTY_UNBILLED_SEARCH)
  const [hits, setHits] = useState(null)
  const [searching, setSearching] = useState(false)
  const [amounts, setAmounts] = useState({})
  // The allocation under the detach dialog; null means it is closed.
  const [detachFor, setDetachFor] = useState(null)

  const load = useCallback(async () => {
    const body = await apiFetch(supplierInvoicePath(id))
    setInvoice(body.supplier_invoice ?? null)
    return body.supplier_invoice ?? null
  }, [id])

  // useMutation's cycle, with the DETAIL read standing in for a list reload:
  // every write answers with the whole invoice, and re-reading it is what makes
  // the derived allocation figures true again.
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
        setLoadError(messageOf(err, 'Could not load this supplier invoice.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Re-seed the header draft from server truth whenever the invoice reloads —
  // an attach or a detach re-derives every figure on it.
  useEffect(() => {
    if (!invoice) return
    // Seeded from the same declaration the save diffs (headerFieldsFor), so
    // the two cannot disagree about which keys exist for this login.
    setHeaderDraft(draftFrom(invoice, headerFieldsFor(invoice)))
  }, [invoice])

  if (status === 'missing') {
    return (
      <NotFound
        title="Supplier invoice not found"
        backTo="/admin/supplier-invoices"
        backLabel="Back to supplier invoices"
        message="That supplier invoice could not be found — it may have been deleted and re-entered, or the link is out of date."
      />
    )
  }
  if (status === 'loading') return <PanelNote>Loading supplier invoice…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{loadError}</PanelNote>
  if (!invoice) return null

  const money = showsMoney(invoice)
  const allocations = invoice.purchase_orders ?? []
  const allocColumns = money ? ALLOC_COLUMNS : ALLOC_COLUMNS_NO_MONEY
  const hitColumns = money ? HIT_COLUMNS : HIT_COLUMNS_NO_MONEY

  const setHeaderField = (key) => (event) =>
    setHeaderDraft((draft) => ({ ...draft, [key]: event.target.value }))
  const setUnbilledField = (key) => (event) =>
    setUnbilledDraft((draft) => ({ ...draft, [key]: event.target.value }))

  const save = () => {
    const outcome = invoiceHeaderPatch(invoice, headerDraft)
    if (outcome.error) return setError(outcome.error)
    // The route's anyOf refuses a body with no recognised key, so a no-op save
    // never leaves the screen.
    if (Object.keys(outcome.patch).length === 0) return flash('No changes to save.')
    return run(
      () => apiSend('PATCH', supplierInvoicePath(invoice.id), outcome.patch),
      `${invoice.invoice_number} saved.`
    )
  }

  const searchUnbilled = async (event) => {
    event?.preventDefault()
    const built = buildUnbilledFilters(unbilledDraft, invoice.supplier_id)
    if (!built.ok) return setError(built.error)
    setError('')
    setSearching(true)
    try {
      const body = await apiFetch(listPath(unbilledPath, buildListQuery(built.filters)))
      setHits(body.purchase_orders ?? [])
    } catch (err) {
      // The API's own sentence wins — an amount search from a login without
      // finance visibility is a 403 WITH A REASON, and re-phrasing it here
      // would lose the part a person can act on.
      setError(messageOf(err, 'Could not search the unbilled purchase orders.'))
    } finally {
      setSearching(false)
    }
    return undefined
  }

  const attach = async (hit) => {
    const built = buildAttachBody(hit.id, amounts[hit.id] ?? '')
    if (!built.ok) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', allocationsPath(invoice.id), built.body),
      `${hit.po_number} attached to ${invoice.invoice_number}.`
    )
    if (ok) {
      // No longer unbilled, by the server's own definition of the search — so
      // it leaves the pick list rather than offering a second attach that can
      // only 409.
      setHits((current) => (current ?? []).filter((row) => row.id !== hit.id))
      setAmounts((current) => ({ ...current, [hit.id]: '' }))
    }
    return undefined
  }

  const confirmDetach = async () => {
    if (!detachFor) return
    const ok = await run(
      () => apiDelete(allocationPath(invoice.id, detachFor.purchase_order_id)),
      `${detachFor.po_number} detached.`
    )
    if (ok) {
      setDetachFor(null)
      // A detached purchase order is unbilled again; a stale pick list that
      // does not offer it back would read as "it vanished".
      setHits(null)
    }
  }

  const dialog = detachDialog(detachFor ?? {})

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Link to="/admin/supplier-invoices" className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>← Back to supplier invoices</Link>
            {' · live'}
          </>
        }
        title={
          <>
            <span style={{ fontFamily: font.mono, fontSize: 28 }}>{invoice.invoice_number}</span> —{' '}
            {invoice.supplier_name}
          </>
        }
        subtitle={`Dated ${invoiceDateText(invoice.invoice_date)}${invoice.currency ? ` · ${invoice.currency}` : ''} — the house as the paper said on the day, never re-read from the supplier record.`}
      />
      <SectionTabs tabs={ordersTabs} active="invoices" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Reconciliation"
            right={
              <StatusPill tone={STATUS_TONE[invoice.status] ?? 'muted'}>
                {STATUS_LABELS[invoice.status] ?? invoice.status}
              </StatusPill>
            }
          />
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            {!money && <PanelNote>{MASKED_MONEY_NOTE}</PanelNote>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 18 }}>
              {money && <Stat label="Total" value={moneyText(invoice.total_amount, invoice.currency)} />}
              {money && <Stat label="Allocated" value={moneyText(invoice.allocated_amount, invoice.currency)} />}
              {money && (
                <Stat
                  label="Unallocated"
                  value={unallocatedLabel(invoice)}
                  tone={toneColor[unallocatedTone(invoice)]}
                />
              )}
              {/* What those purchase orders SAID they would cost — absent while
                  any of them carries an unpriced line, never a partial figure
                  passed off as the whole. */}
              {money && (
                <Stat label="Quoted cost" value={moneyText(invoice.purchase_orders_cost, invoice.currency)} />
              )}
              {money && (
                <Stat label="Variance" value={varianceLabel(invoice)} tone={toneColor[varianceTone(invoice)]} />
              )}
              {money && <Stat label="Freight" value={moneyText(invoice.freight_amount, invoice.currency)} />}
              {money && <Stat label="Duty" value={moneyText(invoice.duty_amount, invoice.currency)} />}
              {money && (
                <Stat label="FX rate" value={invoice.fx_rate == null ? '—' : String(invoice.fx_rate)} />
              )}
              <Stat label="Purchase orders" value={allocationCountLabel(invoice)} />
              <Stat
                label="Keyed"
                value={`${shortDate(invoice.created_at)}${invoice.created_by_name ? ` by ${invoice.created_by_name}` : ''}`}
              />
            </div>
            {money && (
              <span style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                The variance is against the full total, freight and duty included — nothing here
                decides which part of a bill is goods. Whether it is “matched” is a judgement,
                not arithmetic: say so in the status below.
              </span>
            )}
            <ErrorLine>{error}</ErrorLine>
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="On this bill" />
          <HeaderRow
            columns={allocColumns}
            labels={
              money
                ? ['Number', 'House', 'Status', 'Amount', 'PO cost', 'Attached', '']
                : ['Number', 'House', 'Status', 'Attached', '']
            }
          />
          {allocations.length === 0 && (
            <PanelNote>
              Nothing attached yet — find the purchase orders this bill covers below.
            </PanelNote>
          )}
          {allocations.map((allocation) => (
            <Row key={allocation.id} columns={allocColumns}>
              <span style={{ minWidth: 0 }}>
                <Link
                  to={purchaseOrderRoute(allocation.purchase_order_id)}
                  className="ab-link"
                  style={{ ...monoText, fontSize: 12.5, color: c.accent, textDecoration: 'none' }}
                >
                  {allocation.po_number}
                </Link>
                <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                  raised {shortDate(allocation.purchase_order_created_at)}
                </span>
              </span>
              {/* WHICH house each line of the bill is for — one bill covering
                  two houses of one supplier is the ordinary case, and it is the
                  one thing the office cannot work out from the paper. */}
              <span style={{ fontSize: 13, color: c.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {allocation.brand_name}
              </span>
              <span>
                <StatusPill tone={PO_STATUS_TONE[allocation.purchase_order_status] ?? 'muted'}>
                  {PO_STATUS_LABELS[allocation.purchase_order_status] ?? allocation.purchase_order_status}
                </StatusPill>
              </span>
              {money && (
                <span style={{ ...monoText, fontSize: 11.5 }}>
                  {allocationAmountText(allocation, invoice.currency)}
                </span>
              )}
              {money && (
                <span style={{ ...monoText, fontSize: 11.5 }}>
                  {poCostText(allocation, invoice.currency)}
                </span>
              )}
              <span style={{ ...mutedText, fontSize: 11.5 }}>
                {shortDate(allocation.created_at)}
                {allocation.allocated_by_name ? ` by ${allocation.allocated_by_name}` : ''}
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <GhostButton tone="danger" disabled={busy} onClick={() => setDetachFor(allocation)}>
                  Detach
                </GhostButton>
              </span>
            </Row>
          ))}
        </section>

        <section style={panel}>
          <PanelHead label="Find what this bill covers" />
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <span style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
              A search over this house’s unbilled purchase orders, not a join: the paper may not
              quote Atelier’s numbers at all, so match by the dates and amounts it does state.
              Cancelled purchase orders are left out; a purchase order already on a bill names
              that bill if it is picked again.
            </span>
            <form onSubmit={searchUnbilled} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="PO number">
                <input
                  value={unbilledDraft.q}
                  onChange={setUnbilledField('q')}
                  placeholder="Our PO number"
                  style={{ ...inputStyle, ...filterInput, width: 170 }}
                />
              </Field>
              <Field label="Raised from">
                <input
                  type="date"
                  value={unbilledDraft.from}
                  onChange={setUnbilledField('from')}
                  style={{ ...inputStyle, ...filterInput, width: 145 }}
                />
              </Field>
              <Field label="Raised to">
                <input
                  type="date"
                  value={unbilledDraft.to}
                  onChange={setUnbilledField('to')}
                  style={{ ...inputStyle, ...filterInput, width: 145 }}
                />
              </Field>
              {/* Two plain bounds, not a tolerance — and finance end to end:
                  the API refuses an amount search from a login without the
                  grant with a sentence, so the boxes are only offered where
                  this payload already showed money. */}
              {money && (
                <Field label="Cost from">
                  <input
                    value={unbilledDraft.amount_min}
                    onChange={setUnbilledField('amount_min')}
                    inputMode="decimal"
                    placeholder="Amount from"
                    style={{ ...inputStyle, ...filterInput, width: 120, fontFamily: font.mono }}
                  />
                </Field>
              )}
              {money && (
                <Field label="Cost to">
                  <input
                    value={unbilledDraft.amount_max}
                    onChange={setUnbilledField('amount_max')}
                    inputMode="decimal"
                    placeholder="Amount to"
                    style={{ ...inputStyle, ...filterInput, width: 120, fontFamily: font.mono }}
                  />
                </Field>
              )}
              <GhostButton type="submit" disabled={busy || searching}>
                Search unbilled
              </GhostButton>
            </form>

            {searching && <PanelNote>Searching this house’s unbilled purchase orders…</PanelNote>}
            {hits !== null && !searching && hits.length === 0 && (
              <PanelNote>
                Nothing unbilled from {invoice.supplier_name} matches — widen the dates or
                amounts, or the purchase order may already be on another bill.
              </PanelNote>
            )}

            {hits !== null && hits.length > 0 && (
              <div style={panel}>
                <HeaderRow
                  columns={hitColumns}
                  labels={
                    money
                      ? ['Number', 'House', 'Status', 'Costed at', 'Allocate', '']
                      : ['Number', 'House', 'Status', '']
                  }
                />
                {hits.map((hit) => (
                  <Row key={hit.id} columns={hitColumns}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ ...monoText, fontSize: 12.5, display: 'block' }}>{hit.po_number}</span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                        raised {shortDate(hit.created_at)}
                      </span>
                    </span>
                    <span style={{ fontSize: 13, color: c.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hit.brand_name}
                    </span>
                    <span>
                      <StatusPill tone={PO_STATUS_TONE[hit.status] ?? 'muted'}>
                        {PO_STATUS_LABELS[hit.status] ?? hit.status}
                      </StatusPill>
                    </span>
                    {money && (
                      <span style={{ ...monoText, fontSize: 11.5 }}>
                        {poCostText(hit, hit.currency)}
                      </span>
                    )}
                    {money && (
                      <input
                        value={amounts[hit.id] ?? ''}
                        disabled={busy}
                        inputMode="decimal"
                        placeholder="Not stated"
                        onChange={(event) =>
                          setAmounts((current) => ({ ...current, [hit.id]: event.target.value }))
                        }
                        aria-label={`Amount of this bill for ${hit.po_number}`}
                        style={monoCellInput}
                      />
                    )}
                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <GhostButton tone="accent" disabled={busy} onClick={() => attach(hit)}>
                        Attach
                      </GhostButton>
                    </span>
                  </Row>
                ))}
              </div>
            )}

            {money && hits !== null && hits.length > 0 && (
              <span style={{ ...mutedText, fontSize: 11.5 }}>
                A blank amount attaches as “not stated” — the ordinary state when the paper does
                not break its total down — and can be corrected later by detaching and
                re-attaching.
              </span>
            )}
          </div>
        </section>

        <section style={panel}>
          <PanelHead
            label="The paper"
            right={
              <GhostButton tone="accent" disabled={busy} onClick={save}>
                Save changes
              </GhostButton>
            }
          />
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <span style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
              Corrections to what was keyed off the bill. The house itself cannot be corrected —
              moving a bill would strand every attached purchase order under the old supplier
              agreement — so one keyed against the wrong house is deleted and re-entered.
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <Field label="Invoice number" hint="Unique to the house that issued it, however it is cased or spaced.">
                <input
                  value={headerDraft.invoice_number ?? ''}
                  disabled={busy}
                  onChange={setHeaderField('invoice_number')}
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
              <Field label="Invoice date">
                <input
                  type="date"
                  value={headerDraft.invoice_date ?? ''}
                  disabled={busy}
                  onChange={setHeaderField('invoice_date')}
                  aria-label="Invoice date"
                  style={inputStyle}
                />
              </Field>
              <Field label="Currency" hint="The bill's own currency.">
                <input
                  value={headerDraft.currency ?? ''}
                  disabled={busy}
                  onChange={setHeaderField('currency')}
                  placeholder="EUR"
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
              <Field
                label="Status"
                hint="Matched is a judgement about the variance, not arithmetic — and a matched bill goes straight back to disputed the moment something is spotted."
              >
                <Select
                  value={headerDraft.status ?? ''}
                  disabled={busy}
                  onChange={setHeaderField('status')}
                  aria-label="Status"
                >
                  {SUPPLIER_INVOICE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              {money && (
                <Field label="Total" hint="The full figure, freight and duty included.">
                  <input
                    value={headerDraft.total_amount ?? ''}
                    disabled={busy}
                    inputMode="decimal"
                    onChange={setHeaderField('total_amount')}
                    aria-label="Invoice total"
                    style={{ ...inputStyle, fontFamily: font.mono }}
                  />
                </Field>
              )}
              {money && (
                <Field label="Freight" hint="Recorded, never apportioned.">
                  <input
                    value={headerDraft.freight_amount ?? ''}
                    disabled={busy}
                    inputMode="decimal"
                    onChange={setHeaderField('freight_amount')}
                    aria-label="Freight amount"
                    style={{ ...inputStyle, fontFamily: font.mono }}
                  />
                </Field>
              )}
              {money && (
                <Field label="Duty" hint="Recorded, never apportioned.">
                  <input
                    value={headerDraft.duty_amount ?? ''}
                    disabled={busy}
                    inputMode="decimal"
                    onChange={setHeaderField('duty_amount')}
                    aria-label="Duty amount"
                    style={{ ...inputStyle, fontFamily: font.mono }}
                  />
                </Field>
              )}
              {money && (
                <Field label="FX rate" hint="Recorded raw — nothing multiplies by it.">
                  <input
                    value={headerDraft.fx_rate ?? ''}
                    disabled={busy}
                    inputMode="decimal"
                    onChange={setHeaderField('fx_rate')}
                    aria-label="FX rate"
                    style={{ ...inputStyle, fontFamily: font.mono }}
                  />
                </Field>
              )}
              <Field label="Notes">
                <input
                  value={headerDraft.notes ?? ''}
                  disabled={busy}
                  onChange={setHeaderField('notes')}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={detachFor !== null}
        title={dialog.title}
        body={dialog.body}
        confirmLabel={dialog.confirmLabel}
        onConfirm={confirmDetach}
        onCancel={() => setDetachFor(null)}
        busy={busy}
        error={detachFor ? error : ''}
      />
      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: at the bottom of the screen file) ---------

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
