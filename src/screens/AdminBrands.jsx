// Houses & collections — live catalogue rows, wired to atelier-api's
// /admin/brands and /admin/collections. Unlike the Dynamics screens (Price
// Lists, Reserves, Clients) these are the platform's own tables, so this screen
// writes as well as reads.
//
//   GET   /admin/brands?include_archived=      → { brands }
//   POST  /admin/brands                        → { brand }
//   PATCH /admin/brands/:id                    → { brand }
//   POST  /admin/brands/:id/archive|restore    → { brand }
//   GET   /admin/collections?brand_id=&include_archived= → { collections }
//   POST  /admin/collections                   → { collection }
//   PATCH /admin/collections/:id               → { collection }  (name only)
//   POST  /admin/collections/:id/archive|restore
//
// Two rules the form has to respect, both enforced by the API:
//   - The slug is generated on create and IMMUTABLE. It is the storefront URL
//     and the EmDash brand-page match key, so it is shown read-only; a rename
//     changes the display name and leaves every link intact.
//   - Removal is archive, never DELETE. Products and order lines reference these
//     rows; archiving drops a house out of the public catalogue and the default
//     admin list while the commerce history it backs stays readable.
//
// requireRole('backoffice') on the API is the real gate — every CRM login is
// staff (see AuthContext's STAFF_ROLE_MAP), so there is no extra capability here.

import { useCallback, useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
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
  readOnlyInput,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'

// One declaration per column, read by both draftFrom and diffFields so the form
// cannot format a value one way and parse it another.
const BRAND_FIELDS = Object.freeze([
  { key: 'name', label: 'House name', kind: 'text', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper', required: true },
  { key: 'country', label: 'Country', kind: 'text' },
  { key: 'story', label: 'Story', kind: 'text' },
  { key: 'website_url', label: 'Website', kind: 'url' },
  { key: 'is_international', label: 'International house', kind: 'bool' },
])

const NEW_BRAND = Object.freeze({
  name: '',
  currency: 'NZD',
  country: '',
  story: '',
  website_url: '',
  is_international: true,
})

// A collection row is name + the storefront tile editorial (description, hero
// image). The image is a public <img src>, so the `url` kind's http(s)-only
// rule applies here exactly as it does to the brand website.
const COLLECTION_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'image_url', label: 'Image', kind: 'url' },
])

const BRAND_COLUMNS = '1.6fr 90px 1fr 110px 150px'
const COLLECTION_COLUMNS = '1fr 1fr 150px'

