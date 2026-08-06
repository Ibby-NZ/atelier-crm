// Suppliers — the platform's own supplier master, wired to atelier-api's
// /admin/suppliers. Live: it reads AND writes real rows, unlike the demo
// Suppliers screen beside it (which is still backed by src/data/suppliers.js and
// localStorage, and is left exactly as it was).
//
//   GET    /admin/suppliers?q=&include_archived=&page=&limit=
//                                          → { suppliers, meta: { total, page, limit } }
//   GET    /admin/suppliers/:id            → { supplier } + aliases, houses, terms
//   POST   /admin/suppliers                → { supplier }  (201)
//   PATCH  /admin/suppliers/:id            → { supplier }
//   POST   /admin/suppliers/:id/archive|restore
//   DELETE /admin/suppliers/:id            → 200, or 409 { message, blockers, archivable }
//
// A supplier is who INVOICES Atelier; a brand is what a customer buys. One
// supplier sells several houses (Rubelli sells Dominique Kieffer), so the two are
// separate records and this screen is where the link is made.
//
// Four things the form deliberately does not do:
//   - **No slug field.** It is derived from the name on create and is NOT
//     recomputed on rename — it is the stable key the backfill addresses a
//     supplier by, and a rename is a correction, not a new supplier.
//   - **No currency default from the country.** Jim Thompson is Thailand and
//     invoices USD. Blank means "no invoice on file yet", which is a real answer;
//     `npm run backfill:suppliers` fills it from the rates already on file.
//   - **No terms editing.** The per-house discounts, chains and tiers are shown
//     read-only: the API has no write path for them, and the backfill is what
//     populates them from what the office already holds.
//   - **No pre-flight before a delete.** The API's 409 carries the blockers and
//     says whether archiving is available; asking first would race it.
//
// Cost masking follows the demo screen's rule: a value that states the METHOD
// ("2 discount tiers") survives a login without FINANCE_VIEW, a value that
// quotes a RATE does not. All of it is drawing, not access control — the real
// gate is the API's requireRole('backoffice'), and CAPS says so at length.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, suppliersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { useCan } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'
import { MaskedFigure } from '../auth/guards.jsx'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
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
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  DISCOUNT_METHODS,
  NEW_SUPPLIER,
  SUPPLIERS_PATH,
  SUPPLIER_FIELDS,
  archivePath,
  archiveVerb,
  netText,
  pctText,
  supplierFilters,
  supplierMeta,
  supplierPath,
  termsSummary,
  tierLabel,
} from './adminSuppliers.js'

const LIMIT = 25
const COLUMNS = '1.5fr 110px 90px 1fr 230px'

