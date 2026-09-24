// One supplier on its own page — the WooCommerce shape the client asked for,
// the same move the sales order made (16 Sep 2026): the list is the list, the
// detail is the desk. This block used to open INSIDE the row on /admin/suppliers
// and the three panels below it pushed the rest of the table off the screen.
//
//   GET   /admin/suppliers/:id   → { supplier } + aliases, houses, terms
//   PATCH /admin/suppliers/:id   → { supplier }
//
// The single detail read feeds BOTH halves of this screen — the edit form and
// the houses/aliases summary — so linking a house from the terms panel below
// just re-reads it (`load`), where the in-row version had to remount a child on
// a bumped key to refresh the same list.
//
// Archive, restore and delete stay on the list: they are lifecycle verbs on a
// row, and the row is where the office reaches for them. A new supplier is
// keyed on AdminSupplierNew through the same <SupplierFields> this page edits
// with, and lands here once it is saved.
//
// **No terms editing in the summary block.** The per-house summary below the
// houses list stays read-only and masked; the writable editor is
// <SupplierTermsPanel>, which reads the standalone terms list (keyed on the
// supplier, so it also shows terms whose house is not linked) and is gated on
// finance visibility server-side.
//
// Cost masking follows the rule the list states at length: a value that states
// the METHOD ("2 discount tiers") survives a login without FINANCE_VIEW, a value
// that quotes a RATE does not. All of it is drawing, not access control — the
// real gate is the API's requireRole('backoffice').

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { useCan } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'
import { MaskedFigure } from '../auth/guards.jsx'
import { diffFields, draftFrom } from '../admin/drafts.js'
import SupplierFields from './SupplierFields.jsx'
import SupplierTermsPanel from './SupplierTermsPanel.jsx'
import SupplierContactsPanel from './SupplierContactsPanel.jsx'
import SupplierInvoicesPanel from './SupplierInvoicesPanel.jsx'
import {
  ArchivedTag,
  ErrorLine,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  messageOf,
  mutedText,
  panel,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  SUPPLIERS_PATH,
  SUPPLIER_FIELDS,
  netText,
  pctText,
  supplierMeta,
  supplierPath,
  termsSummary,
  tierLabel,
} from './adminSuppliers.js'

