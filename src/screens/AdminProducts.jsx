// Products & colourways — live catalogue rows, wired to atelier-api's
// /admin/products and /admin/colourways. This is the screen that puts a design
// on the website: it is the only place in the CRM that creates a sellable SKU.
//
//   GET    /admin/products?brand_id=&include_archived=  → { products }
//   GET    /admin/products/:id                          → { product } (+ colourways)
//   POST   /admin/products                              → { product }
//   PATCH  /admin/products/:id                          → { product }
//   POST   /admin/products/:id/archive|restore
//   DELETE /admin/products/:id                          → { deleted } | 409 { blockers }
//   POST   /admin/products/:id/colourways               → { colourway } (+ stock row)
//   PATCH  /admin/colourways/:id                        → { colourway }
//   POST   /admin/colourways/:id/archive|restore
//   GET    /admin/products/:id/price-history            → { changes }
//
// Four API rules the form has to honour:
//   - `slug` and `product_type` are create-only. The slug is the storefront URL;
//     the type decides the stock unit (fabric → metres, finished good → units),
//     which the colourway's inventory row was created with. Both render read-only.
//   - SKUs are typed by staff, not generated. The CRM's Brand-Product-Colour
//     generator was never ported, so uniqueness is the database's job — a clash
//     comes back as a 409 and is shown inline.
//   - A colourway create is one transaction that also inserts a zero stock row,
//     so a duplicate SKU leaves no orphan. Quantities are edited on Manage stock.
//   - Archive is the reversible removal; DELETE is permanent and is refused
//     while the product has been sold or still holds stock. A product OWNS its
//     colourways and their stock rows and takes them with it, but the API probes
//     through them first: an order line anywhere underneath, or stock on hand or
//     reserved, comes back 409 with the counts. The dialog stays open on that
//     refusal and offers Archive instead — which is why useCrudScreen is handed
//     an archive action here and not only a delete path.
//   - A save that MOVES either price must carry a `reason` — the API answers
//     422 without one (requireChangeReason, recorded against the old and new
//     figures in product_price_history), so the form collects it beside the
//     prices. Restating the same figures needs nothing, which diffFields
//     already guarantees. The rule lives in src/admin/priceChange.js.
//
// The specs, the prose and both prices are DIRECTOR-ONLY to edit (Userback
// 8287677) — locked, not removed, and only on this record's editor; see
// src/screens/recordLock.js, which also says why the API is still the gate.

import { useCallback, useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { CATEGORY_OPTIONS, categoryLabel } from '../lib/categories.js'
import { matchesProductFilters, priceBandOptions } from '../lib/priceBands.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom, toNumber } from '../admin/drafts.js'
import { PRODUCT_PRICE_KEYS, withReason } from '../admin/priceChange.js'
import { dayOf, priceMoveText, productHistoryPath, sourceLabel } from '../admin/priceHistory.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  CATALOGUE_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  productListFilters,
  sizesInUse,
} from './adminCatalogue.js'
import {
  LOCKED_PRODUCT_KEYS,
  RECORD_LOCK_NOTE,
  canEditRecords,
  editableFields,
  isFieldLocked,
} from './recordLock.js'
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
  ToneChips,
  cellInput,
  inputStyle,
  messageOf,
  monoCellInput,
  monoText,
  mutedText,
  panel,
  readOnlyInput,
  sectionLabel,
  useMutation,
} from '../admin/parts.jsx'

const PRODUCT_TYPES = [
  { value: 'fabric', label: 'Fabric' },
  { value: 'finished_good', label: 'Finished good' },
]
const typeLabel = (value) => PRODUCT_TYPES.find((t) => t.value === value)?.label ?? value

// The id of the one <datalist> of sizes already in use. It is rendered ONCE at
// the top of the screen rather than inside each panel: the create form and an
// open editor can both be on screen, and two elements sharing an id is the kind
// of thing that works until it does not.
const SIZE_LIST_ID = 'admin-product-sizes'

