// Suppliers — the platform's own supplier master, wired to atelier-api's
// /admin/suppliers. Live: it reads AND writes real rows. The demo Suppliers
// screen that sat beside it (src/data/suppliers.js + localStorage) was retired
// in Sept 2026 — the client read its invented roll-up as ours — and /suppliers
// now redirects here.
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
// supplier sells several houses (Rubelli sells Kieffer), so the two are
// separate records and this screen is where the link is made.
//
// One supplier OPENS ON ITS OWN PAGE (AdminSupplier, /admin/suppliers/:id) — it
// used to expand inside the row, and the contacts, houses and terms panels under
// it pushed the rest of the table off the screen. A NEW supplier is keyed on its
// own page too (AdminSupplierNew, /admin/suppliers/new, 23 Sep 2026): the "Add a
// supplier" form used to drop open above this list, and the client asked for
// every kind of data entry to open on its own page instead. This screen is the
// list, the search and the lifecycle verbs; everything about ONE supplier is on
// the page behind "Open".
//
// **No pre-flight before a delete.** The API's 409 carries the blockers and says
// whether archiving is available; asking first would race it.
//
// Cost masking follows the demo screen's rule: a value that states the METHOD
// ("2 discount tiers") survives a login without FINANCE_VIEW, a value that
// quotes a RATE does not. All of it is drawing, not access control — the real
// gate is the API's requireRole('backoffice'), and CAPS says so at length.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import {
  ArchivedTag,
  CheckField,
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  NEW_SUPPLIER_ROUTE,
  SUPPLIERS_PATH,
  archivePath,
  archiveVerb,
  lastContactText,
  supplierFilters,
  supplierMeta,
  supplierPath,
  supplierRoute,
} from './adminSuppliers.js'

const LIMIT = 25
const COLUMNS = '1.4fr 90px 70px 0.9fr 1fr 230px'

export default function AdminSuppliers() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // The backfill writes supplier records and per-house terms in one go; the
  // API answers 403 below director, so the button only shows where it works.
  const isDirector = useAuth().user?.apiRole === 'director'

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

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const archiveSupplier = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archivePath(row), {}),
      `${row.name} ${verb === 'archive' ? 'archived' : 'restored'}.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Suppliers · live"
        title={<>Manage suppliers</>}
        subtitle="Who invoices Atelier, and which houses each one sells. Currency is the supplier's invoicing currency, not the country's."
        right={
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <CheckField
              label="Show archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {/* The create form is its own page (23 Sep 2026); it used to drop
                open here, above the list. */}
            <Link to={NEW_SUPPLIER_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">New supplier</GhostButton>
            </Link>
          </div>
        }
      />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
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
              placeholder="Name, house, alias, short code or country"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
              aria-label="Search suppliers"
            />
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {list.status === 'loading' && <PanelNote>Loading suppliers…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
          {list.status === 'ready' && list.rows.length === 0 && (
            <PanelNote>
              {term ? 'No supplier matches that search.' : 'No suppliers recorded yet.'}
              {/* Staging sat empty for a week because the backfill only existed
                  as a shell command and the server has none (Userback
                  8367793). Idempotent on the API, so a second press is safe. */}
              {!term && isDirector && (
                <span style={{ display: 'block', marginTop: 10 }}>
                  <GhostButton
                    tone="accent"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => apiSend('POST', `${SUPPLIERS_PATH}/backfill`, {}),
                        'Suppliers built from the price lists and the office roster.'
                      )
                    }
                  >
                    Build suppliers from price lists
                  </GhostButton>
                </span>
              )}
            </PanelNote>
          )}

          {list.status === 'ready' && list.rows.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={[
                  'Supplier',
                  'Short code',
                  'D365',
                  'Country · currency · method',
                  'Last contact',
                  '',
                ]}
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
                        <Link
                          to={supplierRoute(row.id)}
                          className="ab-link"
                          style={{ color: c.ink, textDecoration: 'none' }}
                        >
                          {row.name}
                        </Link>
                        {row.archived_at && <ArchivedTag />}
                      </span>
                      <span style={{ display: 'block', ...monoText, fontSize: 11 }}>{row.slug}</span>
                    </span>
                    <span style={monoText}>{row.short_code || '—'}</span>
                    <span style={monoText}>{row.d365_token || '—'}</span>
                    <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {supplierMeta(row)}
                    </span>
                    {/* Null renders as "No contact yet" — the gone-quiet glance. */}
                    <span
                      style={{
                        ...mutedText,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: row.last_contact ? c.inkSoft : c.muted,
                      }}
                    >
                      {lastContactText(row.last_contact)}
                    </span>
                    <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Link to={supplierRoute(row.id)} style={{ textDecoration: 'none' }}>
                        <GhostButton>Open</GhostButton>
                      </Link>
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