export default function AdminSupplier() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [supplier, setSupplier] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState({})
  const finance = useCan(CAPS.FINANCE_VIEW)

  const load = useCallback(async () => {
    const body = await apiFetch(supplierPath(id))
    setSupplier(body.supplier ?? null)
    return body.supplier ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload: a
  // PATCH answers with the whole supplier, and re-reading is what makes the
  // houses and terms below true again.
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
        setLoadError(messageOf(err, 'Could not load this supplier.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Re-seed the form from server truth whenever the record reloads.
  useEffect(() => {
    if (!supplier) return
    setDraft(draftFrom(supplier, SUPPLIER_FIELDS))
  }, [supplier])

  const backLink = (
    <>
      <Link to={SUPPLIERS_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to suppliers
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Supplier not found"
        backTo={SUPPLIERS_PATH}
        backLabel="Back to suppliers"
        message="That supplier could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Supplier" />
        <PanelNote>Loading supplier…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Supplier" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!supplier) return null

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  const save = () => {
    const diff = diffFields(supplier, draft, SUPPLIER_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', supplierPath(supplier.id), diff.patch), 'Supplier saved.')
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {supplier.name}
            {supplier.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={supplierMeta(supplier)}
        right={<span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{supplier.slug}</span>}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Supplier" />
        {/* The same stack the row expansion held, in the same order — form,
            contacts, houses, terms. The terms panel draws its own box. */}
        <div style={{ padding: '20px 20px 26px' }}>
          <SupplierFields values={draft} onChange={setField} disabled={busy} />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18 }}>
            <GhostButton tone="accent" disabled={busy} onClick={save}>
              Save supplier
            </GhostButton>
          </div>
          <SupplierContactsPanel supplierId={supplier.id} flash={flash} onLogged={load} />
          <SupplierSummary supplier={supplier} finance={finance} />
          <SupplierTermsPanel
            supplierId={supplier.id}
            supplierName={supplier.name}
            flash={flash}
            onLinked={load}
          />
          {/* The house's own bills, and the purchase orders still waiting for
              one. The panel writes no bill: it hands the create form a
              selection, or asks the house for a single invoice covering it. */}
          <SupplierInvoicesPanel
            supplierId={supplier.id}
            supplierName={supplier.name}
            flash={flash}
            onLogged={load}
          />
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// Aliases, the houses this supplier invoices, and each house's commercial terms,
// all read off the detail body this page already holds. Read-only: the writable
// editor is <SupplierTermsPanel> below it, which is finance-gated server-side.
function SupplierSummary({ supplier, finance }) {
  const aliases = supplier.aliases ?? []
  const brands = supplier.brands ?? []

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 18 }}>
      <div>
        <div style={sectionLabel}>Aliases</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {aliases.length === 0 ? (
            <span style={mutedText}>
              None. Aliases are the spellings the price lists use (JV, JWALL, C&amp;C MILANO).
            </span>
          ) : (
            aliases.map((alias) => (
              <span
                key={alias.id}
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: c.inkSoft,
                  border: `1px solid ${c.line}`,
                  borderRadius: 4,
                  padding: '2px 7px',
                }}
              >
                {alias.alias}
              </span>
            ))
          )}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Houses invoiced · terms</div>
        {brands.length === 0 ? (
          <div style={{ ...mutedText, marginTop: 8 }}>
            No house points at this supplier yet — link one from the Houses screen.
          </div>
        ) : (
          <div style={{ marginTop: 8, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            {brands.map((brand) => (
              <BrandTerms key={brand.id} brand={brand} finance={finance} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// One house's row, plus a sub-row per discount tier. A value that states the
// METHOD survives a login without FINANCE_VIEW; a value quoting a RATE is
// replaced, and so is a note that carries its rate in prose.
function BrandTerms({ brand, finance }) {
  const summary = termsSummary(brand.terms)
  const tiers = brand.terms?.tiers ?? []
  const note = finance ? summary.note : (summary.maskedNote ?? summary.note)
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 1.6fr',
          gap: 12,
          alignItems: 'center',
          padding: '11px 14px',
          borderBottom: `1px solid ${c.line}`,
          background: c.paper,
        }}
      >
        <span style={{ fontSize: 13, color: c.ink, minWidth: 0 }}>
          {brand.name}
          {brand.archived_at && <ArchivedTag />}
          {/* Invoiced here as well as by its main supplier (the house page's
              "Also invoiced by"); its terms, if any, sit with the main one. */}
          {brand.is_main === false && (
            <span style={{ marginLeft: 8, fontSize: 11.5, color: c.muted }}>also invoiced here</span>
          )}
        </span>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12.5,
            textAlign: 'right',
            color: summary.invalid ? c.danger : c.ink,
          }}
        >
          {finance || summary.rateFree ? summary.value : <MaskedFigure label="Discount terms" />}
        </span>
        <span style={{ fontSize: 11.5, color: c.muted }}>
          {note}
          {finance && brand.terms?.net_multiplier != null && !summary.invalid && (
            <span style={{ fontFamily: font.mono }}> · net {netText(brand.terms.net_multiplier)}</span>
          )}
        </span>
      </div>
      {tiers.map((tier) => (
        <div
          key={tier.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1.6fr',
            gap: 12,
            alignItems: 'center',
            padding: '8px 14px 8px 30px',
            borderBottom: `1px solid ${c.line}`,
          }}
        >
          <span style={{ fontSize: 12.5, color: c.inkSoft }}>{tierLabel(tier)}</span>
          <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink, textAlign: 'right' }}>
            {finance ? `−${pctText(tier.pct)}` : <MaskedFigure label="Tier discount" />}
          </span>
          <span />
        </div>
      ))}
    </>
  )
}
