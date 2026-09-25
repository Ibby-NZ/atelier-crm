// Houses — live catalogue rows, wired to atelier-api's /admin/brands. Unlike
// the Dynamics screens (Price Lists, Reserves, Clients) these are the platform's
// own tables, so this screen writes as well as reads.
//
//   GET    /admin/brands?include_archived=      → { brands }
//   POST   /admin/brands/:id/archive|restore    → { brand }
//   DELETE /admin/brands/:id                    → { deleted } | 409 { blockers }
//
// One house OPENS ON ITS OWN PAGE (AdminBrand, /admin/brands/:id) and a new one
// is made on its own form (AdminBrandNew, /admin/brands/new). Both used to open
// inside this list — the editor under its row, the create form above the
// strips — until the client asked on 23 Sep 2026 for every kind of data entry to
// open "in their own individual page instead of a tabbed drop down". This screen
// is the list, the featured strips and the lifecycle verbs; the rules the
// house's form honours (the immutable slug, the supplier link, the trade_only
// switch) moved with the form and are stated at the top of AdminBrand.
//
// **Collections are not edited here either.** They were a second list inside the
// expanded house row, which meant a collection could only be reached by first
// knowing its house. They have their own screen (AdminCollections) and each
// house row links through to it, house filter pre-applied — see collectionsPath.
//
// Each row still NAMES its supplier, or says it has none: the list read carries
// `supplier_name` for that. A house nobody has linked cannot have a purchase
// order raised for it, so the unlinked state is said out loud on the list, not
// only on the page where it is set. It is not a rate, and no cost figure
// appears on this screen.
//
// Archive is the reversible removal; DELETE is permanent and is refused while
// anything is left behind. A house holding products or collections comes back
// 409 with both counts, because the FKs underneath are CASCADE and SET NULL —
// the database would have reported success while destroying its catalogue (or
// silently uncollecting every product). The dialog stays open on that refusal
// and offers Archive instead, which is why this screen hands `useCrudScreen` an
// archive action rather than only a delete path. Both verbs stay on the row:
// a house that has just been deleted has no page to stay on.
//
// The featured panel changes the public site too: it replaces the storefront's
// hardcoded slug arrays, so the homepage hero and the "In focus" strip on
// /brands are now an office decision. It is a SCREEN-level panel over the whole
// catalogue, not a field of one house, which is why it stayed here when the
// house editor moved to its own page. Its rules live in featuredOrder.js —
// position in the list IS the rank, and the submitted list is authoritative, so
// anything absent from it stops being featured. It reads both catalogue lists
// archive-inclusive of its own accord, because an archived row stays FEATURED
// on purpose and the houses list below is filtered.
//
// "Pricing from the Dynamics export" (Sept 2026) uploads the tracking-options
// workbook and applies each range's duty, clearance, freight, discount, trade
// markup and surcharge to the house of the same name — HousePricingImport. It is
// the one cost-bearing panel here and the API finance-gates it; each house's
// figures are then edited on its own page's Pricing panel.
//
// requireRole('backoffice') on the API is the real gate — every CRM login is
// staff (see AuthContext's STAFF_ROLE_MAP), so there is no extra capability here.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import {
  BRAND_LIST,
  COLLECTION_LIST,
  FEATURED_SOURCE_PATHS,
  STOREFRONT_TIMING_NOTE,
  addFeatured,
  candidates,
  featuredFrom,
  move,
  removeFeatured,
  sameOrder,
  saveBody,
  withBrandSlug,
} from './featuredOrder.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import HousePricingImport from './HousePricingImport.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { useConfirmation } from '../admin/useConfirmation.js'
import {
  CATALOGUE_LIST_LIMIT,
  NEW_BRAND_ROUTE,
  archiveInsteadPath,
  archiveTogglePath,
  brandListFilters,
  brandRoute,
  collectionsPath,
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
  messageOf,
  monoText,
  mutedText,
  panel,
  sectionLabel,
} from '../admin/parts.jsx'

// The last column carries Open / Archive / Delete.
const BRAND_COLUMNS = '1.5fr 80px 0.9fr 105px 115px 215px'
const FEATURED_COLUMNS = '34px 1fr 240px'

