// New supplier invoice — the live create form, wired to atelier-api's
// POST /admin/supplier-invoices (W14). A bill has arrived from a house; this
// keys it in so the purchase orders it covers can be ticked off against it.
//
//   GET  /admin/suppliers?limit=200      → { suppliers }  the house picker
//   POST /admin/supplier-invoices        → { supplier_invoice }  (201)
//
// **The house IS chosen here, unlike on a purchase order — the API's own
// design, not a drift.** A purchase order's supplier is derived from the brand
// it was raised for; an invoice ARRIVES from a house and the house is the
// primary fact on the paper, with nothing to derive it from. What replaces the
// derivation is the supplier agreement: every purchase order attached to this
// bill later must belong to the same house, and the attach 422s naming any
// that does not. Keyed against the wrong house, an invoice is deleted and
// re-entered — there is deliberately no way to move it.
//
// The invoice number is typed off paper, so the duplicate 409 is answered from
// the ROW ON FILE — `  inv-2291 ` and `INV-2291` are the same bill keyed
// twice, and the API says so naming the original and its date. Its sentence is
// surfaced verbatim.
//
// Money here is the house's own currency at numeric(12,4) — NOT cents; a bill
// is foreign, fractional and unconverted. Freight and duty are RECORDED AND
// NEVER APPORTIONED (ADR 006), and the FX rate is recorded raw and multiplied
// by nothing — the basis is still owed by the client.
//
// Layout only: every rule is in ./adminSupplierInvoices.js.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import {
  Select,
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  inputStyle,
  messageOf,
  mutedText,
  panel,
  ToastLine,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  NEW_SUPPLIER_INVOICE,
  SUPPLIER_INVOICES_PATH,
  buildInvoiceBody,
  supplierInvoiceRoute,
} from './adminSupplierInvoices.js'

export default function AdminSupplierInvoiceNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this screen, so no useCrudScreen: a lone useMutation is the
  // kit's shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })

  const [draft, setDraft] = useState(NEW_SUPPLIER_INVOICE)
  const [suppliers, setSuppliers] = useState([])

  useEffect(() => {
    let active = true
    apiFetch('/admin/suppliers?limit=200')
      .then((body) => {
        if (active) setSuppliers(body.suppliers ?? [])
      })
      .catch((err) => {
        if (active) setError(messageOf(err, 'Could not load the suppliers.'))
      })
    return () => {
      active = false
    }
  }, [setError])

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const setField = (key) => (event) => set({ [key]: event.target.value })

  const chosen = suppliers.find((supplier) => String(supplier.id) === String(draft.supplier_id))

  const submit = async () => {
    const built = buildInvoiceBody(draft)
    if (!built.ok) return setError(built.error)
    let created = null
    const ok = await run(() => {
      return apiSend('POST', SUPPLIER_INVOICES_PATH, built.body).then((body) => {
        created = body.supplier_invoice
        return body
      })
    }, (result) => `${result.supplier_invoice.invoice_number} keyed in.`)
    // The bill is reconciled from its own screen from here on; landing back on
    // an empty form would read as "it did not save".
    if (ok && created) navigate(supplierInvoiceRoute(created.id))
    return undefined
  }

  return (
    <div>
      <PageHeader
        eyebrow="Orders · live"
        title={<>New supplier invoice</>}
        subtitle="A consolidated bill has arrived from a house. Key it as the paper states it; which purchase orders it covers is ticked off afterwards, on the bill itself."
        right={
          <GhostButton onClick={() => navigate('/admin/supplier-invoices')}>
            Back to supplier invoices
          </GhostButton>
        }
      />
      <SectionTabs tabs={ordersTabs} active="invoices" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead label="The paper" />
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Field
                label="House"
                hint="Who sent the bill. Every purchase order attached to it must belong to this house — keyed against the wrong one, the bill is deleted and re-entered, never moved."
              >
                <Select
                  value={draft.supplier_id}
                  disabled={busy}
                  onChange={setField('supplier_id')}
                  aria-label="Supplier"
                >
                  <option value="">Choose a house…</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Invoice number"
                hint="Exactly as the paper states it. A number already on file for this house is refused naming the original — case and spacing do not make it a different bill."
              >
                <input
                  value={draft.invoice_number}
                  disabled={busy}
                  onChange={setField('invoice_number')}
                  aria-label="Invoice number"
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
              <Field label="Invoice date" hint="The date printed on the bill — a calendar day, as the paper says.">
                <input
                  type="date"
                  value={draft.invoice_date}
                  disabled={busy}
                  onChange={setField('invoice_date')}
                  aria-label="Invoice date"
                  style={inputStyle}
                />
              </Field>
              <Field
                label="Currency"
                hint={
                  chosen?.currency
                    ? `Blank uses the house's own invoicing currency (${chosen.currency}).`
                    : 'Blank uses the house’s own invoicing currency.'
                }
              >
                <input
                  value={draft.currency}
                  disabled={busy}
                  onChange={setField('currency')}
                  placeholder={chosen?.currency || 'EUR'}
                  aria-label="Currency"
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
            </div>
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="The figures" />
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <Field label="Total" hint="The full figure on the bill, freight and duty included.">
                <input
                  value={draft.total_amount}
                  disabled={busy}
                  inputMode="decimal"
                  onChange={setField('total_amount')}
                  aria-label="Invoice total"
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
              <Field label="Freight" hint="Recorded, never apportioned down onto a line. Optional.">
                <input
                  value={draft.freight_amount}
                  disabled={busy}
                  inputMode="decimal"
                  onChange={setField('freight_amount')}
                  aria-label="Freight amount"
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
              <Field label="Duty" hint="As freight: recorded beside the variance, applied to nothing. Optional.">
                <input
                  value={draft.duty_amount}
                  disabled={busy}
                  inputMode="decimal"
                  onChange={setField('duty_amount')}
                  aria-label="Duty amount"
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
              <Field label="FX rate" hint="Recorded raw — nothing multiplies by it. Optional.">
                <input
                  value={draft.fx_rate}
                  disabled={busy}
                  inputMode="decimal"
                  onChange={setField('fx_rate')}
                  aria-label="FX rate"
                  style={{ ...inputStyle, fontFamily: font.mono }}
                />
              </Field>
            </div>
            <Field label="Notes" hint="Anything that has to travel with the bill.">
              <input
                value={draft.notes}
                disabled={busy}
                onChange={setField('notes')}
                aria-label="Notes"
                style={inputStyle}
              />
            </Field>
            <span style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
              A blank figure is left unstated rather than sent as zero — “not stated” and “stated
              as nil” are different facts on a bill. Negative amounts are refused: a credit
              against a bill is a different document.
            </span>
          </div>
        </section>

        <div>
          <ErrorLine style={{ marginBottom: 12 }}>{error}</ErrorLine>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <GhostButton tone="accent" disabled={busy} onClick={submit}>
              Key the invoice
            </GhostButton>
            <span style={{ ...mutedText, fontSize: 11.5, fontFamily: font.ui }}>
              It files as received. Matching the purchase orders it covers is the next step, on
              the bill itself.
            </span>
          </div>
        </div>
      </div>

      <ToastLine message={toast} />
    </div>
  )
}
