// One supplier's bills and the purchase orders still waiting for one, on that
// supplier's own page (AdminSupplier) — the read surface for:
//
//   GET  /admin/supplier-invoices?supplier_id=&limit=     → { supplier_invoices, meta }
//   GET  /admin/supplier-invoices/unbilled?supplier_id=   → { purchase_orders, meta }
//   POST /admin/supplier-invoices/statement               → { statement }
//
// **A per-supplier nesting is a FILTER, not a second resource.** Both reads are
// the invoice screens' own endpoints scoped to one house; nothing here asks the
// API for anything it did not already answer, and there is deliberately no
// `/admin/suppliers/:id/invoices` beside `?supplier_id=`.
//
// **The tick list does two things, and neither of them writes a bill.** Keying
// one hands the create form the house and the selection, and the bill is keyed
// there off the paper — an invoice number, a date and a total are facts only the
// house can state, so nothing here invents them. Asking for one sends the house
// a statement naming those orders, which is the letter the office wrote by hand
// until now.
//
// **The statement is confirmed first and refused whole.** It leaves the
// building the moment it is sent, and the API refuses the lot — naming the
// bill that already covers one of them — rather than sending a letter with an
// order quietly dropped from it. Its sentence is surfaced verbatim.
//
// Pending means the API's own definition of unbilled: no invoice claims it and
// it is not cancelled. A draft counts — a house that has not been sent the
// order yet still has nothing to bill for, and the buying desk is where that is
// chased, not here.
//
// Money is finance-gated server-side and a masked figure is DELETED from the
// payload, so the columns are drawn from `listShowsMoney` and a login without
// the grant works the bills and their purchase orders without blanked figures.
//
// Layout only: every rule is in ./adminSupplierInvoices.js.

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { StatusPill } from '../components/ui.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useConfirmation } from '../admin/useConfirmation.js'
import {
  ErrorLine,
  GhostButton,
  PanelNote,
  messageOf,
  monoText,
  mutedText,
  sectionLabel,
  useMutation,
} from '../admin/parts.jsx'
import {
  MASKED_MONEY_NOTE,
  NEW_SUPPLIER_INVOICE_ROUTE,
  STATUS_LABELS,
  STATUS_TONE,
  allocationCountLabel,
  buildStatementBody,
  combineLabel,
  combineState,
  invoiceDateText,
  listShowsMoney,
  moneyText,
  pendingForSupplier,
  poCostText,
  supplierInvoiceRoute,
  statementDialog,
  statementPath,
  statementSentText,
  supplierInvoicesFor,
  toggleCombined,
  unallocatedLabel,
} from './adminSupplierInvoices.js'
import { STATUS_LABELS as PO_STATUS_LABELS, purchaseOrderRoute } from './adminPurchaseOrders.js'

const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

const rowStyle = {
  display: 'grid',
  gap: 12,
  alignItems: 'center',
  padding: '10px 14px',
  background: c.paper,
  borderBottom: `1px solid ${c.line}`,
}

const tableStyle = {
  marginTop: 10,
  border: `1px solid ${c.line}`,
  borderRadius: 4,
  overflow: 'hidden',
}

const linkStyle = {
  ...monoText,
  fontSize: 12.5,
  fontWeight: 600,
  color: c.ink,
  textDecoration: 'none',
  overflowWrap: 'anywhere',
}