export default function AdminBrands() {
  const confirmation = useConfirmation()
  const [showArchived, setShowArchived] = useState(false)
  const [importing, setImporting] = useState(false)
  const [featuredSource, setFeaturedSource] = useState({ brands: [], collections: [] })
  const [featuredStatus, setFeaturedStatus] = useState('loading') // loading | ready | error
  const [featuredLoadError, setFeaturedLoadError] = useState('')
  const [featuredError, setFeaturedError] = useState('')
  const [brandOrder, setBrandOrder] = useState([])
  const [collectionOrder, setCollectionOrder] = useState([])

  // The houses list, the toast and the whole delete flow in one. `archive` is
  // what puts "Archive instead" on a refusal — useCrudScreen offers it only when
  // the API says the entity is archivable AND the screen supplied the action.
  const crud = useCrudScreen({
    path: '/admin/brands',
    key: 'brands',
    limit: CATALOGUE_LIST_LIMIT,
    filters: brandListFilters(showArchived),
    entity: 'house',
    describe: (brand) => brand?.name,
    archive: (brand) => apiSend('POST', archiveInsteadPath('/admin/brands', brand), {}),
  })
  const brands = crud.list.rows
  const { message, flash } = crud.toast
  // One list on this screen now, so the kit's own mutation cycle serves it — it
  // is already bound to that list's reload. (A screen holding a SECOND list has
  // to build a combined reload and call useMutation itself; this one did, until
  // collections moved out.)
  const { busy, error, run } = crud.mutation

  const loadFeatured = useCallback(async () => {
    const [brandBody, collectionBody] = await Promise.all([
      apiFetch(FEATURED_SOURCE_PATHS.brands),
      apiFetch(FEATURED_SOURCE_PATHS.collections),
    ])
    setFeaturedSource({
      brands: brandBody.brands ?? [],
      collections: collectionBody.collections ?? [],
    })
  }, [])

  // The panel follows the houses list rather than holding a reload of its own:
  // every mutation on this screen ends in list.reload() — including the kit's
  // delete, which a screen cannot hook — so an archived, restored or deleted
  // house reaches the strips through the same cycle, and a house renamed on its
  // own page does the moment the list remounts. Skipped while the list is
  // loading so a mount costs one pair of requests rather than two.
  const listStatus = crud.list.status
  useEffect(() => {
    if (listStatus === 'loading') return undefined
    let active = true
    loadFeatured()
      .then(() => active && setFeaturedStatus('ready'))
      .catch((err) => {
        if (!active) return
        setFeaturedLoadError(messageOf(err, 'Could not load the featured lists.'))
        setFeaturedStatus('error')
      })
    return () => {
      active = false
    }
  }, [loadFeatured, listStatus, brands])

  // The house slug the admin collection read model does not carry, joined on
  // once: every collection the featured endpoint names is a (brand_slug, slug)
  // PAIR, because a collection slug is unique per brand and never globally.
  const collectionRows = useMemo(
    () => withBrandSlug(featuredSource.collections, featuredSource.brands),
    [featuredSource]
  )
  const featuredBrands = useMemo(() => featuredFrom(featuredSource.brands), [featuredSource])
  const featuredCollections = useMemo(() => featuredFrom(collectionRows), [collectionRows])

  // Server truth wins after every reload: the ranks are the server's, and a
  // saved reorder comes back renumbered from 1 with no gaps. The cost is that an
  // unsaved reorder is discarded if another change on this screen lands first —
  // an archive, a restore, a delete or the other strip's save.
  useEffect(() => setBrandOrder(featuredBrands), [featuredBrands])
  useEffect(() => setCollectionOrder(featuredCollections), [featuredCollections])

  // One whole-list PUT per strip. The body IS the list, so there is nothing to
  // diff and no rank to compute — position is the rank, and the API clears then
  // re-applies inside one transaction. It goes through the kit's `run` so the
  // houses list reloads, which is what pulls the saved ranks back into the panel.
  const saveFeatured = (kind, order, saved) => {
    setFeaturedError('')
    if (sameOrder(order, saved, kind)) return flash('No changes to save.')
    const { body, error: buildError } = saveBody(order, kind)
    if (buildError) return setFeaturedError(buildError)
    run(() => apiSend('PUT', kind.path, body), `Featured ${kind.plural} saved.`)
  }

  // Archiving is reversible, so it asks once and offers Restore afterwards
  // rather than warning about permanence it does not have.
  const archiveBrand = async (brand) => {
    const archived = Boolean(brand.archived_at)
    if (
      !archived &&
      !(await confirmation.ask({
        title: `Archive ${brand.name}?`,
        body: `Archive ${brand.name}? It drops off the website and out of this list, and you can restore it later.`,
        confirmLabel: 'Archive',
        confirmTone: 'ink',
      }))
    ) {
      return
    }
    run(
      () => apiSend('POST', archiveTogglePath('/admin/brands', brand), {}),
      archived ? `${brand.name} restored.` : `${brand.name} archived.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue · live"
        title="Houses"
        subtitle="The platform's own brand records — what the storefront reads. Web addresses are generated once and never change; each house's collections are on their own screen."
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

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Add a house"
            right={
              // A create is data entry, so it opens on its own page like the
              // record does, rather than dropping down above the list.
              <Link to={NEW_BRAND_ROUTE} style={{ textDecoration: 'none' }}>
                <GhostButton>New house</GhostButton>
              </Link>
            }
          />
        </section>

        {/* The Dynamics tracking-options export, applied to every house at
            once — about the whole list, like the featured strips, so it lives
            here and opens only when asked. Finance-gated by the API. */}
        <section style={panel}>
          <PanelHead
            label="Pricing from the Dynamics export"
            right={
              <GhostButton onClick={() => setImporting((open) => !open)}>
                {importing ? 'Close' : 'Upload export'}
              </GhostButton>
            }
          />
          {importing && <HousePricingImport flash={flash} />}
        </section>

        <section style={panel}>
          <PanelHead label="Featured on the storefront" />
          <div style={{ padding: '4px 20px 20px', display: 'grid', gap: 24 }}>
            {/* The asymmetry is real and would otherwise read as a bug. */}
            <PanelNote>{STOREFRONT_TIMING_NOTE}</PanelNote>
            <ErrorLine>{featuredError}</ErrorLine>
            {featuredStatus === 'loading' && <PanelNote>Loading the featured lists…</PanelNote>}
            {featuredStatus === 'error' && <PanelNote tone="danger">{featuredLoadError}</PanelNote>}
            {featuredStatus === 'ready' && (
              <>
                <FeaturedList
                  kind={BRAND_LIST}
                  title="Houses in focus"
                  hint="The order the storefront Houses page draws its strip in."
                  order={brandOrder}
                  setOrder={setBrandOrder}
                  rows={featuredSource.brands}
                  busy={busy}
                  onSave={() => saveFeatured(BRAND_LIST, brandOrder, featuredBrands)}
                  onError={setFeaturedError}
                />
                <FeaturedList
                  kind={COLLECTION_LIST}
                  title="Collections on the homepage"
                  hint="The first three lead the hero; the rest fill the latest-collections row."
                  order={collectionOrder}
                  setOrder={setCollectionOrder}
                  rows={collectionRows}
                  busy={busy}
                  onSave={() => saveFeatured(COLLECTION_LIST, collectionOrder, featuredCollections)}
                  onError={setFeaturedError}
                />
              </>
            )}
          </div>
        </section>

        <section style={panel}>
          <PanelHead
            label="Houses"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {crud.list.total} shown
              </span>
            }
          />
          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {crud.list.status === 'loading' && <PanelNote>Loading houses…</PanelNote>}
          {crud.list.status === 'error' && (
            <PanelNote tone="danger">{crud.list.error}</PanelNote>
          )}

          {crud.list.status === 'ready' && brands.length === 0 && (
            <PanelNote>No houses yet.</PanelNote>
          )}

          {crud.list.status === 'ready' && brands.length > 0 && (
            <>
              <HeaderRow
                columns={BRAND_COLUMNS}
                labels={['House', 'Currency', 'Web address', 'Pricing', 'Storefront', '']}
              />
              {brands.map((brand) => (
                <Row key={brand.id} columns={BRAND_COLUMNS} archived={Boolean(brand.archived_at)}>
                  {/* The name opens the house's page; the sub-line carries the
                      link through to its collections. Two links side by side,
                      never one inside the other. */}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                      <Link
                        to={brandRoute(brand.id)}
                        className="ab-link"
                        style={{ color: c.ink, textDecoration: 'none' }}
                      >
                        {brand.name}
                      </Link>
                      {brand.archived_at && <ArchivedTag />}
                    </span>
                    <span style={{ display: 'block', ...mutedText, fontSize: 11.5, marginTop: 2 }}>
                      {brand.country ? `${brand.country} · ` : ''}
                      {brand.bespoke ? 'Bespoke · ' : ''}
                      {/* Who invoices this house. A house with no supplier
                          cannot have a purchase order raised for it and
                          prices off no rate sheet, so the unlinked state is
                          said out loud rather than left blank. */}
                      <span style={{ color: brand.supplier_name ? c.inkSoft : c.clay }}>
                        {brand.supplier_name ?? 'No supplier'}
                      </span>
                      {' · '}
                      <Link
                        to={collectionsPath(brand)}
                        className="ab-link"
                        style={{ color: c.accent }}
                      >
                        Collections
                      </Link>
                    </span>
                  </span>
                  <span style={monoText}>{brand.currency}</span>
                  <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {brand.slug}
                  </span>
                  <span style={mutedText}>
                    {brand.is_international ? 'Price hidden' : 'Price shown'}
                  </span>
                  {/* The public/closed state, in the visitor's terms: "Public"
                      means a signed-out shopper can browse this house at all. */}
                  <span style={{ ...mutedText, color: brand.trade_only ? c.clay : c.sage }}>
                    {brand.trade_only ? 'Trade only' : 'Public'}
                  </span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={brandRoute(brand.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    <GhostButton disabled={busy} onClick={() => archiveBrand(brand)}>
                      {brand.archived_at ? 'Restore' : 'Archive'}
                    </GhostButton>
                    {/* The permanent verb is the QUIET one on the row — no
                        border, no red — so it is never the eye-catching
                        click (15 Sep 2026 audit, CRM-07). The danger colour
                        belongs to the confirm dialog it opens. */}
                    <GhostButton
                      disabled={busy}
                      style={{ border: 'none', color: c.muted }}
                      onClick={() => crud.remove.ask(brand)}
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
      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}


// One featured strip, drawn twice: houses and collections differ only in how a
// row is named, labelled and sent, and featuredOrder.js carries that difference
// as `kind`. The number beside a row is its INDEX — position is the rank, so
// nothing here reads or writes featured_rank itself.
function FeaturedList({ kind, title, hint, order, setOrder, rows, busy, onSave, onError }) {
  const [choice, setChoice] = useState('')
  const options = candidates(rows, order, kind)

  const add = () => {
    const entry = options.find((option) => kind.keyOf(option) === choice)
    if (!entry) return onError(`Choose a ${kind.noun} to feature.`)
    // addFeatured is what makes a duplicate impossible, and what stops the list
    // at the API's cap rather than letting the office arrange a thirteenth.
    const added = addFeatured(order, entry, kind)
    onError(added.error)
    if (added.error) return
    setOrder(added.list)
    setChoice('')
  }

  const edit = (next) => {
    onError('')
    setOrder(next)
  }

  return (
    <div>
      <span style={sectionLabel}>{title}</span>
      <div style={{ ...mutedText, fontSize: 11.5, marginTop: 4 }}>{hint}</div>
      <div style={{ ...panel, marginTop: 12, background: c.paper }}>
        {order.length === 0 ? (
          <PanelNote>Nothing featured — the strip is off.</PanelNote>
        ) : (
          <>
            <HeaderRow columns={FEATURED_COLUMNS} labels={['#', kind.noun, '']} />
            {order.map((entry, index) => (
              <Row
                key={kind.keyOf(entry)}
                columns={FEATURED_COLUMNS}
                archived={Boolean(entry.archived_at)}
              >
                <span style={monoText}>{index + 1}</span>
                <span style={{ fontSize: 13, color: c.ink, minWidth: 0 }}>
                  {kind.labelOf(entry)}
                  {/* Archived stays in the order deliberately: the storefront
                      already skips it, and restoring brings its place back. */}
                  {entry.archived_at && <ArchivedTag />}
                </span>
                <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {/* Disabled at the ends as well as refused by `move`, so the
                      list's edges are visible rather than merely inert. */}
                  <GhostButton disabled={busy || index === 0} onClick={() => edit(move(order, index, -1))}>
                    Up
                  </GhostButton>
                  <GhostButton
                    disabled={busy || index === order.length - 1}
                    onClick={() => edit(move(order, index, 1))}
                  >
                    Down
                  </GhostButton>
                  <GhostButton disabled={busy} tone="danger" onClick={() => edit(removeFeatured(order, index))}>
                    Remove
                  </GhostButton>
                </span>
              </Row>
            ))}
          </>
        )}
        <div style={{ display: 'flex', gap: 10, padding: '13px 20px', flexWrap: 'wrap' }}>
          <Select
            value={choice}
            disabled={busy}
            onChange={(e) => setChoice(e.target.value)}
            style={{ ...inputStyle, height: 34, fontSize: 13, maxWidth: 340 }}
            aria-label={`Add a ${kind.noun} to the featured list`}
          >
            <option value="">Add a {kind.noun}…</option>
            {options.map((option) => (
              <option key={kind.keyOf(option)} value={kind.keyOf(option)}>
                {kind.labelOf(option)}
              </option>
            ))}
          </Select>
          <GhostButton disabled={busy || !choice} onClick={add}>Add</GhostButton>
          {/* One PUT replaces the whole list — anything removed above stops
              being featured the moment this lands. */}
          <GhostButton tone="accent" disabled={busy} onClick={onSave}>Save order</GhostButton>
        </div>
      </div>
    </div>
  )
}