export default function AdminBrands() {
  const [brands, setBrands] = useState([])
  const [collections, setCollections] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [brandDraft, setBrandDraft] = useState({})
  const [collectionDrafts, setCollectionDrafts] = useState({}) // id -> COLLECTION_FIELDS draft
  const [newBrand, setNewBrand] = useState(NEW_BRAND)
  const [newCollection, setNewCollection] = useState('')
  const [showNewBrand, setShowNewBrand] = useState(false)
  const { message, flash } = useToast()

  const load = useCallback(async () => {
    const query = showArchived ? '?include_archived=true' : ''
    const [brandBody, collectionBody] = await Promise.all([
      apiFetch(`/admin/brands${query}`),
      apiFetch(`/admin/collections${query}`),
    ])
    setBrands(brandBody.brands ?? [])
    setCollections(collectionBody.collections ?? [])
  }, [showArchived])

  // Reloading after every mutation is deliberate: the API generates the slug and
  // the collection list, so local reconciliation would drift from server truth.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => active && setStatus('ready'))
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load houses.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Keep the open editor's drafts in step with a reloaded row, so a saved name
  // is not immediately overwritten by a stale draft on the next keystroke.
  useEffect(() => {
    if (openId == null) return
    const brand = brands.find((b) => b.id === openId)
    if (!brand) {
      setOpenId(null)
      return
    }
    setBrandDraft(draftFrom(brand, BRAND_FIELDS))
    setCollectionDrafts(
      collections
        .filter((collection) => collection.brand_id === openId)
        .reduce(
          (acc, collection) => ({
            ...acc,
            [collection.id]: draftFrom(collection, COLLECTION_FIELDS),
          }),
          {}
        )
    )
  }, [openId, brands, collections])

  const toggle = (brand) => {
    setError('')
    setNewCollection('')
    setOpenId((current) => (current === brand.id ? null : brand.id))
  }

  const createBrand = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newBrand, BRAND_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', '/admin/brands', built.body),
      (res) => `${res.brand.name} created — slug ${res.brand.slug}.`
    )
    if (ok) {
      setNewBrand(NEW_BRAND)
      setShowNewBrand(false)
    }
  }

  const saveBrand = (brand) => {
    const diff = diffFields(brand, brandDraft, BRAND_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    run(() => apiSend('PATCH', `/admin/brands/${brand.id}`, diff.patch), 'House saved.')
  }

  // Archiving is reversible, so it asks once and offers Restore afterwards
  // rather than warning about permanence it does not have.
  const archiveBrand = (brand) => {
    const archived = Boolean(brand.archived_at)
    if (
      !archived &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Archive ${brand.name}? It drops off the website and out of this list, and you can restore it later.`
      )
    ) {
      return
    }
    run(
      () => apiSend('POST', `/admin/brands/${brand.id}/${archived ? 'restore' : 'archive'}`, {}),
      archived ? `${brand.name} restored.` : `${brand.name} archived.`
    )
  }

  const addCollection = (brand) => {
    const name = newCollection.trim()
    if (!name) return setError('Give the collection a name.')
    run(
      () => apiSend('POST', '/admin/collections', { brand_id: brand.id, name }),
      `Added ${name}.`
    ).then((ok) => ok && setNewCollection(''))
  }

  const saveCollection = (collection) => {
    const diff = diffFields(collection, collectionDrafts[collection.id] ?? {}, COLLECTION_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    run(
      () => apiSend('PATCH', `/admin/collections/${collection.id}`, diff.patch),
      'Collection saved.'
    )
  }

  const setCollectionDraft = (id, key, value) =>
    setCollectionDrafts((drafts) => ({
      ...drafts,
      [id]: { ...drafts[id], [key]: value },
    }))

  const archiveCollection = (collection) => {
    const archived = Boolean(collection.archived_at)
    run(
      () =>
        apiSend(
          'POST',
          `/admin/collections/${collection.id}/${archived ? 'restore' : 'archive'}`,
          {}
        ),
      archived ? `${collection.name} restored.` : `${collection.name} archived.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue · live"
        title={<>Houses &amp; collections</>}
        subtitle="The platform's own brand records — what the storefront reads. Web addresses are generated once and never change."
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
      <SectionTabs tabs={catalogueTabs} active="brands" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30, maxWidth: 1080 }}>
        <section style={panel}>
          <PanelHead
            label="Add a house"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNewBrand((open) => !open)
                  setError('')
                }}
              >
                {showNewBrand ? 'Cancel' : 'New house'}
              </GhostButton>
            }
          />
          {showNewBrand && (
            <form onSubmit={createBrand} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="r-grid-2">
                <Field label="House name" hint="The web address is generated from it and is fixed afterwards.">
                  <input
                    value={newBrand.name}
                    onChange={(e) => setNewBrand((b) => ({ ...b, name: e.target.value }))}
                    style={inputStyle}
                    placeholder="e.g. Pierre Frey"
                  />
                </Field>
                <Field label="Currency">
                  <input
                    value={newBrand.currency}
                    maxLength={3}
                    onChange={(e) => setNewBrand((b) => ({ ...b, currency: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Country">
                  <input
                    value={newBrand.country}
                    onChange={(e) => setNewBrand((b) => ({ ...b, country: e.target.value }))}
                    style={inputStyle}
                    placeholder="e.g. France"
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label="Story" hint="Shown on the house's storefront page.">
                  <textarea
                    value={newBrand.story}
                    onChange={(e) => setNewBrand((b) => ({ ...b, story: e.target.value }))}
                    rows={3}
                    style={{ ...inputStyle, height: 'auto', padding: 12, lineHeight: 1.6, resize: 'vertical' }}
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field
                  label="Website"
                  hint="The house's own site — the storefront brand page links out to it."
                >
                  <input
                    value={newBrand.website_url}
                    onChange={(e) =>
                      setNewBrand((b) => ({ ...b, website_url: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="https://www.pierrefrey.com"
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <CheckField
                  label="International house — retail prices stay hidden from shoppers"
                  checked={newBrand.is_international}
                  disabled={busy}
                  onChange={(e) =>
                    setNewBrand((b) => ({ ...b, is_international: e.target.checked }))
                  }
                />
              </div>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Create house
                </GhostButton>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Houses"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {brands.length} shown
              </span>
            }
          />
          {!showNewBrand && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
          {status === 'loading' && <PanelNote>Loading houses…</PanelNote>}
          {status === 'error' && <PanelNote tone="danger">{loadError}</PanelNote>}

          {status === 'ready' && brands.length === 0 && (
            <PanelNote>No houses yet.</PanelNote>
          )}

          {status === 'ready' && brands.length > 0 && (
            <>
              <HeaderRow
                columns={BRAND_COLUMNS}
                labels={['House', 'Currency', 'Web address', 'Pricing', '']}
              />
              {brands.map((brand) => {
                const open = openId === brand.id
                const brandCollections = collections.filter((x) => x.brand_id === brand.id)
                return (
                  <div key={brand.id}>
                    <Row columns={BRAND_COLUMNS} archived={Boolean(brand.archived_at)}>
                      <button
                        type="button"
                        onClick={() => toggle(brand)}
                        aria-expanded={open}
                        className="ab-t"
                        style={{
                          background: 'none',
                          border: 0,
                          padding: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          minWidth: 0,
                        }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                          {brand.name}
                          {brand.archived_at && <ArchivedTag />}
                        </span>
                        <span style={{ display: 'block', ...mutedText, fontSize: 11.5, marginTop: 2 }}>
                          {brandCollections.length} collection
                          {brandCollections.length === 1 ? '' : 's'}
                          {brand.country ? ` · ${brand.country}` : ''}
                        </span>
                      </button>
                      <span style={monoText}>{brand.currency}</span>
                      <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {brand.slug}
                      </span>
                      <span style={mutedText}>
                        {brand.is_international ? 'Price hidden' : 'Price shown'}
                      </span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <GhostButton disabled={busy} onClick={() => toggle(brand)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
                        <GhostButton
                          disabled={busy}
                          tone={brand.archived_at ? 'ink' : 'danger'}
                          onClick={() => archiveBrand(brand)}
                        >
                          {brand.archived_at ? 'Restore' : 'Archive'}
                        </GhostButton>
                      </span>
                    </Row>

                    {open && (
                      <div style={{ padding: '20px 20px 24px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="r-grid-2">
                          <Field label="House name">
                            <input
                              value={brandDraft.name ?? ''}
                              disabled={busy}
                              onChange={(e) => setBrandDraft((d) => ({ ...d, name: e.target.value }))}
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Currency">
                            <input
                              value={brandDraft.currency ?? ''}
                              maxLength={3}
                              disabled={busy}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, currency: e.target.value }))
                              }
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Web address" hint="Fixed once created — storefront links depend on it.">
                            <input value={brand.slug} readOnly disabled style={readOnlyInput} />
                          </Field>
                          <Field label="Country">
                            <input
                              value={brandDraft.country ?? ''}
                              disabled={busy}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, country: e.target.value }))
                              }
                              style={inputStyle}
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <Field label="Story">
                            <textarea
                              value={brandDraft.story ?? ''}
                              rows={3}
                              disabled={busy}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, story: e.target.value }))
                              }
                              style={{ ...inputStyle, height: 'auto', padding: 12, lineHeight: 1.6, resize: 'vertical' }}
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <Field
                            label="Website"
                            hint="The house's own site — blank removes the storefront link."
                          >
                            <input
                              value={brandDraft.website_url ?? ''}
                              disabled={busy}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, website_url: e.target.value }))
                              }
                              style={inputStyle}
                              placeholder="https://www.pierrefrey.com"
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          <CheckField
                            label="International house — retail prices stay hidden from shoppers"
                            checked={brandDraft.is_international}
                            disabled={busy}
                            onChange={(e) =>
                              setBrandDraft((d) => ({ ...d, is_international: e.target.checked }))
                            }
                          />
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveBrand(brand)}>
                            Save house
                          </GhostButton>
                        </div>

                        <div style={{ marginTop: 26 }}>
                          <span style={sectionLabel}>Collections</span>
                          <div style={{ ...panel, marginTop: 12, background: c.paper }}>
                            {brandCollections.length === 0 ? (
                              <PanelNote>No collections for this house yet.</PanelNote>
                            ) : (
                              <>
                                <HeaderRow
                                  columns={COLLECTION_COLUMNS}
                                  labels={['Name', 'Web address', '']}
                                />
                                {brandCollections.map((collection) => (
                                  <div key={collection.id}>
                                    <Row
                                      columns={COLLECTION_COLUMNS}
                                      archived={Boolean(collection.archived_at)}
                                    >
                                      <input
                                        value={collectionDrafts[collection.id]?.name ?? ''}
                                        disabled={busy}
                                        onChange={(e) =>
                                          setCollectionDraft(collection.id, 'name', e.target.value)
                                        }
                                        style={{ ...inputStyle, height: 34, fontSize: 13 }}
                                        aria-label={`Name for ${collection.name}`}
                                      />
                                      <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {collection.slug}
                                        {collection.archived_at && <ArchivedTag />}
                                      </span>
                                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                        <GhostButton
                                          disabled={busy}
                                          onClick={() => saveCollection(collection)}
                                        >
                                          Save
                                        </GhostButton>
                                        <GhostButton
                                          disabled={busy}
                                          tone={collection.archived_at ? 'ink' : 'danger'}
                                          onClick={() => archiveCollection(collection)}
                                        >
                                          {collection.archived_at ? 'Restore' : 'Archive'}
                                        </GhostButton>
                                      </span>
                                    </Row>
                                    {/* Storefront tile editorial — what the brand page's
                                        collection tile shows beside the live product link. */}
                                    <div
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: '2fr 1fr',
                                        gap: 10,
                                        padding: '0 20px 13px',
                                      }}
                                      className="r-grid-2"
                                    >
                                      <input
                                        value={collectionDrafts[collection.id]?.description ?? ''}
                                        disabled={busy}
                                        placeholder="Tile description shown on the storefront brand page"
                                        onChange={(e) =>
                                          setCollectionDraft(
                                            collection.id,
                                            'description',
                                            e.target.value
                                          )
                                        }
                                        style={{ ...inputStyle, height: 34, fontSize: 12.5 }}
                                        aria-label={`Description for ${collection.name}`}
                                      />
                                      <input
                                        value={collectionDrafts[collection.id]?.image_url ?? ''}
                                        disabled={busy}
                                        placeholder="Tile image URL (https://…)"
                                        onChange={(e) =>
                                          setCollectionDraft(collection.id, 'image_url', e.target.value)
                                        }
                                        style={{ ...inputStyle, height: 34, fontSize: 12.5 }}
                                        aria-label={`Image URL for ${collection.name}`}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            <div style={{ display: 'flex', gap: 10, padding: '13px 20px' }}>
                              <input
                                value={newCollection}
                                disabled={busy}
                                placeholder="New collection name"
                                onChange={(e) => setNewCollection(e.target.value)}
                                style={{ ...inputStyle, height: 34, fontSize: 13, maxWidth: 320 }}
                              />
                              <GhostButton disabled={busy} onClick={() => addCollection(brand)}>
                                Add collection
                              </GhostButton>
                            </div>
                          </div>
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

      <ToastLine message={message} />
    </div>
  )
}
