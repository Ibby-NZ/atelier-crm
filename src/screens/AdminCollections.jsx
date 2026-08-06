// Collections — live catalogue rows, wired to atelier-api's /admin/collections.
// They used to live inside the expanded house row on AdminBrands, which meant a
// collection could only be found by first knowing which house it belonged to,
// and only edited two at a time inside another screen's editor. This is that
// panel, given its own screen.
//
//   GET    /admin/collections?brand_id=&include_archived= → { collections }
//   GET    /admin/collections/:id                         → { collection } (+ product_count)
//   POST   /admin/collections                             → { collection }
//   PATCH  /admin/collections/:id                         → { collection }
//   POST   /admin/collections/:id/archive|restore
//   DELETE /admin/collections/:id                         → { deleted } | 409 { blockers }
//
// Three API rules the screen has to honour:
//   - **A collection slug is unique per HOUSE, never globally**
//     (`collections_brand_id_slug_unique`). So is the display name in practice:
//     the seed strips the house prefix off the vendored titles, so a
//     catalogue-wide list really does show several "Cappuccino"s. Every row is
//     therefore keyed and addressed by `id`, the house is the first column, and
//     anything that names a row to a person goes through `describeCollection`,
//     which names the house with it.
//   - **The house is create-only.** PATCH takes name/description/image_url and
//     nothing else — moving a collection between houses would strand its
//     products, whose own `brand_id` is a direct FK. It renders read-only.
//   - **Archive is the reversible removal; DELETE is permanent** and is refused
//     while any product still points at the collection. That FK is SET NULL, so
//     an unprobed delete would report success while silently uncollecting every
//     one of them — which is why the refusal keeps the dialog open and offers
//     Archive instead, and why useCrudScreen is handed an archive action here.

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  CATALOGUE_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  collectionListFilters,
  describeCollection,
} from './adminCatalogue.js'
import {
  ArchivedTag,
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
  readOnlyInput,
  useMutation,
} from '../admin/parts.jsx'

// The storefront tile editorial, moved here with the panel it belonged to. The
// image is a public <img src>, so the `url` kind's http(s)-only rule applies
// exactly as it does to the brand website.
const COLLECTION_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'image_url', label: 'Image', kind: 'url' },
])

// The house is set once and never patched — see the header note.
const CREATE_ONLY_FIELDS = Object.freeze([
  { key: 'brand_id', label: 'House', kind: 'ref', required: true },
])

const NEW_COLLECTION = Object.freeze({ brand_id: '', name: '', description: '', image_url: '' })

// The last column carries Edit / Archive / Delete.
const COLLECTION_COLUMNS = '1fr 1.4fr 1fr 215px'

