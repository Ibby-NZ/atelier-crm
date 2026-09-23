// New house, on a page of its own. It used to drop down above the houses list
// ("Add a house"); the client asked on 23 Sep 2026 for every kind of data
// entry to open "in their own individual page instead of a tabbed drop down",
// and a create is data entry too.
//
//   POST /admin/brands → { brand }  (201)
//
// The form is BrandFields, the same component the house's own page draws, so
// the two cannot drift. Two things only a create does:
//   - It sends BRAND_FIELDS, never the edit list: POST /admin/brands takes no
//     supplier (Ajv strips the key), so a house is created, then linked — the
//     order the office works in anyway, since the supplier record often
//     arrives with the first invoice. The supplier is set on the house's page.
//   - It starts CLOSED (NEW_BRAND: trade_only true), matching the API's create
//     default: a maison Atelier has just been given must not appear on the
//     public website the moment someone types its name.
//
// A created house lands on its own page, where the slug the API generated is
// shown and the supplier can be linked next.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { bodyFrom } from '../admin/drafts.js'
import BrandFields from './BrandFields.jsx'
import { BRANDS_ROUTE, BRAND_FIELDS, NEW_BRAND, brandRoute } from './adminCatalogue.js'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  ToastLine,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'

export default function AdminBrandNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this page, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })
  const [newBrand, setNewBrand] = useState(NEW_BRAND)

  const set = (key, value) => setNewBrand((b) => ({ ...b, [key]: value }))

  const createBrand = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newBrand, BRAND_FIELDS)
    if (built.error) return setError(built.error)
    let created = null
    const ok = await run(
      () =>
        apiSend('POST', '/admin/brands', built.body).then((body) => {
          created = body.brand
          return body
        }),
      (res) => `${res.brand.name} created — slug ${res.brand.slug}.`
    )
    // Replace, not push: Back from the new house should go to the list, not to
    // a filled form that would create it a second time.
    if (ok && created) navigate(brandRoute(created.id), { replace: true })
    return undefined
  }

  const backLink = (
    <>
      <Link to={BRANDS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to houses
      </Link>
      {' · live'}
    </>
  )

  return (
    <div>
      <PageHeader
        eyebrow={backLink}
        title="New house"
        subtitle="A maison the storefront will carry. Its web address is generated from the name and never changes; link the supplier who invoices it on its page once it exists."
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Add a house" />
        <form onSubmit={createBrand} style={{ padding: 20 }}>
          <BrandFields values={newBrand} set={set} disabled={busy} />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Create house
            </GhostButton>
            <Link to={BRANDS_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton>Cancel</GhostButton>
            </Link>
          </div>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
