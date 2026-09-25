// One design on its own page. The client, 23 Sep 2026: "for any kind of data
// entry … they will open in their own individual page instead of a tabbed drop
// down." This is the block that used to open INSIDE the product's row on
// /admin/products — the product form, its colourways, its price history and the
// sticky Save bar under them, in that order — and the list is only the list now
// (AdminProducts). The same move the sales order and the supplier made.
//
//   GET    /admin/products/:id                  → { product } (+ colourways)
//   PATCH  /admin/products/:id                  → { product }
//   POST   /admin/products/:id/colourways       → { colourway } (+ stock row)
//   PATCH  /admin/colourways/:id                → { colourway }
//   POST   /admin/colourways/:id/archive|restore
//   GET    /admin/products/:id/price-history    → { changes }
//   GET/PUT /admin/products/:id/discount-tier   → { discount_tier }  finance only
//   GET    /admin/collections?brand_id=         → { collections }  the collection select
//   GET    /admin/products?brand_id=&limit=     → { products }     the size suggestions
//
// The single detail read feeds the whole page — the form, the colourways and
// (keyed on the object it returns) the price history — so every write here
// re-reads it and nothing is reconciled locally. In the row, a save reloaded
// the list as well, because a rename changed the row and a colourway changed
// its count; the list re-reads itself when staff go back to it now.
//
// Archive, restore and delete stay on the list: they are lifecycle verbs on a
// row, and a design that has just been deleted has no page to stay on.
//
// The API rules this page has to honour:
//   - `slug` and `product_type` are create-only. The slug is the storefront URL;
//     the type decides the stock unit (fabric → metres, finished good → units),
//     which the colourway's inventory row was created with. Both render read-only.
//   - SKUs are typed by staff, not generated. The CRM's Brand-Product-Colour
//     generator was never ported, so uniqueness is the database's job — a clash
//     comes back as a 409 and is shown inline.
//   - A colourway create is one transaction that also inserts a zero stock row,
//     so a duplicate SKU leaves no orphan. Quantities are edited on Manage stock.
//     Colourways keep their inline row editors: they are part of the design,
//     not records with pages of their own.
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
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { useCategories } from '../admin/useCategories.js'
import { useAuth, useCan } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'
import ProductDiscountTier from './ProductDiscountTier.jsx'
import ProductRangePricing from './ProductRangePricing.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { buildListQuery } from '../admin/list.js'
import { bodyFrom, diffFields, draftFrom, toNumber } from '../admin/drafts.js'
import { PRODUCT_PRICE_KEYS, withReason } from '../admin/priceChange.js'
import { dayOf, priceMoveText, productHistoryPath, sourceLabel } from '../admin/priceHistory.js'
import ProductFields, { SizeList } from './ProductFields.jsx'
import ImageField from '../admin/ImageField.jsx'
import {
  PRODUCTS_ROUTE,
  PRODUCT_FIELDS,
  archiveTogglePath,
  brandRoute,
  collectionListFilters,
  collectionRoute,
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
  useMutation,
  useToast,
} from '../admin/parts.jsx'

const COLOURWAY_FIELDS = Object.freeze([
  { key: 'name', label: 'Colourway name', kind: 'text', required: true },
  { key: 'sku', label: 'SKU', kind: 'text', required: true },
  { key: 'hex_tones', label: 'Tones', kind: 'tones' },
  { key: 'image_url', label: 'Image', kind: 'text' },
])

const NEW_COLOURWAY = Object.freeze({ name: '', sku: '', hex_tones: '', image_url: '' })

// The image column holds a thumbnail and its verbs, so it has a floor.
const COLOURWAY_COLUMNS = '1.1fr 1fr 1.1fr minmax(190px, 1.2fr) 1fr 150px'
// The price-history table: changed day, both prices (each row carries both —
// one figure alone cannot say whether the other moved with it), provenance,
// reason.
const HISTORY_COLUMNS = '90px 1.1fr 1.1fr 1.3fr 1.5fr'

// A stock line reads as one sentence, and says so plainly when a colourway has
// no inventory row at all (a short backorder can leave one absent).
function stockLabel(inventory) {
  if (!inventory) return 'No stock row'
  const available = toNumber(inventory.qty_available)
  const reserved = toNumber(inventory.qty_reserved)
  return `${available} ${inventory.unit} · ${reserved} reserved`
}

