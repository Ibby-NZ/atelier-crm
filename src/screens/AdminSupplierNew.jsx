// New supplier — the create form on its own page (23 Sep 2026, client asked:
// "for any kind of data entry … they will open in their own individual page
// instead of a tabbed drop down"). It used to drop open above the supplier list
// as "Add a supplier", pushing the list down while it was being filled in and
// sitting there, half-typed, when the office looked away.
//
//   POST /admin/suppliers   → { supplier }  (201)
//
// The fields are <SupplierFields>, the SAME component the supplier's own page
// edits with, so the create and the edit cannot drift apart. A saved supplier
// opens on its page (replacing this one in history, so Back does not return to
// a form that has already been sent) — that page is where contacts, houses and
// terms are added, none of which exists until the supplier does.
//
// Two things this form deliberately does not do:
//   - **No slug field.** It is derived from the name on create and is NOT
//     recomputed on rename — it is the stable key the backfill addresses a
//     supplier by, and a rename is a correction, not a new supplier.
//   - **No currency default from the country.** Jim Thompson is Thailand and
//     invoices USD. Blank means "no invoice on file yet", which is a real answer;
//     `npm run backfill:suppliers` fills it from the rates already on file.
//
// Layout only: the field whitelist and the paths are in ./adminSuppliers.js.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { bodyFrom } from '../admin/drafts.js'
import SupplierFields from './SupplierFields.jsx'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  panel,
  useMutation,
} from '../admin/parts.jsx'
import { NEW_SUPPLIER, SUPPLIERS_PATH, SUPPLIER_FIELDS, supplierRoute } from './adminSuppliers.js'

export default function AdminSupplierNew() {
  const navigate = useNavigate()
  // No list on this screen, so no useCrudScreen: a lone useMutation is the
  // kit's shape for a form that only writes. No toast either — a success
  // leaves this page, and a refusal is the ErrorLine under the form.
  const { busy, error, setError, run } = useMutation({})
  const [draft, setDraft] = useState(NEW_SUPPLIER)

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const built = bodyFrom(draft, SUPPLIER_FIELDS)
    if (built.error) return setError(built.error)
    let created = null
    const ok = await run(() =>
      apiSend('POST', SUPPLIERS_PATH, built.body).then((body) => {
        created = body.supplier
        return body
      })
    )
    // The supplier's own page is where the rest of it is filled in; landing
    // back on an empty form would read as "it did not save".
    if (ok && created) navigate(supplierRoute(created.id), { replace: true })
    return undefined
  }

  const backLink = (
    <>
      <Link to={SUPPLIERS_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to suppliers
      </Link>
      {' · live'}
    </>
  )

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={<>New supplier</>}
        subtitle="Who invoices Atelier. Contacts, the houses it sells and its terms are added on the supplier's own page once it is saved. Currency is the supplier's invoicing currency, not the country's."
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Supplier" />
        <form onSubmit={submit} style={{ padding: '20px 20px 26px' }}>
          <SupplierFields values={draft} onChange={setField} disabled={busy} />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              {busy ? 'Adding…' : 'Add supplier'}
            </GhostButton>
            <GhostButton disabled={busy} onClick={() => navigate(SUPPLIERS_PATH)}>
              Cancel
            </GhostButton>
          </div>
        </form>
      </section>
    </div>
  )
}
