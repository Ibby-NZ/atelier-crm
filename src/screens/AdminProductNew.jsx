// New product — the form that puts a design on the website, on a page of its
// own. It used to drop down above the products list ("Add a product"); the
// client asked on 23 Sep 2026 for every kind of data entry to open "in their
// own individual page instead of a tabbed drop down", and a create is data
// entry too.
//
//   GET  /admin/brands                    → { brands }       the house picker
//   GET  /admin/collections               → { collections }  narrowed to the chosen house
//   GET  /admin/products?brand_id=&limit= → { products }     the size suggestions
//   POST /admin/products                  → { product }  (201)
//
// The form is ProductFields, the same component the design's own page draws,
// so the two cannot drift. What only a create has:
//   - House and Type are chosen here and fixed afterwards: the slug is built
//     from the house's name, and the type decides the colourway's stock unit.
//     Both go up from PRODUCT_CREATE_ONLY_FIELDS, never from the PATCH list.
//   - No record lock. A create body is built from the FULL declaration — name
//     and currency are required on the POST, so a shortened body is a 400 and
//     the lock would read as "adding a product is broken".
//   - A product create takes no inline colourways. The office lands on the new
//     design's own page, where its colourways are added — landing back on an
//     empty form would read as "it did not save".

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { useCategories } from '../admin/useCategories.js'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom } from '../admin/drafts.js'
import ProductFields, { SizeList } from './ProductFields.jsx'
import {
  NEW_PRODUCT,
  PRODUCTS_ROUTE,
  PRODUCT_CREATE_ONLY_FIELDS,
  PRODUCT_FIELDS,
  productRoute,
} from './adminCatalogue.js'
import {
  CheckField,
  ErrorLine,
  GhostButton,
  PanelHead,
  ToastLine,
  messageOf,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'

export default function AdminProductNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this page, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })

  const [newProduct, setNewProduct] = useState(NEW_PRODUCT)
  const [brands, setBrands] = useState([])
  const [collections, setCollections] = useState([])
  const { options: categoryOptions } = useCategories()

  // Brands and collections back the two selects; they change far less often
  // than products, so they load once. On the list a failure here was left to
  // the product read to report; this page has no other read, so it says so —
  // an empty house picker with no reason reads as "there are no houses".
  useEffect(() => {
    let active = true
    Promise.all([apiFetch('/admin/brands'), apiFetch('/admin/collections')])
      .then(([brandBody, collectionBody]) => {
        if (!active) return
        setBrands(brandBody.brands ?? [])
        setCollections(collectionBody.collections ?? [])
      })
      .catch((err) => {
        if (active) setError(messageOf(err, 'Could not load the houses and collections.'))
      })
    return () => {
      active = false
    }
  }, [setError])

  const set = (key, value) => setNewProduct((p) => ({ ...p, [key]: value }))

  const chooseHouse = (brandId) => {
    const brand = brands.find((b) => String(b.id) === brandId)
    setNewProduct((p) => ({
      ...p,
      brand_id: brandId,
      // A collection belongs to one house — a stale pick 422s.
      collection_id: '',
      currency: brand?.currency ?? p.currency,
    }))
  }

  const houseCollections = newProduct.brand_id
    ? collections.filter((x) => String(x.brand_id) === String(newProduct.brand_id))
    : []

  const createProduct = async (event) => {
    event.preventDefault()
    const identity = bodyFrom(newProduct, PRODUCT_CREATE_ONLY_FIELDS)
    if (identity.error) return setError(identity.error)
    const rest = bodyFrom(newProduct, PRODUCT_FIELDS)
    if (rest.error) return setError(rest.error)
    let created = null
    const ok = await run(
      () =>
        apiSend('POST', '/admin/products', { ...rest.body, ...identity.body }).then((body) => {
          created = body.product
          return body
        }),
      (res) => `Created ${res.product.name}. Add its variations next.`
    )
    // Replace, not push: Back from the new design should go to the list, not
    // to an empty form that would create it a second time.
    if (ok && created) navigate(productRoute(created.id), { replace: true })
    return undefined
  }

  const backLink = (
    <>
      <Link to={PRODUCTS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to products
      </Link>
      {' · live'}
    </>
  )

  return (
    <div>
      {/* One datalist for the page: the chosen house's sizes. */}
      <SizeList brandId={newProduct.brand_id} />
      <PageHeader
        eyebrow={backLink}
        title="New product"
        subtitle="What the storefront sells. Choose the house first — its currency and collections follow. A product needs at least one variation to be orderable; you add those on its page next."
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Add a product" />
        <form onSubmit={createProduct} style={{ padding: 20 }}>
          <ProductFields
            values={newProduct}
            set={set}
            disabled={busy}
            brands={brands}
            onBrand={chooseHouse}
            collections={houseCollections}
            categoryOptions={categoryOptions}
          />
          <div style={{ marginTop: 16 }}>
            <CheckField
              label="Show on the website"
              checked={newProduct.show_on_website}
              disabled={busy}
              onChange={(e) => set('show_on_website', e.target.checked)}
            />
          </div>
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Create product
            </GhostButton>
            <Link to={PRODUCTS_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton>Cancel</GhostButton>
            </Link>
          </div>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