export default function AdminProduct() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [product, setProduct] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | missing | error
  const [loadError, setLoadError] = useState('')
  const [productDraft, setProductDraft] = useState({})
  // The change-reason note for this product's prices. Not part of the draft:
  // it is not a column and must never be diffed against the record.
  const [reason, setReason] = useState('')
  const [colourwayDrafts, setColourwayDrafts] = useState({}) // id -> draft
  const [newColourway, setNewColourway] = useState(NEW_COLOURWAY)
  const [collections, setCollections] = useState([])

  // The vocabulary, from the API rather than a frozen list: the office adds
  // categories on the Categories screen and must be able to file a design under
  // one the minute it exists.
  const { options: categoryOptions } = useCategories()

  const isDirector = canEditRecords(useAuth().user)
  // The discount-tier panel is cost data; the API refuses it without finance.
  const finance = useCan(CAPS.FINANCE_VIEW)
  // The list a SAVE works over. The draft below is still built from the full
  // declaration, so a locked box shows its value; this is what keeps the value
  // out of the patch.
  const editableProductFields = editableFields(PRODUCT_FIELDS, LOCKED_PRODUCT_KEYS, isDirector)
  const locked = (key) => isFieldLocked(key, LOCKED_PRODUCT_KEYS, isDirector)

  const load = useCallback(async () => {
    const body = await apiFetch(`/admin/products/${id}`)
    setProduct(body.product ?? null)
    return body.product ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    setReason('')
    setNewColourway(NEW_COLOURWAY)
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this product.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Re-seed both drafts from server truth whenever the record reloads, so a
  // saved name is not immediately overwritten by a stale draft.
  useEffect(() => {
    if (!product) return
    setProductDraft(draftFrom(product, PRODUCT_FIELDS))
    setColourwayDrafts(
      (product.colourways ?? []).reduce(
        (acc, colourway) => ({ ...acc, [colourway.id]: draftFrom(colourway, COLOURWAY_FIELDS) }),
        {}
      )
    )
  }, [product])

  // The collection select offers the design's own house's collections — a
  // collection belongs to one house, and a pick from another 422s. The house is
  // fixed, so this reads once per design.
  const brandId = product?.brand_id ?? null
  useEffect(() => {
    if (brandId == null) return undefined
    let active = true
    apiFetch(`/admin/collections?${buildListQuery(collectionListFilters(brandId))}`)
      .then((body) => {
        if (active) setCollections(body.collections ?? [])
      })
      .catch(() => {
        /* the select just offers "No collection"; the product itself still saves */
      })
    return () => {
      active = false
    }
  }, [brandId])

  const backLink = (
    <>
      <Link to={PRODUCTS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to products
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Product not found"
        backTo={PRODUCTS_ROUTE}
        backLabel="Back to products"
        message="That product could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Product" />
        <PanelNote>Loading product…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Product" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!product) return null

  const set = (key, value) => setProductDraft((d) => ({ ...d, [key]: value }))

  const saveProduct = async () => {
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
    return undefined
  }

  const addColourway = async () => {
    const built = bodyFrom(newColourway, COLOURWAY_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', `/admin/products/${product.id}/colourways`, built.body),
      (res) => `Added ${res.colourway.name}. Its stock row starts at zero.`
    )
    if (ok) setNewColourway(NEW_COLOURWAY)
    return undefined
  }

  const saveColourway = (colourway) => {
    const diff = diffFields(colourway, colourwayDrafts[colourway.id] ?? {}, COLOURWAY_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(
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

  const colourways = product.colourways ?? []

  return (
    <div>
      {/* One datalist for the page, above everything that reads it. */}
      <SizeList brandId={product.brand_id} />
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {product.name}
            {product.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={
          // The house and the collection are pages of their own too, one
          // press away.
          <>
            <Link to={brandRoute(product.brand_id)} className="ab-link" style={{ color: 'inherit' }}>
              {product.brand_name}
            </Link>
            {product.collection_id != null && (
              <>
                {' · '}
                <Link to={collectionRoute(product.collection_id)} className="ab-link" style={{ color: 'inherit' }}>
                  {product.collection_name}
                </Link>
              </>
            )}
          </>
        }
        right={<span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{product.slug}</span>}
      />

      {/* The same stack the row expansion held, in the same order — the form,
          the colourways, the price history, then the sticky Save bar. */}
      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead label="Product" />
          <div style={{ padding: '20px 20px 24px' }}>
            {!isDirector && (
              <p style={{ ...mutedText, margin: '0 0 16px', lineHeight: 1.6 }}>{RECORD_LOCK_NOTE}</p>
            )}
            <ProductFields
              record={product}
              values={productDraft}
              set={set}
              disabled={busy}
              locked={locked}
              collections={collections}
              categoryOptions={categoryOptions}
              reasonField={
                // A note about a price move nobody can make would be a box that
                // cannot do anything: the prices are read-only without the
                // director role, so diffFields never names them and the API
                // never asks.
                isDirector && (
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
                )
              }
            />
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Colourways" />
          {colourways.length === 0 ? (
            <PanelNote>No colourways yet — a product needs at least one to be orderable.</PanelNote>
          ) : (
            <>
              <HeaderRow columns={COLOURWAY_COLUMNS} labels={['Name', 'SKU', 'Tones', 'Image', 'Stock', '']} />
              {colourways.map((colourway) => {
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
                    <ImageField
                      compact
                      field="colourways.image_url"
                      label={`image for ${colourway.name}`}
                      value={draft.image_url ?? ''}
                      savedValue={colourway.image_url}
                      disabled={busy}
                      onChange={(url) =>
                        setColourwayDrafts((all) => ({
                          ...all,
                          [colourway.id]: { ...all[colourway.id], image_url: url },
                        }))
                      }
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
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.1fr minmax(190px, 1.2fr) 150px', gap: 10, padding: '13px 20px', alignItems: 'center' }}>
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
              onChange={(e) => setNewColourway((n) => ({ ...n, hex_tones: e.target.value }))}
              style={monoCellInput}
            />
            <ImageField
              compact
              field="colourways.image_url"
              label="image for the new colourway"
              value={newColourway.image_url}
              disabled={busy}
              onChange={(url) => setNewColourway((n) => ({ ...n, image_url: url }))}
            />
            <GhostButton disabled={busy} onClick={addColourway} style={{ justifySelf: 'end' }}>
              Add colourway
            </GhostButton>
          </div>
        </section>

        <ProductPriceHistory product={product} />

        {finance && <ProductDiscountTier product={product} flash={flash} />}

        {/* The Dynamics product price rows behind this design, priced through
            the house — the calculation on the product (25 Sep 2026). */}
        {finance && <ProductRangePricing product={product} onApplied={load} flash={flash} />}
      </div>

      {/* Sticky to the foot of the window while anything on the page is in
          view, so Save — and the one error line every write on this page
          reports into, colourways included — is never scrolled away. Cancel
          leaves without writing, as the row's Close did. */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 3,
          marginTop: 16,
          padding: '12px 0',
          background: c.paper,
          borderTop: `1px solid ${c.line}`,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <CheckField
          label="Show on the website"
          checked={productDraft.show_on_website}
          disabled={busy}
          onChange={(e) => set('show_on_website', e.target.checked)}
        />
        <GhostButton tone="accent" disabled={busy} onClick={saveProduct}>
          Save product
        </GhostButton>
        <Link to={PRODUCTS_ROUTE} style={{ textDecoration: 'none' }}>
          <GhostButton>Cancel</GhostButton>
        </Link>
        <ErrorLine style={{ flexBasis: '100%' }}>{error}</ErrorLine>
      </div>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// Every recorded change to this product's prices, newest first: the day, both
// figures, where it came from and the reason typed for it. No finance gate —
// retail and trade are SELL figures; the buy-side ledger (supplier rates) is
// the one behind finance visibility.
//
// Keyed on the PRODUCT OBJECT, not the id: every save re-reads the detail, the
// re-read product is a fresh object, and refetching then is what keeps the
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
    <span style={{ ...monoText, color: move.moved ? c.ink : c.muted, textAlign: 'right' }}>{move.text}</span>
  )

  return (
    <section style={panel}>
      <PanelHead label="Price history" />
      {history.status === 'loading' && <PanelNote>Loading price history…</PanelNote>}
      {history.status === 'error' && <PanelNote tone="danger">{history.note}</PanelNote>}
      {history.status === 'ready' && history.changes.length === 0 && (
        <PanelNote>No recorded changes — the ledger starts the first time a price moves.</PanelNote>
      )}
      {history.status === 'ready' && history.changes.length > 0 && (
        <>
          <HeaderRow
            columns={HISTORY_COLUMNS}
            labels={['Changed', 'Retail', 'Trade', 'Source', 'Reason']}
            numeric={[1, 2]}
          />
          {history.changes.map((change) => (
            <Row key={change.id} columns={HISTORY_COLUMNS}>
              <span style={{ ...monoText, fontSize: 11.5 }}>{dayOf(change.changed_at)}</span>
              {priceCell(priceMoveText(change.old_retail_price_cents, change.new_retail_price_cents))}
              {priceCell(priceMoveText(change.old_trade_price_cents, change.new_trade_price_cents))}
              <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sourceLabel(change)}
              </span>
              <span style={{ ...mutedText, minWidth: 0 }}>{change.reason ?? '—'}</span>
            </Row>
          ))}
        </>
      )}
    </section>
  )
}
