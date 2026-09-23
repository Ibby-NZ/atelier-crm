// Collections — live catalogue rows, wired to atelier-api's /admin/collections.
// They used to live inside the expanded house row on AdminBrands, which meant a
// collection could only be found by first knowing which house it belonged to,
// and only edited two at a time inside another screen's editor. This is that
// panel, given its own screen.
//
//   GET    /admin/collections?brand_id=&include_archived= → { collections }
//   POST   /admin/collections/:id/archive|restore
//   DELETE /admin/collections/:id                         → { deleted } | 409 { blockers }
//
// One collection OPENS ON ITS OWN PAGE (AdminCollection, /admin/collections/:id)
// and a new one is made on its own form (AdminCollectionNew,
// /admin/collections/new). Both used to open inside this list — the editor
// under its row, the create form above the table — until the client asked on
// 23 Sep 2026 for every kind of data entry to open "in their own individual
// page instead of a tabbed drop down". This screen is the list, its house
// filter and the lifecycle verbs; the create-only house and the product count
// that warns a delete will be refused moved with the form.
//
// Two API rules the list has to honour:
//   - **A collection slug is unique per HOUSE, never globally**
//     (`collections_brand_id_slug_unique`). So is the display name in practice:
//     the seed strips the house prefix off the vendored titles, so a
//     catalogue-wide list really does show several "Cappuccino"s. Every row is
//     therefore keyed and addressed by `id`, the house is the first column, and
//     anything that names a row to a person goes through `describeCollection`,
//     which names the house with it.
//   - **Archive is the reversible removal; DELETE is permanent** and is refused
//     while any product still points at the collection. That FK is SET NULL, so
//     an unprobed delete would report success while silently uncollecting every
//     one of them — which is why the refusal keeps the dialog open and offers
//     Archive instead, and why useCrudScreen is handed an archive action here.
//     Both verbs stay on the row: a collection that has just been deleted has no
//     page to stay on.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  CATALOGUE_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  collectionListFilters,
  collectionRoute,
  describeCollection,
  newCollectionRoute,
} from './adminCatalogue.js'
import {
  Select,
  ArchivedTag,
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'

// The last column carries Open / Archive / Delete.
const COLLECTION_COLUMNS = '1fr 1.4fr 1fr 215px'

export default function AdminCollections() {
  // The house filter lives in the URL, not in state: AdminBrands links each of
  // its rows through to `?brand_id=<id>`, and a filter held in state would
  // ignore that link once this screen was already mounted.
  const [searchParams, setSearchParams] = useSearchParams()
  const brandFilter = searchParams.get('brand_id') ?? ''
  const [showArchived, setShowArchived] = useState(false)
  const [brands, setBrands] = useState([])

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
  const { message } = crud.toast
  // One list on this screen now, so the kit's own mutation cycle serves it. It
  // built a combined reload of its own while the open editor had a detail read
  // to refresh beside the list; that read lives on the collection's page.
  const { busy, error, run } = crud.mutation

  const setBrandFilter = (value) =>
    setSearchParams(value ? { brand_id: value } : {}, { replace: true })

  // Houses back the filter; they change far less often than collections, so
  // they load once.
  useEffect(() => {
    let active = true
    apiFetch('/admin/brands')
      .then((body) => active && setBrands(body.brands ?? []))
      .catch(() => {
        /* the list below reports the failure; the filter just stays empty */
      })
    return () => {
      active = false
    }
  }, [])

  // Archiving is reversible, so it asks nothing and offers Restore afterwards
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

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Add a collection"
            right={
              // A create is data entry, so it opens on its own page like the
              // record does. It pre-picks whichever house is being filtered on —
              // the common path here is arriving from that house's row on Houses.
              <Link to={newCollectionRoute(brandFilter)} style={{ textDecoration: 'none' }}>
                <GhostButton>New collection</GhostButton>
              </Link>
            }
          />
        </section>

        <section style={panel}>
          <PanelHead
            label="Collections"
            right={
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Select
                  value={brandFilter}
                  disabled={busy}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  style={{ ...cellInput, width: 'auto' }}
                  aria-label="Filter by house"
                >
                  <option value="">All houses</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
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
              {collections.map((collection) => (
                <Row key={collection.id} columns={COLLECTION_COLUMNS} archived={Boolean(collection.archived_at)}>
                  <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {collection.brand_name}
                  </span>
                  <span style={{ minWidth: 0, fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                    <Link
                      to={collectionRoute(collection.id)}
                      className="ab-link"
                      style={{ color: c.ink, textDecoration: 'none' }}
                    >
                      {collection.name}
                    </Link>
                    {collection.archived_at && <ArchivedTag />}
                  </span>
                  <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {collection.slug}
                  </span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={collectionRoute(collection.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    <GhostButton disabled={busy} onClick={() => archiveCollection(collection)}>
                      {collection.archived_at ? 'Restore' : 'Archive'}
                    </GhostButton>
                    {/* The permanent verb is the QUIET one on the row — no
                        border, no red — so it is never the eye-catching
                        click (15 Sep 2026 audit, CRM-07). The danger colour
                        belongs to the confirm dialog it opens. */}
                    <GhostButton
                      disabled={busy}
                      style={{ border: 'none', color: c.muted }}
                      onClick={() => crud.remove.ask(collection)}
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

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
