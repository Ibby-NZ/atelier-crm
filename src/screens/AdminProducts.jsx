// Products & colourways — live catalogue rows, wired to atelier-api's
// /admin/products. This screen and the two pages behind it are what put a
// design on the website; this one is the LIST.
//
//   GET    /admin/products?brand_id=&include_archived=&q=&category=
//            &price_min_cents=&price_max_cents=&unpriced=&page=&limit=
//                                                       → { products, meta }
//   POST   /admin/products/:id/archive|restore
//   DELETE /admin/products/:id                          → { deleted } | 409 { blockers }
//
// One design OPENS ON ITS OWN PAGE (AdminProduct, /admin/products/:id) and a new
// one is made on its own form (AdminProductNew, /admin/products/new). Both used
// to open inside this list — the editor under its row, the create form above
// the table — until the client asked on 23 Sep 2026 for every kind of data
// entry to open "in their own individual page instead of a tabbed drop down".
// This screen is the list, its filters, and the lifecycle verbs; the rules a
// product's form honours (the create-only slug and type, typed SKUs, the
// colourway's stock row, the price-change reason, the record lock) moved with
// the form and are stated at the top of AdminProduct.
//
// `?open=<id>` used to open one design inside this list — the order page's SKU
// link and the sample desk's wrote it, and staff will have it bookmarked. It
// now redirects to that design's page (openedProductRoute), and the links that
// wrote it link to the page directly (adminOrders.js productPath).
//
// Archive is the reversible removal; DELETE is permanent and is refused while
// the product has been sold or still holds stock. A product OWNS its colourways
// and their stock rows and takes them with it, but the API probes through them
// first: an order line anywhere underneath, or stock on hand or reserved, comes
// back 409 with the counts. The dialog stays open on that refusal and offers
// Archive instead — which is why useCrudScreen is handed an archive action here
// and not only a delete path. Both verbs stay on the row: they are lifecycle
// verbs, and a design that has just been deleted has no page to stay on.