// Free-text spec columns, all nullable — a blank input clears them.
// `list` hangs a <datalist> off the input; `multiline` renders a <textarea>.
// Both are presentation, read only by SpecInput at the foot of this file.
const SPEC_FIELDS = Object.freeze([
  // One product per size — a bath sheet and a face cloth are different prices,
  // and price lives on the product, so they are two rows rather than two
  // variants of one. Free text over the sizes already in use: the vocabulary is
  // per category and open-ended (queen/king for bed linen, hand/bath for
  // towels), and typing a new one is how a new size comes to exist. Same shape
  // the freight desk gives its zones.
  { key: 'size', label: 'Size', kind: 'text', list: SIZE_LIST_ID },
  { key: 'composition', label: 'Composition', kind: 'text' },
  { key: 'width', label: 'Width', kind: 'text' },
  { key: 'rubs', label: 'Rubs', kind: 'text' },
  { key: 'application', label: 'Application', kind: 'text' },
  { key: 'price_band', label: 'Price band', kind: 'text' },
  { key: 'lead_time', label: 'Lead time', kind: 'text' },
  // Sales prose for the storefront's product page — the API types it
  // `nullableText` (2000), like a collection's editorial, not one of the short
  // spec fields above it. Hence the textarea.
  { key: 'description', label: 'Description', kind: 'text', multiline: true },
])

// Money is integer cents in the API and dollars in the form (kind: 'money').
const PRICE_FIELDS = Object.freeze([
  { key: 'retail_price_cents', label: 'Retail price', kind: 'money' },
  { key: 'trade_price_cents', label: 'Trade price', kind: 'money' },
])

// Editable on both create and PATCH. brand_id and product_type are create-only
// and therefore live in CREATE_ONLY_FIELDS instead.
const PRODUCT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper', required: true },
  { key: 'collection_id', label: 'Collection', kind: 'ref' },
  // The merchandising axis, and EDITABLE — unlike `product_type` in
  // CREATE_ONLY_FIELDS below, which decides the colourway's stock unit and
  // would strand stock if it moved. Blank clears it: uncategorised is a real
  // state (most of the catalogue), not a gap. Until this field existed the
  // column could only be written in bulk, through Catalogue → Categories.
  { key: 'category', label: 'Category', kind: 'enum' },
  // The reporting dimension, not a spec: Atelier's own spelling of the house's
  // product line ("PIERRE FREY", "C & C Milano Bedding"), which the report
  // layer's `range` filter matches on. Free text — the range vocabulary lives
  // in the D365 staging mirror, not in a table — and `text` kind, so a cleared
  // input goes up as null and empties the column.
  { key: 'product_range', label: 'Range', kind: 'text' },
  ...SPEC_FIELDS,
  ...PRICE_FIELDS,
  { key: 'hi_res_asset_url', label: 'Hi-res asset URL', kind: 'text' },
  { key: 'show_on_website', label: 'Show on the website', kind: 'bool' },
])

const CREATE_ONLY_FIELDS = Object.freeze([
  { key: 'brand_id', label: 'House', kind: 'ref', required: true },
  { key: 'product_type', label: 'Type', kind: 'enum', required: true },
])

const COLOURWAY_FIELDS = Object.freeze([
  { key: 'name', label: 'Colourway name', kind: 'text', required: true },
  { key: 'sku', label: 'SKU', kind: 'text', required: true },
  { key: 'hex_tones', label: 'Tones', kind: 'tones' },
  { key: 'image_url', label: 'Image URL', kind: 'text' },
])

const NEW_PRODUCT = Object.freeze({
  brand_id: '',
  product_type: 'fabric',
  name: '',
  currency: 'NZD',
  collection_id: '',
  category: '',
  product_range: '',
  size: '',
  composition: '',
  width: '',
  rubs: '',
  application: '',
  price_band: '',
  lead_time: '',
  description: '',
  retail_price_cents: '',
  trade_price_cents: '',
  hi_res_asset_url: '',
  show_on_website: false,
})

const NEW_COLOURWAY = Object.freeze({ name: '', sku: '', hex_tones: '', image_url: '' })

// The last product column carries Edit / Archive / Delete.
const PRODUCT_COLUMNS = '1.7fr 1fr 110px 110px 110px 100px 90px 215px'
const COLOURWAY_COLUMNS = '1.1fr 1fr 1.1fr 1.2fr 1fr 150px'
// The price-history table inside an open product: changed day, both prices
// (each row carries both — one figure alone cannot say whether the other moved
// with it), provenance, reason.
const HISTORY_COLUMNS = '90px 1.1fr 1.1fr 1.3fr 1.5fr'

// A stock line reads as one sentence, and says so plainly when a colourway has
// no inventory row at all (a short backorder can leave one absent).
function stockLabel(inventory) {
  if (!inventory) return 'No stock row'
  const available = toNumber(inventory.qty_available)
  const reserved = toNumber(inventory.qty_reserved)
  return `${available} ${inventory.unit} · ${reserved} reserved`
}