export default function AdminSuppliers() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState({})
  const [newSupplier, setNewSupplier] = useState(NEW_SUPPLIER)
  const [showNew, setShowNew] = useState(false)
  const finance = useCan(CAPS.FINANCE_VIEW)

  const { list, toast, mutation, remove } = useCrudScreen({
    path: SUPPLIERS_PATH,
    key: 'suppliers',
    limit: LIMIT,
    filters: supplierFilters({ term, showArchived }),
    entity: 'supplier',
    // Enables "Archive instead" on a blocked delete. It is the answer a blocked
    // supplier needs: brands.supplier_id is RESTRICT, so a supplier that still
    // invoices a house can never be removed, and unlinking the house first would
    // destroy the record of who invoiced it.
    archive: (row) => apiSend('POST', `${supplierPath(row.id)}/archive`, {}),
  })
  const { busy, error, setError, run } = mutation

  // Keep the open editor in step with a reloaded row; close it if the row is gone.
  useEffect(() => {
    if (openId == null) return
    const row = list.rows.find((x) => x.id === openId)
    if (!row) {
      setOpenId(null)
      return
    }
    setDraft(draftFrom(row, SUPPLIER_FIELDS))
  }, [openId, list.rows])

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const toggleRow = (row) => {
    setError('')
    setOpenId((current) => (current === row.id ? null : row.id))
  }

  const createSupplier = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newSupplier, SUPPLIER_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', SUPPLIERS_PATH, built.body),
      (res) => `${res.supplier.name} added.`
    )
    if (ok) {
      setNewSupplier(NEW_SUPPLIER)
      setShowNew(false)
    }
  }

  const saveSupplier = (row) => {
    const diff = diffFields(row, draft, SUPPLIER_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return toast.flash('No changes to save.')
    run(() => apiSend('PATCH', supplierPath(row.id), diff.patch), 'Supplier saved.')
  }

  const archiveSupplier = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archivePath(row), {}),
      `${row.name} ${verb === 'archive' ? 'archived' : 'restored'}.`
    )
  }

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const setNewField = (key) => (event) =>
    setNewSupplier((n) => ({ ...n, [key]: event.target.value }))

  return (
    <div>
      <PageHeader
        eyebrow="Suppliers · live"
        title={<>Manage suppliers</>}
        subtitle="Who invoices Atelier, and which houses each one sells. Currency is the supplier's invoicing currency, not the country's."
        right={
          <CheckField
            label="Show archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
        }
      />
      <SectionTabs tabs={suppliersTabs} active="manage" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Add a supplier"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNew((open) => !open)
                  setError('')
                }}
              >
                {showNew ? 'Cancel' : 'New supplier'}
              </GhostButton>
            }
          />
          {showNew && (
            <form onSubmit={createSupplier} style={{ padding: 20 }}>
              <SupplierFields values={newSupplier} onChange={setNewField} disabled={busy} />
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Add supplier
                </GhostButton>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Suppliers"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {list.total.toLocaleString('en-NZ')} total
              </span>
            }
          />

          <form
            onSubmit={search}
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              padding: '14px 20px',
              borderBottom: `1px solid ${c.line}`,
            }}
          >
            <input
              value={draftTerm}
              onChange={(e) => setDraftTerm(e.target.value)}
              placeholder="Name, alias, short code or country"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
              aria-label="Search suppliers"
            />
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{showNew ? '' : error}</ErrorLine>
          {list.status === 'loading' && <PanelNote>Loading suppliers…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
          {list.status === 'ready' && list.rows.length === 0 && (
            <PanelNote>
              {term ? 'No supplier matches that search.' : 'No suppliers recorded yet.'}
            </PanelNote>
          )}

          {list.status === 'ready' && list.rows.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['Supplier', 'Short code', 'D365', 'Country · currency · method', '']}
              />
              {list.rows.map((row) => (
                <div key={row.id}>
                  <Row columns={COLUMNS} archived={Boolean(row.archived_at)}>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          color: c.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {row.name}
                        {row.archived_at && <ArchivedTag />}
                      </span>
                      <span style={{ display: 'block', ...monoText, fontSize: 11 }}>{row.slug}</span>
                    </span>
                    <span style={monoText}>{row.short_code || '—'}</span>
                    <span style={monoText}>{row.d365_token || '—'}</span>
                    <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {supplierMeta(row)}
                    </span>
                    <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <GhostButton disabled={busy} onClick={() => toggleRow(row)}>
                        {openId === row.id ? 'Close' : 'Edit'}
                      </GhostButton>
                      <GhostButton
                        disabled={busy}
                        tone={row.archived_at ? 'ink' : 'danger'}
                        onClick={() => archiveSupplier(row)}
                      >
                        {row.archived_at ? 'Restore' : 'Archive'}
                      </GhostButton>
                      <GhostButton disabled={busy} tone="danger" onClick={() => remove.ask(row)}>
                        Delete
                      </GhostButton>
                    </span>
                  </Row>

                  {openId === row.id && (
                    <div
                      style={{
                        padding: '20px 20px 24px',
                        background: c.surface,
                        borderBottom: `1px solid ${c.line}`,
                      }}
                    >
                      <SupplierFields values={draft} onChange={setField} disabled={busy} />
                      <div style={{ marginTop: 18 }}>
                        <GhostButton tone="accent" disabled={busy} onClick={() => saveSupplier(row)}>
                          Save supplier
                        </GhostButton>
                      </div>
                      <SupplierDetail id={row.id} finance={finance} />
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </section>

        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          unit="suppliers"
          onPage={list.setPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog {...remove.dialog} />
      <ToastLine message={toast.message} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// One select whose options are a flat string list, blank first where the column
// is nullable — discount_method is, because "not decided yet" is a real answer.
function EnumSelect({ value, options, onChange, disabled, ariaLabel }) {
  return (
    <select value={value ?? ''} onChange={onChange} disabled={disabled} aria-label={ariaLabel} style={inputStyle}>
      <option value="">—</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

// The editable columns, identical on create and on edit — SUPPLIER_FIELDS is the
// same whitelist the API's PATCH accepts, so the two forms cannot drift apart.
function SupplierFields({ values, onChange, disabled }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field label="Name" hint="The slug is derived from this on create and never changes.">
        <input value={values.name ?? ''} disabled={disabled} onChange={onChange('name')} style={inputStyle} />
      </Field>
      <Field label="Short code">
        <input
          value={values.short_code ?? ''}
          disabled={disabled}
          onChange={onChange('short_code')}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="D365 token" hint="The token D365 composes into an item code — PF in “F3518-003 23PF”.">
        <input
          value={values.d365_token ?? ''}
          disabled={disabled}
          onChange={onChange('d365_token')}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Country">
        <input value={values.country ?? ''} disabled={disabled} onChange={onChange('country')} style={inputStyle} />
      </Field>
      <Field label="Invoicing currency" hint="What they invoice in, not the country's currency. Blank = no invoice on file.">
        <input
          value={values.currency ?? ''}
          disabled={disabled}
          onChange={onChange('currency')}
          placeholder="EUR"
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Agent">
        <input value={values.agent ?? ''} disabled={disabled} onChange={onChange('agent')} style={inputStyle} />
      </Field>
      <Field label="Incoterm">
        <input value={values.incoterm ?? ''} disabled={disabled} onChange={onChange('incoterm')} style={inputStyle} />
      </Field>
      <Field label="PO email">
        <input value={values.po_email ?? ''} disabled={disabled} onChange={onChange('po_email')} style={inputStyle} />
      </Field>
      <Field label="Discount method" hint="Averaged is the one supplier-level net rate; per-brand is house by house.">
        <EnumSelect
          value={values.discount_method}
          options={DISCOUNT_METHODS}
          disabled={disabled}
          onChange={onChange('discount_method')}
          ariaLabel="Discount method"
        />
      </Field>
    </div>
  )
}

// Aliases, the houses this supplier invoices, and each house's commercial terms.
// Read-only: the API has no write path for terms, and the aliases are the
// spellings the price lists use, written by the backfill.
function SupplierDetail({ id, finance }) {
  const [detail, setDetail] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setStatus('loading')
    apiFetch(supplierPath(id))
      .then((body) => {
        if (!active) return
        setDetail(body.supplier ?? null)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(messageOf(err, 'Could not load this supplier’s houses.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [id])

  if (status === 'loading') return <PanelNote>Loading houses and terms…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{error}</PanelNote>

  const aliases = detail?.aliases ?? []
  const brands = detail?.brands ?? []

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 18 }}>
      <div>
        <div style={{ ...mutedText, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Aliases
        </div>
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
        <div style={{ ...mutedText, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Houses invoiced · terms
        </div>
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
        </span>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12.5,
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
          <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink }}>
            {finance ? `−${pctText(tier.pct)}` : <MaskedFigure label="Tier discount" />}
          </span>
          <span />
        </div>
      ))}
    </>
  )
}
