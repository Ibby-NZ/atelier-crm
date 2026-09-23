// Supplier invoices — LIVE, on atelier-api's /admin/supplier-invoices (W14).
// The reconciliation desk: one supplier sends ONE consolidated bill covering
// MANY purchase orders every few weeks, and this list shows how far through
// each bill the office is.
//
//   GET    /admin/supplier-invoices?supplier_id=&status=&from=&to=&q=&page=&limit=
//                                              → { supplier_invoices, meta }
//   DELETE /admin/supplier-invoices/:id        → 200, or 409 { message, blockers }
//
// **Every money column is finance-gated server-side, and a masked figure is
// DELETED from the payload rather than nulled** — so the columns are drawn
// from `listShowsMoney` and a login without the grant sees the bills without
// blanked cells implying figures it is not being shown, plus one sentence
// saying the table is short of columns (the report library's mask-note rule).
//
// **There is no "Show archived" toggle, deliberately**: `supplier_invoice` is
// `archivable: false` — `matched` and `disputed` already take a bill off the
// working list AND say why, which an archive flag cannot. Delete is offered
// only on a bill with nothing attached; the API's 409 stays the gate.
//
// Every rule is in ./adminSupplierInvoices.js; this file is layout.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, suppliersTabs } from '../components/sectionTabs.jsx'
import { apiFetch } from '../lib/api.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  Select,
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  EMPTY_INVOICE_SEARCH,
  MASKED_MONEY_NOTE,
  NEW_SUPPLIER_INVOICE_ROUTE,
  STATUS_LABELS,
  STATUS_TONE,
  SUPPLIER_INVOICES_PATH,
  SUPPLIER_INVOICE_LIST_LIMIT,
  SUPPLIER_INVOICE_STATUSES,
  allocationCountLabel,
  canDeleteInvoice,
  describeSupplierInvoice,
  hasInvoiceFilters,
  invoiceDateText,
  invoiceFilters,
  listShowsMoney,
  moneyText,
  supplierInvoiceRoute,
  unallocatedLabel,
  unallocatedTone,
  varianceLabel,
  varianceTone,
} from './adminSupplierInvoices.js'

const COLUMNS = 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1.2fr) 110px'
const COLUMNS_NO_MONEY = 'minmax(0, 1.4fr) minmax(0, 1fr) 110px'
const filterInput = { ...cellInput, fontSize: 12.5 }
const toneColor = { sage: c.sage, clay: c.clay, muted: c.muted }