export default function AdminProducts() {
  const [brands, setBrands] = useState([])
  const [collections, setCollections] = useState([])
  const [brandFilter, setBrandFilter] = useState('')
  // Category and price band narrow the LOADED list (the API's product list
  // filters by house only), which is what the storefront's refine column does
  // too — and the list is one page of up to CATALOGUE_LIST_LIMIT rows, so there
  // is nothing on a later page to miss.
  const [categoryFilter, setCategoryFilter] = useState('')
  const [bandFilter, setBandFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailStatus, setDetailStatus] = useState('idle') // idle | loading | ready
  const [productDraft, setProductDraft] = useState({})
  // The change-reason note for the open product's prices. Not part of the
  // draft: it is not a column and must never be diffed against the record.
  const [reason, setReason] = useState('')
  const [colourwayDrafts, setColourwayDrafts] = useState({}) // id -> draft
  const [newColourway, setNewColourway] = useState(NEW_COLOURWAY)
  const [newProduct, setNewProduct] = useState(NEW_PRODUCT)
  const [showNewProduct, setShowNewProduct] = useState(false)

  const isDirector = canEditRecords(useAuth().user)
  // The list a SAVE works over. The draft below is still built from the full
  // declaration, so a locked box shows its value; this is what keeps the value
  // out of the patch.
  const editableProductFields = editableFields(PRODUCT_FIELDS, LOCKED_PRODUCT_KEYS, isDirector)
  const locked = (key) => isFieldLocked(key, LOCKED_PRODUCT_KEYS, isDirector)

  // The product list, the toast and the whole delete flow in one. `archive` is
  // what puts "Archive instead" on a refusal — useCrudScreen offers it only when
  // the API says the entity is archivable AND the screen supplied the action.
  const crud = useCrudScreen({
    path: '/admin/products',
    key: 'products',
    limit: CATALOGUE_LIST_LIMIT,
    filters: productListFilters(brandFilter, showArchived),
    entity: 'product',
    describe: (product) => product?.name,
    archive: (product) => apiSend('POST', archiveInsteadPath('/admin/products', product), {}),
  })
  const products = crud.list.rows.filter((product) =>
    matchesProductFilters(product, { category: categoryFilter, priceBand: bandFilter })
  )
  const bandOptions = priceBandOptions(crud.list.rows)
  const { message, flash } = crud.toast

  const loadDetail = useCallback(async (productId) => {
    const body = await apiFetch(`/admin/products/${productId}`)
    const product = body.product ?? null
    setDetail(product)
    if (product) {
      setProductDraft(draftFrom(product, PRODUCT_FIELDS))
      setColourwayDrafts(
        (product.colourways ?? []).reduce(
          (acc, colourway) => ({
            ...acc,
            [colourway.id]: draftFrom(colourway, COLOURWAY_FIELDS),
          }),
          {}
        )
      )
    }
    return product
  }, [])

  // One reload covers both the list and (when open) the detail: a rename changes
  // the row, a colourway change changes the count on it.
  const reload = useCallback(async () => {
    await crud.list.reload()
    if (openId != null) await loadDetail(openId)
  }, [crud.list.reload, openId, loadDetail])

  const { busy, error, setError, run } = useMutation({ reload, flash })

  // Brands and collections back the two selects; they change far less often than
  // products, so they load once.
  useEffect(() => {
    let active = true
    Promise.all([apiFetch('/admin/brands'), apiFetch('/admin/collections')])
      .then(([brandBody, collectionBody]) => {
        if (!active) return
        setBrands(brandBody.brands ?? [])
        setCollections(collectionBody.collections ?? [])
      })
      .catch(() => {
        /* the product load below reports the failure; selects just stay empty */
      })
    return () => {
      active = false
    }
  }, [])

  // The open editor follows the list. A product that has just been deleted — or
  // archived out of view — is no longer a row to expand, and a stale `openId`
  // would make the next mutation's reload re-read a row that is gone. AdminBrands
  // closes its editor the same way.
  useEffect(() => {
    if (openId == null || crud.list.status !== 'ready') return
    if (products.some((product) => product.id === openId)) return
    setOpenId(null)
    setDetail(null)
  }, [openId, products, crud.list.status])

  const collectionsForBrand = (brandId) =>
    brandId ? collections.filter((x) => String(x.brand_id) === String(brandId)) : []

  const toggle = async (product) => {
    setError('')
    setReason('')
    if (openId === product.id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(product.id)
    setDetail(null)
    setNewColourway(NEW_COLOURWAY)
    setDetailStatus('loading')
    try {
      await loadDetail(product.id)
    } catch (err) {
      setError(messageOf(err, 'Could not load this product.'))
    } finally {
      setDetailStatus('ready')
    }
  }

  const createProduct = async (event) => {
    event.preventDefault()
    const identity = bodyFrom(newProduct, CREATE_ONLY_FIELDS)
    if (identity.error) return setError(identity.error)
    const rest = bodyFrom(newProduct, PRODUCT_FIELDS)
    if (rest.error) return setError(rest.error)
    const ok = await run(
      () => apiSend('POST', '/admin/products', { ...rest.body, ...identity.body }),
      (res) => `Created ${res.product.name}. Add its colourways next.`
    )
    if (ok) {
      setNewProduct(NEW_PRODUCT)
      setShowNewProduct(false)
    }
  }

  const saveProduct = async (product) => {
    const diff = diffFields(product, productDraft, editableProductFields)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    // A moved price must carry its reason or the API 422s; an unmoved one must
    // not be nagged for a note about a change that is not happening.
    const noted = withReason(diff.patch, reason, PRODUCT_PRICE_KEYS)
    if (noted.error) return setError(noted.error)
    const ok = await run(
      () => apiSend('PATCH', `/admin/products/${product.id}`, noted.patch),
      'Product saved.'
    )
    // The note belongs to the change it explained, not to the next edit.
    if (ok) setReason('')
  }

  const archiveProduct = (product) => {
    const archived = Boolean(product.archived_at)
    if (
      !archived &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Archive ${product.name}? It comes off the website and out of this list, and you can restore it later.`
      )
    ) {
      return
    }
    run(
      () => apiSend('POST', archiveTogglePath('/admin/products', product), {}),
      archived ? `${product.name} restored.` : `${product.name} archived.`
    )
  }

  const addColourway = async (product) => {
    const built = bodyFrom(newColourway, COLOURWAY_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', `/admin/products/${product.id}/colourways`, built.body),
      (res) => `Added ${res.colourway.name}. Its stock row starts at zero.`
    )
    if (ok) setNewColourway(NEW_COLOURWAY)
  }

  const saveColourway = (colourway) => {
    const diff = diffFields(colourway, colourwayDrafts[colourway.id] ?? {}, COLOURWAY_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    run(
      () => apiSend('PATCH', `/admin/colourways/${colourway.id}`, diff.patch),
      'Colourway saved.'
    )
  }

  const archiveColourway = (colourway) => {
    const archived = Boolean(colourway.archived_at)
    run(
      () => apiSend('POST', archiveTogglePath('/admin/colourways', colourway), {}),
      archived ? `${colourway.name} restored.` : `${colourway.name} archived.`
    )
  }

  const setDraft = (key) => (event) =>
    setProductDraft((d) => ({ ...d, [key]: event.target.value }))
  const setNew = (key) => (event) =>
    setNewProduct((p) => ({ ...p, [key]: event.target.value }))

  const newCollections = collectionsForBrand(newProduct.brand_id)
  const detailCollections = detail ? collectionsForBrand(detail.brand_id) : []

  return (
    <div>
      {/* One datalist for the screen. It is read from the products already
          fetched — no second request, the same rule the freight desk's zone
          box follows — so a size the office has used once is offered from then
          on, and typing a new one is how a new size comes to exist. */}
      <datalist id={SIZE_LIST_ID}>
        {sizesInUse(products).map((size) => (
          <option key={size} value={size} />
        ))}
      </datalist>
      <PageHeader
        eyebrow="Catalogue · live"
        title={<>Products &amp; colourways</>}
        subtitle="What the storefront sells. A product needs at least one colourway to be orderable; stock quantities are set on Manage stock."
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
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNewProduct((open) => !open)
                  setError('')
                }}
              >
                {showNewProduct ? 'Cancel' : 'New product'}
              </GhostButton>
            }
          />
          {showNewProduct && (
            <form onSubmit={createProduct} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }} className="r-grid-2">
                <Field label="House">
                  <select
                    value={newProduct.brand_id}
                    disabled={busy}
                    onChange={(e) => {
                      const brandId = e.target.value
                      const brand = brands.find((b) => String(b.id) === brandId)
                      setNewProduct((p) => ({
                        ...p,
                        brand_id: brandId,
                        // A collection belongs to one house — a stale pick 422s.
                        collection_id: '',
                        currency: brand?.currency ?? p.currency,
                      }))
                    }}
                    style={inputStyle}
                  >
                    <option value="">Choose a house…</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type" hint="Fixed once created — the stock unit (metres or units) comes from it.">
                  <select
                    value={newProduct.product_type}
                    disabled={busy}
                    onChange={setNew('product_type')}
                    style={inputStyle}
                  >
                    {PRODUCT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Collection">
                  <select
                    value={newProduct.collection_id}
                    disabled={busy || !newProduct.brand_id}
                    onChange={setNew('collection_id')}
                    style={inputStyle}
                  >
                    <option value="">No collection</option>
                    {newCollections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Name" hint="The web address is generated from it and is fixed afterwards.">
                  <input value={newProduct.name} disabled={busy} onChange={setNew('name')} style={inputStyle} />
                </Field>
                <Field label="Category" hint="What a shopper browses by. Leave it blank to decide later.">
                  <select
                    value={newProduct.category}
                    disabled={busy}
                    onChange={setNew('category')}
                    style={inputStyle}
                  >
                    <option value="">Not categorised</option>
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Currency">
                  <input
                    value={newProduct.currency}
                    maxLength={3}
                    disabled={busy}
                    onChange={setNew('currency')}
                    style={inputStyle}
                  />
                </Field>
                <Field
                  label="Range"
                  hint="Reporting label — the product line the old D365 reports grouped by."
                >
                  <input
                    value={newProduct.product_range}
                    disabled={busy}
                    onChange={setNew('product_range')}
                    style={inputStyle}
                    placeholder="e.g. PIERRE FREY"
                  />
                </Field>
                {SPEC_FIELDS.map((field) => (
                  <SpecInput
                    key={field.key}
                    field={field}
                    value={newProduct[field.key]}
                    disabled={busy}
                    onChange={setNew(field.key)}
                  />
                ))}
                {PRICE_FIELDS.map((field) => (
                  <Field label={field.label} key={field.key} hint="In dollars; blank for none.">
                    <input
                      value={newProduct[field.key]}
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={busy}
                      onChange={setNew(field.key)}
                      style={inputStyle}
                    />
                  </Field>
                ))}
                <Field label="Hi-res asset URL">
                  <input
                    value={newProduct.hi_res_asset_url}
                    disabled={busy}
                    onChange={setNew('hi_res_asset_url')}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <CheckField
                  label="Show on the website"
                  checked={newProduct.show_on_website}
                  disabled={busy}
                  onChange={(e) =>
                    setNewProduct((p) => ({ ...p, show_on_website: e.target.checked }))
                  }
                />
              </div>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Create product
                </GhostButton>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Products"
            right={
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <select
                  value={brandFilter}
                  disabled={busy}
                  onChange={(e) => {
                    setBrandFilter(e.target.value)
                    setOpenId(null)
                    setDetail(null)
                  }}
                  style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 'auto' }}
                  aria-label="Filter by house"
                >
                  <option value="">All houses</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  disabled={busy}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value)
                    setOpenId(null)
                    setDetail(null)
                  }}
                  style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 'auto' }}
                  aria-label="Filter by category"
                >
                  <option value="">All categories</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {/* Only the bands the loaded list actually has, so the dropdown
                    never offers a row that empties the list. */}
                <select
                  value={bandFilter}
                  disabled={busy}
                  onChange={(e) => {
                    setBandFilter(e.target.value)
                    setOpenId(null)
                    setDetail(null)
                  }}
                  style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 'auto' }}
                  aria-label="Filter by price band"
                >
                  <option value="">All prices</option>
                  {bandOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {products.length === crud.list.total
                    ? `${crud.list.total} shown`
                    : `${products.length} of ${crud.list.total} shown`}
                </span>
              </span>
            }
          />
          {!showNewProduct && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
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
                labels={['Product', 'House · collection', 'Type', 'Category', 'Size', 'Colourways', 'Website', '']}
              />
              {products.map((product) => {
                const open = openId === product.id
                return (
                  <div key={product.id}>
                    <Row columns={PRODUCT_COLUMNS} archived={Boolean(product.archived_at)}>
                      <button
                        type="button"
                        onClick={() => toggle(product)}
                        aria-expanded={open}
                        className="ab-t"
                        style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                          {product.name}
                          {product.archived_at && <ArchivedTag />}
                        </span>
                        <span style={{ display: 'block', ...monoText, fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {product.slug}
                        </span>
                      </button>
                      <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {product.brand_name}
                        {product.collection_name ? ` · ${product.collection_name}` : ''}
                      </span>
                      <span style={mutedText}>{typeLabel(product.product_type)}</span>
                      {/* An em dash, never a blank cell: uncategorised is a
                          statement about the row, and most of the catalogue is
                          still uncategorised. */}
                      <span style={mutedText}>{categoryLabel(product.category) || '—'}</span>
                      {/* Named for the same reason: two duvet covers differing
                          only in size read as one row repeated without it. An em
                          dash where there is none — a fabric has no size. */}
                      <span style={mutedText}>{product.size || '—'}</span>
                      <span style={monoText}>{product.colourway_count}</span>
                      <span style={{ ...mutedText, color: product.show_on_website ? c.sage : c.muted }}>
                        {product.show_on_website ? 'Live' : 'Hidden'}
                      </span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <GhostButton disabled={busy} onClick={() => toggle(product)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
                        {/* Archive is reversible and therefore neutral; only the
                            permanent verb is drawn in danger. */}
                        <GhostButton disabled={busy} onClick={() => archiveProduct(product)}>
                          {product.archived_at ? 'Restore' : 'Archive'}
                        </GhostButton>
                        <GhostButton
                          disabled={busy}
                          tone="danger"
                          onClick={() => crud.remove.ask(product)}
                        >
                          Delete
                        </GhostButton>
                      </span>
                    </Row>

                    {open && detailStatus === 'loading' && !detail && (
                      <PanelNote>Loading product…</PanelNote>
                    )}

                    {open && detail && detail.id === product.id && (
                      <div style={{ padding: '20px 20px 24px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                        {!isDirector && (
                          <p style={{ ...mutedText, margin: '0 0 16px', lineHeight: 1.6 }}>
                            {RECORD_LOCK_NOTE}
                          </p>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }} className="r-grid-2">
                          <Field label="Name">
                            <input
                              value={productDraft.name ?? ''}
                              readOnly={locked('name')}
                              disabled={busy || locked('name')}
                              onChange={setDraft('name')}
                              style={locked('name') ? readOnlyInput : inputStyle}
                            />
                          </Field>
                          <Field label="Web address" hint="Fixed once created.">
                            <input value={detail.slug ?? ''} readOnly disabled style={readOnlyInput} />
                          </Field>
                          <Field label="Type" hint="Fixed once created.">
                            <input value={typeLabel(detail.product_type)} readOnly disabled style={readOnlyInput} />
                          </Field>
                          <Field label="Category" hint="What a shopper browses by. Not the same thing as Type.">
                            <select
                              value={productDraft.category ?? ''}
                              disabled={busy}
                              onChange={setDraft('category')}
                              style={inputStyle}
                            >
                              <option value="">Not categorised</option>
                              {CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Collection">
                            <select
                              value={productDraft.collection_id ?? ''}
                              disabled={busy}
                              onChange={setDraft('collection_id')}
                              style={inputStyle}
                            >
                              <option value="">No collection</option>
                              {detailCollections.map((collection) => (
                                <option key={collection.id} value={collection.id}>
                                  {collection.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Currency">
                            <input
                              value={productDraft.currency ?? ''}
                              maxLength={3}
                              disabled={busy}
                              onChange={setDraft('currency')}
                              style={inputStyle}
                            />
                          </Field>
                          {/* Filled from the CRM one house at a time where the
                              reporting-codes backfill could not assign one.
                              Blank clears it back to "no range". */}
                          <Field
                            label="Range"
                            hint="Reporting label the reports' range filter matches on. Blank removes it."
                          >
                            <input
                              value={productDraft.product_range ?? ''}
                              readOnly={locked('product_range')}
                              disabled={busy || locked('product_range')}
                              onChange={setDraft('product_range')}
                              style={locked('product_range') ? readOnlyInput : inputStyle}
                              placeholder="e.g. PIERRE FREY"
                            />
                          </Field>
                          {SPEC_FIELDS.map((field) => (
                            <SpecInput
                              key={field.key}
                              field={field}
                              value={productDraft[field.key] ?? ''}
                              disabled={busy}
                              locked={locked(field.key)}
                              onChange={setDraft(field.key)}
                            />
                          ))}
                          {PRICE_FIELDS.map((field) => (
                            <Field label={field.label} key={field.key} hint="In dollars; blank for none.">
                              <input
                                value={productDraft[field.key] ?? ''}
                                inputMode="decimal"
                                placeholder="0.00"
                                readOnly={locked(field.key)}
                                disabled={busy || locked(field.key)}
                                onChange={setDraft(field.key)}
                                style={locked(field.key) ? readOnlyInput : inputStyle}
                              />
                            </Field>
                          ))}
                          {/* A note about a price move nobody can make would be
                              a box that cannot do anything: the prices above are
                              read-only without the director role, so diffFields
                              never names them and the API never asks. */}
                          {isDirector && (
                            <Field
                              label="Reason for the price change"
                              hint="Needed only when a price moves — recorded against the old and new figures in the history."
                            >
                              <input
                                value={reason}
                                placeholder='e.g. "supplier increase"'
                                disabled={busy}
                                onChange={(e) => setReason(e.target.value)}
                                style={inputStyle}
                              />
                            </Field>
                          )}
                          <Field label="Hi-res asset URL">
                            <input
                              value={productDraft.hi_res_asset_url ?? ''}
                              readOnly={locked('hi_res_asset_url')}
                              disabled={busy || locked('hi_res_asset_url')}
                              onChange={setDraft('hi_res_asset_url')}
                              style={locked('hi_res_asset_url') ? readOnlyInput : inputStyle}
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          <CheckField
                            label="Show on the website"
                            checked={productDraft.show_on_website}
                            disabled={busy}
                            onChange={(e) =>
                              setProductDraft((d) => ({ ...d, show_on_website: e.target.checked }))
                            }
                          />
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveProduct(detail)}>
                            Save product
                          </GhostButton>
                        </div>

                        <div style={{ marginTop: 26 }}>
                          <span style={sectionLabel}>Colourways</span>
                          <div style={{ ...panel, marginTop: 12 }}>
                            {(detail.colourways ?? []).length === 0 ? (
                              <PanelNote>
                                No colourways yet — a product needs at least one to be orderable.
                              </PanelNote>
                            ) : (
                              <>
                                <HeaderRow
                                  columns={COLOURWAY_COLUMNS}
                                  labels={['Name', 'SKU', 'Tones', 'Image URL', 'Stock', '']}
                                />
                                {(detail.colourways ?? []).map((colourway) => {
                                  const draft = colourwayDrafts[colourway.id] ?? {}
                                  const setCw = (key) => (event) =>
                                    setColourwayDrafts((all) => ({
                                      ...all,
                                      [colourway.id]: { ...all[colourway.id], [key]: event.target.value },
                                    }))
                                  return (
                                    <Row
                                      key={colourway.id}
                                      columns={COLOURWAY_COLUMNS}
                                      archived={Boolean(colourway.archived_at)}
                                      style={{ alignItems: 'start' }}
                                    >
                                      <span>
                                        <input
                                          value={draft.name ?? ''}
                                          disabled={busy}
                                          onChange={setCw('name')}
                                          style={cellInput}
                                          aria-label={`Name for ${colourway.sku}`}
                                        />
                                        {colourway.archived_at && <ArchivedTag />}
                                      </span>
                                      <input
                                        value={draft.sku ?? ''}
                                        disabled={busy}
                                        onChange={setCw('sku')}
                                        style={monoCellInput}
                                        aria-label={`SKU for ${colourway.name}`}
                                      />
                                      <span>
                                        <ToneChips tones={colourway.hex_tones} />
                                        <input
                                          value={draft.hex_tones ?? ''}
                                          placeholder="#AABBCC, #112233"
                                          disabled={busy}
                                          onChange={setCw('hex_tones')}
                                          style={monoCellInput}
                                          aria-label={`Tones for ${colourway.name}`}
                                        />
                                      </span>
                                      <input
                                        value={draft.image_url ?? ''}
                                        disabled={busy}
                                        onChange={setCw('image_url')}
                                        style={cellInput}
                                        aria-label={`Image URL for ${colourway.name}`}
                                      />
                                      <span style={{ ...monoText, fontSize: 11.5, paddingTop: 9 }}>
                                        {stockLabel(colourway.inventory)}
                                      </span>
                                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                        <GhostButton disabled={busy} onClick={() => saveColourway(colourway)}>
                                          Save
                                        </GhostButton>
                                        <GhostButton
                                          disabled={busy}
                                          tone={colourway.archived_at ? 'ink' : 'danger'}
                                          onClick={() => archiveColourway(colourway)}
                                        >
                                          {colourway.archived_at ? 'Restore' : 'Archive'}
                                        </GhostButton>
                                      </span>
                                    </Row>
                                  )
                                })}
                              </>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.1fr 1.2fr 150px', gap: 10, padding: '13px 20px', alignItems: 'center' }}>
                              <input
                                value={newColourway.name}
                                placeholder="Colourway name"
                                disabled={busy}
                                onChange={(e) => setNewColourway((n) => ({ ...n, name: e.target.value }))}
                                style={cellInput}
                              />
                              <input
                                value={newColourway.sku}
                                placeholder="SKU"
                                disabled={busy}
                                onChange={(e) => setNewColourway((n) => ({ ...n, sku: e.target.value }))}
                                style={monoCellInput}
                              />
                              <input
                                value={newColourway.hex_tones}
                                placeholder="#AABBCC, #112233"
                                disabled={busy}
                                onChange={(e) =>
                                  setNewColourway((n) => ({ ...n, hex_tones: e.target.value }))
                                }
                                style={monoCellInput}
                              />
                              <input
                                value={newColourway.image_url}
                                placeholder="Image URL"
                                disabled={busy}
                                onChange={(e) =>
                                  setNewColourway((n) => ({ ...n, image_url: e.target.value }))
                                }
                                style={cellInput}
                              />
                              <GhostButton disabled={busy} onClick={() => addColourway(detail)} style={{ justifySelf: 'end' }}>
                                Add colourway
                              </GhostButton>
                            </div>
                          </div>
                        </div>

                        <ProductPriceHistory product={detail} />
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={message} />
    </div>
  )
}

// --- price history --------------------------------------------------------

// Every recorded change to this product's prices, newest first: the day, both
// One spec input, so the create form and the open editor cannot drift into two
// spellings of the same box. `multiline` is the description's textarea and
// `list` is the size's datalist; everything else is the plain input this
// replaced, unchanged. `locked` is the read-only treatment for a login without
// the director role — and it drops the datalist with it, since offering
// suggestions into a box that cannot be typed in is noise.
function SpecInput({ field, value, disabled, locked, onChange }) {
  const style = locked ? readOnlyInput : inputStyle
  const shared = locked
    ? { value, readOnly: true, disabled: true, style }
    : { value, disabled, onChange, style }
  return (
    <Field label={field.label} style={field.multiline ? { gridColumn: '1 / -1' } : undefined}>
      {field.multiline ? (
        <textarea {...shared} rows={3} style={{ ...style, resize: 'vertical' }} />
      ) : (
        <input {...shared} list={locked ? undefined : field.list} />
      )}
    </Field>
  )
}

// figures, where it came from and the reason typed for it. No finance gate —
// retail and trade are SELL figures; the buy-side ledger (supplier rates) is
// the one behind finance visibility.
//
// Keyed on the PRODUCT OBJECT, not the id: every save calls loadDetail, the
// re-read detail is a fresh object, and refetching then is what keeps the
// panel showing the change that was just saved (the reload-not-reconcile
// rule).
function ProductPriceHistory({ product }) {
  const [history, setHistory] = useState({ status: 'loading', changes: [], note: '' })

  useEffect(() => {
    let active = true
    setHistory({ status: 'loading', changes: [], note: '' })
    apiFetch(productHistoryPath(product.id))
      .then((body) => {
        if (active) setHistory({ status: 'ready', changes: body.changes ?? [], note: '' })
      })
      .catch((err) => {
        if (!active) return
        setHistory({
          status: 'error',
          changes: [],
          note: messageOf(err, 'Could not load the price history.'),
        })
      })
    return () => {
      active = false
    }
  }, [product])

  // A moved figure is drawn as the change; the one that rode along unchanged
  // stays muted, so a row never reads as two edits.
  const priceCell = (move) => (
    <span style={{ ...monoText, color: move.moved ? c.ink : c.muted }}>{move.text}</span>
  )

  return (
    <div style={{ marginTop: 26 }}>
      <span style={sectionLabel}>Price history</span>
      <div style={{ ...panel, marginTop: 12 }}>
        {history.status === 'loading' && <PanelNote>Loading price history…</PanelNote>}
        {history.status === 'error' && <PanelNote tone="danger">{history.note}</PanelNote>}
        {history.status === 'ready' && history.changes.length === 0 && (
          <PanelNote>
            No recorded changes — the ledger starts the first time a price moves.
          </PanelNote>
        )}
        {history.status === 'ready' && history.changes.length > 0 && (
          <>
            <HeaderRow
              columns={HISTORY_COLUMNS}
              labels={['Changed', 'Retail', 'Trade', 'Source', 'Reason']}
            />
            {history.changes.map((change) => (
              <Row key={change.id} columns={HISTORY_COLUMNS}>
                <span style={{ ...monoText, fontSize: 11.5 }}>{dayOf(change.changed_at)}</span>
                {priceCell(
                  priceMoveText(change.old_retail_price_cents, change.new_retail_price_cents)
                )}
                {priceCell(
                  priceMoveText(change.old_trade_price_cents, change.new_trade_price_cents)
                )}
                <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sourceLabel(change)}
                </span>
                <span style={{ ...mutedText, minWidth: 0 }}>{change.reason ?? '—'}</span>
              </Row>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