import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { useCategories } from '../admin/useCategories.js'
import { priceBandOptions } from '../lib/priceBands.js'
import { apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import Pagination from '../admin/Pagination.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { useConfirmation } from '../admin/useConfirmation.js'
import {
  NEW_PRODUCT_ROUTE,
  PRODUCT_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  openedProductRoute,
  productListFilters,
  productRoute,
  typeLabel,
} from './adminCatalogue.js'
import {
  ArchivedTag,
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  Select,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'

// The last product column carries Open / Archive / Delete. Size and the
// colourway count are not list columns (23 Sep 2026, client asked to take them
// off the table); both are on the product's own page.
const PRODUCT_COLUMNS = '1.7fr 1fr 110px 110px 90px 215px'

// An old `?open=<id>` link is answered before the list mounts at all, so a
// bookmark costs one redirect rather than a list read thrown away.
export default function AdminProducts() {
  const [searchParams] = useSearchParams()
  const opened = openedProductRoute(searchParams.get('open'))
  if (opened) return <Navigate to={opened} replace />
  return <ProductList />
}

function ProductList() {
  const confirmation = useConfirmation()
  const [brands, setBrands] = useState([])
  const [brandFilter, setBrandFilter] = useState('')
  // Every filter goes to the API: the list pages, so narrowing the rows on
  // screen would miss a match on any other page. The search box is committed
  // on submit (`term`), not per keystroke, the way Supplier rates' is.
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  // The category starts from `?category=<slug>`, because Categories links each
  // of its rows through to the designs in it. Held in state after that: this
  // screen's own filter bar is what drives it once it is mounted.
  const [searchParams] = useSearchParams()
  const [categoryFilter, setCategoryFilter] = useState(
    () => searchParams.get('category') ?? ''
  )
  const [bandFilter, setBandFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // The vocabulary, from the API rather than a frozen list: the office adds
  // categories on the Categories screen and must be able to filter by one the
  // minute it exists.
  const { options: categoryOptions, labelFor: categoryLabel } = useCategories()

  // The product list, the toast and the whole delete flow in one. `archive` is
  // what puts "Archive instead" on a refusal — useCrudScreen offers it only when
  // the API says the entity is archivable AND the screen supplied the action.
  const crud = useCrudScreen({
    path: '/admin/products',
    key: 'products',
    limit: PRODUCT_LIST_LIMIT,
    filters: productListFilters(brandFilter, showArchived, {
      q: term,
      category: categoryFilter,
      priceBand: bandFilter,
    }),
    entity: 'product',
    describe: (product) => product?.name,
    archive: (product) => apiSend('POST', archiveInsteadPath('/admin/products', product), {}),
  })
  const products = crud.list.rows
  // The bands on offer run up to the catalogue's ceiling, which the endpoint
  // reports in meta — the rows on screen are one page and cannot say.
  const bandOptions = priceBandOptions(crud.list.meta?.max_price_cents)
  const { message } = crud.toast
  // One list on this screen now, so the kit's own mutation cycle serves it. It
  // built a combined reload of its own while the open editor had a detail read
  // to refresh beside the list; that read lives on the product's page.
  const { busy, error, setError, run } = crud.mutation

  // Brands back the house filter; they change far less often than products, so
  // they load once.
  useEffect(() => {
    let active = true
    apiFetch('/admin/brands')
      .then((body) => {
        if (active) setBrands(body.brands ?? [])
      })
      .catch(() => {
        /* the product load below reports the failure; the filter just stays empty */
      })
    return () => {
      active = false
    }
  }, [])

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const archiveProduct = async (product) => {
    const archived = Boolean(product.archived_at)
    if (
      !archived &&
      !(await confirmation.ask({
        title: `Archive ${product.name} (${product.brand_name || `#${product.id}`})?`,
        body: `Archive ${product.name}? It comes off the website and out of this list, and you can restore it later.`,
        confirmLabel: 'Archive',
        confirmTone: 'ink',
      }))
    ) {
      return
    }
    run(
      () => apiSend('POST', archiveTogglePath('/admin/products', product), {}),
      archived ? `${product.name} restored.` : `${product.name} archived.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue · live"
        title={<>Products &amp; colourways</>}
        subtitle="What the storefront sells. A product needs at least one colourway to be orderable; each colourway’s stock is set on its product’s page."
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{' '}
            Show archived
          </label>
        }
      />
      <SectionTabs tabs={catalogueTabs} active="products" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Add a product"
            right={
              // A create is data entry, so it opens on its own page like the
              // record does, rather than dropping down above the list.
              <Link to={NEW_PRODUCT_ROUTE} style={{ textDecoration: 'none' }}>
                <GhostButton>New product</GhostButton>
              </Link>
            }
          />
        </section>

        <section style={{ ...panel, minWidth: 0, overflow: 'clip' }}>
          <PanelHead
            label="Products"
            right={
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={draftTerm}
                    onChange={(e) => setDraftTerm(e.target.value)}
                    placeholder="Product name"
                    style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 200 }}
                    aria-label="Search products"
                  />
                  <GhostButton type="submit" disabled={busy}>
                    Search
                  </GhostButton>
                </form>
                <Select
                  value={brandFilter}
                  disabled={busy}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 'auto' }}
                  aria-label="Filter by house"
                >
                  <option value="">All houses</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={categoryFilter}
                  disabled={busy}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 'auto' }}
                  aria-label="Filter by category"
                >
                  <option value="">All categories</option>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={bandFilter}
                  disabled={busy}
                  onChange={(e) => setBandFilter(e.target.value)}
                  style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 'auto' }}
                  aria-label="Filter by price band"
                >
                  <option value="">All prices</option>
                  {bandOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {crud.list.total} shown
                </span>
              </span>
            }
          />
          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {crud.list.status === 'loading' && <PanelNote>Loading products…</PanelNote>}
          {crud.list.status === 'error' && (
            <PanelNote tone="danger">{crud.list.error}</PanelNote>
          )}
          {crud.list.status === 'ready' && products.length === 0 && (
            <PanelNote>No products match this filter.</PanelNote>
          )}

          {crud.list.status === 'ready' && products.length > 0 && (
            <>
              <HeaderRow
                columns={PRODUCT_COLUMNS}
                labels={['Product', 'House · collection', 'Type', 'Category', 'Website', '']}
              />
              {products.map((product) => (
                <Row key={product.id} columns={PRODUCT_COLUMNS} archived={Boolean(product.archived_at)}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                      <Link
                        to={productRoute(product.id)}
                        className="ab-link"
                        style={{ color: c.ink, textDecoration: 'none' }}
                      >
                        {product.name}
                      </Link>
                      {product.archived_at && <ArchivedTag />}
                    </span>
                    <span style={{ display: 'block', ...monoText, fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {product.slug}
                    </span>
                  </span>
                  <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {product.brand_name}
                    {product.collection_name ? ` · ${product.collection_name}` : ''}
                  </span>
                  <span style={mutedText}>{typeLabel(product.product_type)}</span>
                  {/* An em dash, never a blank cell: uncategorised is a
                      statement about the row, and most of the catalogue is
                      still uncategorised. */}
                  <span style={mutedText}>{categoryLabel(product.category) || '—'}</span>
                  <span style={{ ...mutedText, color: product.show_on_website ? c.sage : c.muted }}>
                    {product.show_on_website ? 'Live' : 'Hidden'}
                  </span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={productRoute(product.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    <GhostButton disabled={busy} onClick={() => archiveProduct(product)}>
                      {product.archived_at ? 'Restore' : 'Archive'}
                    </GhostButton>
                    {/* The permanent verb is the QUIET one on the row — no
                        border, no red — so it is never the eye-catching
                        click (15 Sep 2026 audit, CRM-07). The danger colour
                        belongs to the confirm dialog it opens. */}
                    <GhostButton
                      disabled={busy}
                      style={{ border: 'none', color: c.muted }}
                      onClick={() => crud.remove.ask(product)}
                    >
                      Delete
                    </GhostButton>
                  </span>
                </Row>
              ))}
            </>
          )}
        </section>
      </div>

      <Pagination
        page={crud.list.page}
        totalPages={crud.list.totalPages}
        total={crud.list.total}
        unit="products"
        onPage={crud.list.setPage}
        busy={busy}
      />

      <ConfirmDialog {...crud.remove.dialog} />
      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