export default function AdminCollections() {
  // The house filter lives in the URL, not in state: AdminBrands links each of
  // its rows through to `?brand_id=<id>`, and a filter held in state would
  // ignore that link once this screen was already mounted.
  const [searchParams, setSearchParams] = useSearchParams()
  const brandFilter = searchParams.get('brand_id') ?? ''
  const [showArchived, setShowArchived] = useState(false)
  const [brands, setBrands] = useState([])
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailStatus, setDetailStatus] = useState('idle') // idle | loading | ready
  const [draft, setDraft] = useState({})
  const [newCollection, setNewCollection] = useState(NEW_COLLECTION)
  const [showNew, setShowNew] = useState(false)

  // The list, the toast and the whole delete flow in one. `archive` is what puts
  // "Archive instead" on a refusal — useCrudScreen offers it only when the API
  // says the entity is archivable AND the screen supplied the action.
  const crud = useCrudScreen({
    path: '/admin/collections',
    key: 'collections',
    limit: CATALOGUE_LIST_LIMIT,
    filters: collectionListFilters(brandFilter, showArchived),
    entity: 'collection',
    describe: describeCollection,
    archive: (collection) =>
      apiSend('POST', archiveInsteadPath('/admin/collections', collection), {}),
  })
  const collections = crud.list.rows
  const { message, flash } = crud.toast

  const setBrandFilter = (value) =>
    setSearchParams(value ? { brand_id: value } : {}, { replace: true })

  // The by-id read is where `product_count` comes from — the list does not carry
  // it, and it is the only advance warning that Delete will be refused.
  const loadDetail = useCallback(async (collectionId) => {
    const body = await apiFetch(`/admin/collections/${collectionId}`)
    const collection = body.collection ?? null
    setDetail(collection)
    if (collection) setDraft(draftFrom(collection, COLLECTION_FIELDS))
    return collection
  }, [])

  // One reload covers both: a rename changes the row, and the open editor is
  // re-read so a server-side change lands in the draft.
  const reload = useCallback(async () => {
    await crud.list.reload()
    if (openId != null) await loadDetail(openId)
  }, [crud.list.reload, openId, loadDetail])

  const { busy, error, setError, run } = useMutation({ reload, flash })

  // Houses back the filter and the create form; they change far less often than
  // collections, so they load once.
  useEffect(() => {
    let active = true
    apiFetch('/admin/brands')
      .then((body) => active && setBrands(body.brands ?? []))
      .catch(() => {
        /* the list below reports the failure; the selects just stay empty */
      })
    return () => {
      active = false
    }
  }, [])

  // The open editor follows the list. A collection that has just been deleted —
  // or archived out of view — is no longer a row to expand, and a stale `openId`
  // would make the next mutation's reload re-read a row that is gone.
  useEffect(() => {
    if (openId == null || crud.list.status !== 'ready') return
    if (collections.some((collection) => collection.id === openId)) return
    setOpenId(null)
    setDetail(null)
  }, [openId, collections, crud.list.status])

  const toggle = async (collection) => {
    setError('')
    if (openId === collection.id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(collection.id)
    setDetail(null)
    setDetailStatus('loading')
    try {
      await loadDetail(collection.id)
    } catch (err) {
      setError(messageOf(err, 'Could not load this collection.'))
    } finally {
      setDetailStatus('ready')
    }
  }

  const createCollection = async (event) => {
    event.preventDefault()
    const house = bodyFrom(newCollection, CREATE_ONLY_FIELDS)
    if (house.error) return setError(house.error)
    const rest = bodyFrom(newCollection, COLLECTION_FIELDS)
    if (rest.error) return setError(rest.error)
    const ok = await run(
      () => apiSend('POST', '/admin/collections', { ...rest.body, ...house.body }),
      (res) => `${describeCollection(res.collection)} created — slug ${res.collection.slug}.`
    )
    if (ok) {
      setNewCollection(NEW_COLLECTION)
      setShowNew(false)
    }
  }

  const saveCollection = (collection) => {
    const diff = diffFields(collection, draft, COLLECTION_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    run(() => apiSend('PATCH', `/admin/collections/${collection.id}`, diff.patch), 'Collection saved.')
  }

  // Archiving is reversible, so it asks once and offers Restore afterwards
  // rather than warning about permanence it does not have.
  const archiveCollection = (collection) => {
    const archived = Boolean(collection.archived_at)
    run(
      () => apiSend('POST', archiveTogglePath('/admin/collections', collection), {}),
      archived
        ? `${describeCollection(collection)} restored.`
        : `${describeCollection(collection)} archived.`
    )
  }

  const setNew = (key) => (event) =>
    setNewCollection((next) => ({ ...next, [key]: event.target.value }))
  const setDraftKey = (key) => (event) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }))

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue · live"
        title="Collections"
        subtitle="How a house groups its designs on the storefront. A product may sit in one collection or none, and a collection belongs to exactly one house."
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
      <SectionTabs tabs={catalogueTabs} active="collections" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30, maxWidth: 1080 }}>
        <section style={panel}>
          <PanelHead
            label="Add a collection"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  // Pre-pick whichever house is being filtered on — the common
                  // path here is arriving from that house's row on Houses.
                  setNewCollection((next) =>
                    showNew ? next : { ...NEW_COLLECTION, brand_id: brandFilter }
                  )
                  setShowNew((open) => !open)
                  setError('')
                }}
              >
                {showNew ? 'Cancel' : 'New collection'}
              </GhostButton>
            }
          />
          {showNew && (
            <form onSubmit={createCollection} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="r-grid-2">
                <Field label="House" hint="Fixed once created — a collection belongs to one house.">
                  <select
                    value={newCollection.brand_id}
                    disabled={busy}
                    onChange={setNew('brand_id')}
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
                <Field
                  label="Name"
                  hint="The web address is generated from it and is fixed afterwards. It only has to be unique within this house."
                >
                  <input
                    value={newCollection.name}
                    disabled={busy}
                    onChange={setNew('name')}
                    style={inputStyle}
                    placeholder="e.g. Cappuccino"
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="r-grid-2">
                <Field label="Description" hint="Shown on the storefront brand page's collection tile.">
                  <input
                    value={newCollection.description}
                    disabled={busy}
                    onChange={setNew('description')}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Image" hint="Tile image, https:// only.">
                  <input
                    value={newCollection.image_url}
                    disabled={busy}
                    onChange={setNew('image_url')}
                    style={inputStyle}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Create collection
                </GhostButton>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Collections"
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
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {crud.list.total} shown
                </span>
              </span>
            }
          />
          {!showNew && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
          {crud.list.status === 'loading' && <PanelNote>Loading collections…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && collections.length === 0 && (
            <PanelNote>No collections match this filter.</PanelNote>
          )}

          {crud.list.status === 'ready' && collections.length > 0 && (
            <>
              <HeaderRow
                columns={COLLECTION_COLUMNS}
                labels={['House', 'Collection', 'Web address', '']}
              />
              {/* Keyed by id, never by slug: two houses may hold the same slug. */}
              {collections.map((collection) => {
                const open = openId === collection.id
                return (
                  <div key={collection.id}>
                    <Row columns={COLLECTION_COLUMNS} archived={Boolean(collection.archived_at)}>
                      <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {collection.brand_name}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggle(collection)}
                        aria-expanded={open}
                        className="ab-t"
                        style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                          {collection.name}
                          {collection.archived_at && <ArchivedTag />}
                        </span>
                      </button>
                      <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {collection.slug}
                      </span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <GhostButton disabled={busy} onClick={() => toggle(collection)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
                        {/* Archive is reversible and therefore neutral; only the
                            permanent verb is drawn in danger. */}
                        <GhostButton disabled={busy} onClick={() => archiveCollection(collection)}>
                          {collection.archived_at ? 'Restore' : 'Archive'}
                        </GhostButton>
                        <GhostButton
                          disabled={busy}
                          tone="danger"
                          onClick={() => crud.remove.ask(collection)}
                        >
                          Delete
                        </GhostButton>
                      </span>
                    </Row>

                    {open && detailStatus === 'loading' && !detail && (
                      <PanelNote>Loading collection…</PanelNote>
                    )}

                    {open && detail && detail.id === collection.id && (
                      <div style={{ padding: '20px 20px 24px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="r-grid-2">
                          <Field label="Name">
                            <input
                              value={draft.name ?? ''}
                              disabled={busy}
                              onChange={setDraftKey('name')}
                              style={inputStyle}
                            />
                          </Field>
                          <Field
                            label="Web address"
                            hint="Fixed once created, and unique within this house rather than across the catalogue."
                          >
                            <input value={detail.slug ?? ''} readOnly disabled style={readOnlyInput} />
                          </Field>
                          <Field label="House" hint="Fixed once created.">
                            <input
                              value={detail.brand_name ?? ''}
                              readOnly
                              disabled
                              style={readOnlyInput}
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="r-grid-2">
                          <Field label="Description" hint="Shown on the storefront brand page's collection tile.">
                            <input
                              value={draft.description ?? ''}
                              disabled={busy}
                              onChange={setDraftKey('description')}
                              style={inputStyle}
                              placeholder="Tile description"
                            />
                          </Field>
                          <Field label="Image" hint="Tile image, https:// only.">
                            <input
                              value={draft.image_url ?? ''}
                              disabled={busy}
                              onChange={setDraftKey('image_url')}
                              style={inputStyle}
                              placeholder="https://…"
                            />
                          </Field>
                        </div>
                        {/* The count the delete probe will use — archived products
                            included, because products.collection_id is SET NULL
                            and a delete would otherwise uncollect them silently. */}
                        <div style={{ marginTop: 16, ...mutedText }}>
                          {detail.product_count === 0
                            ? 'No products in this collection — it can be deleted outright.'
                            : `${detail.product_count} product${detail.product_count === 1 ? '' : 's'} in this collection (archived ones included). Delete is refused until they are moved out; Archive takes the grouping off the storefront and leaves them selling.`}
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <GhostButton
                            tone="accent"
                            disabled={busy}
                            onClick={() => saveCollection(detail)}
                          >
                            Save collection
                          </GhostButton>
                        </div>
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
