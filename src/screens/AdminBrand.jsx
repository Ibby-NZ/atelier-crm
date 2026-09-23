// One house on its own page. The client, 23 Sep 2026: "for any kind of data
// entry … they will open in their own individual page instead of a tabbed drop
// down." This is the editor that used to open INSIDE the house's row on
// /admin/brands, in the same order; the list is only the list now (AdminBrands),
// with the featured strips above it.
//
//   GET   /admin/brands/:id                        → { brand } (+ collections, counts)
//   PATCH /admin/brands/:id                        → { brand }
//   GET   /admin/suppliers?include_archived=&limit= → { suppliers }  the supplier picker
//
// The editor used to be drawn from the LIST row, because the list read carried
// everything it showed. The by-id read carries the same columns but not the
// `supplier_name` the list joins on — and that name is what the picker needs for
// a house still invoiced by an ARCHIVED supplier, where a select with no
// matching option renders blank and saving from there would unlink it. So the
// roster is read archive-inclusive and the name comes off it (supplierPicker).
//
// Archive, restore and delete stay on the list: they are lifecycle verbs on a
// row, and a house that has just been deleted has no page to stay on.
//
// The rules this page honours, all enforced by the API:
//   - The slug is generated on create and IMMUTABLE. It is the storefront URL
//     and the EmDash brand-page match key, so it is shown read-only; a rename
//     changes the display name and leaves every link intact.
//   - **The supplier is set here as well as on the supplier screen.** A supplier
//     is who INVOICES Atelier and a house is what a client buys, and the link
//     between them (`brands.supplier_id`) is what makes a purchase order for a
//     house addressable. It was writable only from inside the supplier's own
//     terms panel, which is finance-gated — so a house that nobody had linked
//     showed no sign of it anywhere. The list row names the supplier or says
//     there is none, and this page sets it. It is not a rate, and no cost figure
//     appears here.
//   - `trade_only` is the storefront's PUBLIC/CLOSED switch and the one field
//     here that changes what an anonymous visitor to atelier.co.nz can see at
//     all: with it set, that house's products are absent from the public grid
//     and its product pages answer 403 until the visitor signs in with an
//     approved trade account. Every house except Atelier's own workroom ships
//     closed. It is a DIFFERENT gate from `is_international`, which only hides
//     the retail PRICE — a house can be public with hidden prices, or trade-only
//     with prices, which is why the title line prints both. The seed writes
//     trade_only on INSERT only (it is absent from the upsert's SET list, unlike
//     `story`), so a decision made here survives every `npm run seed`, and
//     re-opening a house is a CRM edit, never a seed change.
//
// requireRole('backoffice') on the API is the real gate — every CRM login is
// staff (see AuthContext's STAFF_ROLE_MAP), so there is no extra capability here.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import BrandFields from './BrandFields.jsx'
import {
  BRANDS_ROUTE,
  BRAND_EDIT_FIELDS,
  SUPPLIER_ROSTER_PATH,
  brandMeta,
  collectionsPath,
  supplierPicker,
} from './adminCatalogue.js'
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
  useMutation,
  useToast,
} from '../admin/parts.jsx'

export default function AdminBrand() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [brand, setBrand] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | missing | error
  const [loadError, setLoadError] = useState('')
  const [brandDraft, setBrandDraft] = useState({})
  // The supplier picker's roster, archive-inclusive — see the header.
  const [suppliers, setSuppliers] = useState([])

  const load = useCallback(async () => {
    const body = await apiFetch(`/admin/brands/${id}`)
    setBrand(body.brand ?? null)
    return body.brand ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload.
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
        setLoadError(messageOf(err, 'Could not load this house.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  useEffect(() => {
    let active = true
    apiFetch(SUPPLIER_ROSTER_PATH)
      .then((body) => {
        if (active) setSuppliers(body.suppliers ?? [])
      })
      // A failed supplier read must not take the house with it: the picker
      // falls back to naming the house's current supplier by id and nothing
      // else, so a save cannot unlink it by accident.
      .catch(() => {
        if (active) setSuppliers([])
      })
    return () => {
      active = false
    }
  }, [])

  // Re-seed the form from server truth whenever the record reloads, so a saved
  // name is not immediately overwritten by a stale draft on the next keystroke.
  useEffect(() => {
    if (!brand) return
    setBrandDraft(draftFrom(brand, BRAND_EDIT_FIELDS))
  }, [brand])

  const backLink = (
    <>
      <Link to={BRANDS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to houses
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="House not found"
        backTo={BRANDS_ROUTE}
        backLabel="Back to houses"
        message="That house could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="House" />
        <PanelNote>Loading house…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="House" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!brand) return null

  const set = (key, value) => setBrandDraft((d) => ({ ...d, [key]: value }))

  const saveBrand = () => {
    const diff = diffFields(brand, brandDraft, BRAND_EDIT_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', `/admin/brands/${brand.id}`, diff.patch), 'House saved.')
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {brand.name}
            {brand.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={brandMeta(brand)}
        right={<span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{brand.slug}</span>}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="House" />
        <div style={{ padding: '20px 20px 24px' }}>
          <BrandFields
            record={brand}
            values={brandDraft}
            set={set}
            disabled={busy}
            supplierOptions={supplierPicker(suppliers, brand.supplier_id)}
          />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <GhostButton tone="accent" disabled={busy} onClick={saveBrand}>
              Save house
            </GhostButton>
            <Link to={collectionsPath(brand)} className="ab-link" style={{ ...mutedText, color: c.accent }}>
              Manage this house's collections →
            </Link>
          </div>
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