export default function AdminSupplierInvoices() {
  const [searchDraft, setSearchDraft] = useState(EMPTY_INVOICE_SEARCH)
  const [search, setSearch] = useState(EMPTY_INVOICE_SEARCH)
  const [suppliers, setSuppliers] = useState([])

  const crud = useCrudScreen({
    path: SUPPLIER_INVOICES_PATH,
    key: 'supplier_invoices',
    limit: SUPPLIER_INVOICE_LIST_LIMIT,
    filters: invoiceFilters(search),
    entity: 'supplier invoice',
    describe: describeSupplierInvoice,
    // No `archive` action: no archived_at column exists, so a refusal correctly
    // offers Cancel alone — the way out of a blocked delete is to DETACH, which
    // is a decision about those purchase orders, not a step in tidying up.
  })
  const rows = crud.list.rows
  const { busy, error, setError } = crud.mutation

  // The supplier filter's options. Read once — the endpoint pages at MAX_LIMIT
  // 200, and Atelier's supplier roster is well inside one page of that.
  useEffect(() => {
    let active = true
    apiFetch('/admin/suppliers?limit=200')
      .then((body) => {
        if (active) setSuppliers(body.suppliers ?? [])
      })
      .catch(() => {
        // A filter that could not load is not a broken screen: the list still
        // works unfiltered, and every real refusal surfaces on the list itself.
        if (active) setSuppliers([])
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
    setSearchDraft(EMPTY_INVOICE_SEARCH)
    setSearch(EMPTY_INVOICE_SEARCH)
  }

  const setSearchField = (key) => (event) =>
    setSearchDraft((draft) => ({ ...draft, [key]: event.target.value }))

  // Whether THIS login's payload carries money at all — a masked figure is
  // deleted server-side, so the columns follow the rows rather than the role.
  const money = listShowsMoney(rows)
  const columns = money ? COLUMNS : COLUMNS_NO_MONEY

  return (
    <div>
      <PageHeader
        eyebrow="Suppliers · live"
        title={<>Supplier invoices</>}
        subtitle="The consolidated bills the houses send — one invoice covering many purchase orders, often across two of a supplier's houses. Key the paper, then tick off which purchase orders it covers."
        right={
          <Link to={NEW_SUPPLIER_INVOICE_ROUTE} style={{ textDecoration: 'none' }}>
            <GhostButton tone="accent">Key a new invoice</GhostButton>
          </Link>
        }
      />
      <SectionTabs tabs={suppliersTabs} active="invoices" />

      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <section style={{ ...panel, minWidth: 0 }}>
          <PanelHead
            label="Supplier invoices"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.inkSoft, textAlign: 'right' }}>
                {crud.list.total.toLocaleString('en-NZ')} matching
              </span>
            }
          />

          <form
            onSubmit={runSearch}
            style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 20px', background: c.surface, borderBottom: `1px solid ${c.line}` }}
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', flex: '1 1 520px' }}>
              <Field label="Invoice number" style={{ flex: '1 1 170px' }}>
                <input
                  value={searchDraft.q}
                  onChange={setSearchField('q')}
                  placeholder="Invoice number"
                  style={filterInput}
                  aria-label="Search by invoice number"
                />
              </Field>
              <Field label="Supplier" style={{ flex: '1 1 200px' }}>
                <Select
                  value={searchDraft.supplier_id}
                  onChange={setSearchField('supplier_id')}
                  style={filterInput}
                  aria-label="Filter by supplier"
                >
                  <option value="">All suppliers</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={searchDraft.status}
                  onChange={setSearchField('status')}
                  style={{ ...filterInput, width: 'auto' }}
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  {SUPPLIER_INVOICE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* `to` is INCLUSIVE — invoice_date is a calendar day, so a range
                  ending on the 31st contains a bill dated the 31st. */}
              <Field label="Dated on or after">
                <input
                  type="date"
                  value={searchDraft.from}
                  onChange={setSearchField('from')}
                  style={{ ...filterInput, width: 145 }}
                  aria-label="Dated on or after"
                />
              </Field>
              <Field label="Dated on or before">
                <input
                  type="date"
                  value={searchDraft.to}
                  onChange={setSearchField('to')}
                  style={{ ...filterInput, width: 145 }}
                  aria-label="Dated on or before"
                />
              </Field>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34 }}>
                <GhostButton type="submit" disabled={busy}>
                  Search
                </GhostButton>
                {hasInvoiceFilters(search) && (
                  <GhostButton disabled={busy} onClick={clearSearch}>
                    Clear
                  </GhostButton>
                )}
              </div>
            </div>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {crud.list.status === 'loading' && <PanelNote>Loading supplier invoices…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && rows.length === 0 && (
            <PanelNote>
              {hasInvoiceFilters(search)
                ? 'No supplier invoice matches those filters.'
                : 'No supplier invoices yet — key the first bill as it arrives from a house.'}
            </PanelNote>
          )}

          {crud.list.status === 'ready' && rows.length > 0 && (
            <>
              {/* Announced, not implied: a masked table that says nothing looks
                  complete, which is worse than a locked one. */}
              {!money && (
                <div style={{ padding: '12px 20px', ...mutedText, borderBottom: `1px solid ${c.line}` }}>
                  {MASKED_MONEY_NOTE}
                </div>
              )}
              <HeaderRow
                columns={columns}
                numeric={money ? [2, 3, 4] : []}
                labels={[
                  <span key="identity" style={{ display: 'grid', gap: 4 }}>
                    <span>Number</span>
                    <span>Supplier</span>
                  </span>,
                  <span key="status" style={{ display: 'grid', gap: 4 }}>
                    <span>Status</span>
                    <span>Purchase orders</span>
                  </span>,
                  ...(money ? ['Total', 'Unallocated', 'Variance'] : []),
                  '',
                ]}
              />
              {rows.map((row) => (
                <Row key={row.id} columns={columns} style={{ paddingTop: 12, paddingBottom: 12, alignItems: 'start', lineHeight: 1.5 }}>
                  <span style={{ minWidth: 0 }}>
                    <Link
                      to={supplierInvoiceRoute(row.id)}
                      className="ab-link"
                      style={{ ...monoText, fontSize: 13, fontWeight: 600, color: c.ink, textDecoration: 'none', overflowWrap: 'anywhere' }}
                    >
                      {row.invoice_number}
                    </Link>
                    {/* The snapshot, as the paper said on the day — never
                        re-read from the supplier record. */}
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: c.ink, marginTop: 4, overflowWrap: 'anywhere' }}>
                      {row.supplier_name}
                    </span>
                    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...mutedText, fontSize: 11, marginTop: 4 }}>
                      <span>{invoiceDateText(row.invoice_date)}</span>
                      {row.currency && (
                        <span style={{ fontFamily: font.mono }}>{row.currency}</span>
                      )}
                    </span>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <StatusPill tone={STATUS_TONE[row.status] ?? 'muted'} style={{ padding: '3px 6px', gap: 4, fontSize: 11 }}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </StatusPill>
                    <span style={{ display: 'block', fontSize: 12, color: c.inkSoft, marginTop: 8 }}>{allocationCountLabel(row)}</span>
                  </span>
                  {money && (
                    <span style={{ ...monoText, fontSize: 12.5, fontWeight: 600, color: c.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
                      {moneyText(row.total_amount, row.currency)}
                    </span>
                  )}
                  {money && (
                    <span style={{ ...monoText, fontSize: 11.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: toneColor[unallocatedTone(row)] }}>
                      {unallocatedLabel(row)}
                    </span>
                  )}
                  {money && (
                    <span style={{ ...monoText, fontSize: 11.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: toneColor[varianceTone(row)] }}>
                      {varianceLabel(row)}
                    </span>
                  )}
                  <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link to={supplierInvoiceRoute(row.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    {/* Only on a bill with nothing attached: the delete is
                        refused while purchase orders are on it, and the way out
                        is a detach — a decision, not a tidy-up. The API's 409
                        stays the gate if the row moves. */}
                    {canDeleteInvoice(row) && (
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
          unit="supplier invoices"
          onPage={crud.list.setPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={crud.toast.message} />
    </div>
  )
}