export default function SupplierInvoicesPanel({ supplierId, supplierName, flash, onLogged }) {
  const navigate = useNavigate()
  const confirmation = useConfirmation()
  const [invoices, setInvoices] = useState([])
  const [pending, setPending] = useState([])
  const [selected, setSelected] = useState([])
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')

  const reload = useCallback(async () => {
    const [bills, waiting] = await Promise.all([
      apiFetch(supplierInvoicesFor(supplierId)),
      apiFetch(pendingForSupplier(supplierId)),
    ])
    setInvoices(bills.supplier_invoices ?? [])
    setPending(waiting.purchase_orders ?? [])
  }, [supplierId])

  const { busy, error, setError, run } = useMutation({ reload, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    setSelected([])
    reload()
      .then(() => active && setStatus('ready'))
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this house’s bills.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [reload])

  // The letter the office used to type by hand. Confirmed first — it leaves the
  // building on the click — and the API refuses the lot rather than sending one
  // with an order it has already been billed for quietly dropped, so the
  // selection is posted exactly as it was ticked.
  const askForOneBill = async () => {
    const built = buildStatementBody(supplierId, selected)
    if (!built.ok) return setError(built.error)
    if (!(await confirmation.ask(statementDialog(supplierName, selected)))) return undefined
    const ok = await run(
      () => apiSend('POST', statementPath, built.body),
      (result) => statementSentText(result.statement)
    )
    if (ok) {
      // The statement is a contact with the house, so the parent's
      // Last-contact column is now stale.
      setSelected([])
      onLogged?.()
    }
    return undefined
  }

  if (status === 'loading') return <PanelNote>Loading this house’s bills…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{loadError}</PanelNote>

  // Two independent gates: a house may have no bill on file yet and still have
  // purchase orders waiting, and the grant is per payload either way.
  const invoiceMoney = listShowsMoney(invoices)
  const pendingMoney = pending.some((row) => Object.hasOwn(row, 'ordered_cost'))
  const combine = combineState(supplierId, selected)

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 22 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={sectionLabel}>Supplier invoices</div>
          <GhostButton
            onClick={() =>
              navigate(NEW_SUPPLIER_INVOICE_ROUTE, { state: { supplier_id: String(supplierId) } })
            }
          >
            Key a bill
          </GhostButton>
        </div>

        {!invoiceMoney && invoices.length > 0 && (
          <div style={{ ...mutedText, marginTop: 10 }}>{MASKED_MONEY_NOTE}</div>
        )}

        {invoices.length === 0 ? (
          <div style={{ ...mutedText, marginTop: 10 }}>
            No bill from {supplierName} on file yet.
          </div>
        ) : (
          <div style={tableStyle}>
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                style={{
                  ...rowStyle,
                  gridTemplateColumns: invoiceMoney ? '1.1fr 0.9fr 1fr 1fr' : '1.2fr 1fr 1fr',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <Link to={supplierInvoiceRoute(invoice.id)} className="ab-link" style={linkStyle}>
                    {invoice.invoice_number}
                  </Link>
                  <span style={{ display: 'block', ...mutedText, fontSize: 11, marginTop: 4 }}>
                    {invoiceDateText(invoice.invoice_date)}
                    {invoice.currency && (
                      <span style={{ fontFamily: font.mono }}> · {invoice.currency}</span>
                    )}
                  </span>
                </span>
                <StatusPill
                  tone={STATUS_TONE[invoice.status] ?? 'muted'}
                  style={{ padding: '3px 6px', gap: 4, fontSize: 11, justifySelf: 'start' }}
                >
                  {STATUS_LABELS[invoice.status] ?? invoice.status}
                </StatusPill>
                <span style={{ fontSize: 12, color: c.inkSoft, minWidth: 0 }}>
                  {allocationCountLabel(invoice)}
                  {invoiceMoney && (
                    <span style={{ display: 'block', ...mutedText, fontSize: 11, marginTop: 4 }}>
                      {unallocatedLabel(invoice)}
                    </span>
                  )}
                </span>
                {invoiceMoney && (
                  <span style={{ ...monoText, textAlign: 'right' }}>
                    {moneyText(invoice.total_amount, invoice.currency)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={sectionLabel}>Pending purchase orders</div>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* The bill has not arrived: ask the house for one covering these. */}
            <GhostButton disabled={busy || !combine} onClick={askForOneBill}>
              Ask for one invoice
            </GhostButton>
            {/* The bill is on the desk: key it, and attach these to it. */}
            <GhostButton
              tone="accent"
              disabled={busy || !combine}
              onClick={() => navigate(NEW_SUPPLIER_INVOICE_ROUTE, { state: combine })}
            >
              {combineLabel(selected)}
            </GhostButton>
          </span>
        </div>

        <div style={{ ...mutedText, marginTop: 8 }}>
          Raised for this house and on no bill yet. One house sells several
          maisons, so a consolidated bill normally covers more than one of these
          — tick the ones the paper covers and key them as a single invoice, or
          ask the house to bill them together.
        </div>

        <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>

        {pending.length === 0 ? (
          <div style={{ ...mutedText, marginTop: 10 }}>
            Nothing outstanding — every purchase order raised for {supplierName} is on a bill.
          </div>
        ) : (
          <div style={tableStyle}>
            {pending.map((po) => (
              <div
                key={po.id}
                style={{
                  ...rowStyle,
                  gridTemplateColumns: pendingMoney
                    ? 'auto 1.1fr 1fr 0.7fr 1fr'
                    : 'auto 1.2fr 1fr 0.8fr',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(po.id)}
                  onChange={() => setSelected((current) => toggleCombined(current, po.id))}
                  aria-label={`Include ${po.po_number}`}
                />
                <span style={{ minWidth: 0 }}>
                  <Link to={purchaseOrderRoute(po.id)} className="ab-link" style={linkStyle}>
                    {po.po_number}
                  </Link>
                  <span style={{ display: 'block', ...mutedText, fontSize: 11, marginTop: 4 }}>
                    Raised {shortDate(po.created_at)}
                  </span>
                </span>
                <span style={{ fontSize: 12.5, color: c.ink, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {po.brand_name}
                </span>
                <span style={mutedText}>{PO_STATUS_LABELS[po.status] ?? po.status}</span>
                {pendingMoney && (
                  <span style={{ ...monoText, textAlign: 'right' }}>
                    {poCostText(po, po.currency)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog {...confirmation.dialog} />
    </div>
  )
}
