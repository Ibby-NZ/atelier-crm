// Houses — live catalogue rows, wired to atelier-api's /admin/brands. Unlike
// the Dynamics screens (Price Lists, Reserves, Clients) these are the platform's
// own tables, so this screen writes as well as reads.
//
//   GET    /admin/brands?include_archived=      → { brands }
//   POST   /admin/brands                        → { brand }
//   PATCH  /admin/brands/:id                    → { brand }
//   POST   /admin/brands/:id/archive|restore    → { brand }
//   DELETE /admin/brands/:id                    → { deleted } | 409 { blockers }
//
// **Collections are no longer edited here.** They were a second list inside the
// expanded house row, which meant a collection could only be reached by first
// knowing its house. They now have their own screen (AdminCollections) and each
// house row links through to it, house filter pre-applied — see collectionsPath.
//
// Two rules the form has to respect, both enforced by the API:
//   - The slug is generated on create and IMMUTABLE. It is the storefront URL
//     and the EmDash brand-page match key, so it is shown read-only; a rename
//     changes the display name and leaves every link intact.
//   - Archive is the reversible removal; DELETE is permanent and is refused
//     while anything is left behind. A house holding products or collections
//     comes back 409 with both counts, because the FKs underneath are CASCADE
//     and SET NULL — the database would have reported success while destroying
//     its catalogue (or silently uncollecting every product). The dialog stays
//     open on that refusal and offers Archive instead, which is why this screen
//     hands `useCrudScreen` an archive action rather than only a delete path.
//
// `trade_only` is the storefront's PUBLIC/CLOSED switch and the one field here
// that changes what an anonymous visitor to atelier.co.nz can see at all: with
// it set, that house's products are absent from the public grid and its product
// pages answer 403 until the visitor signs in with an approved trade account.
// Every house except Atelier's own workroom ships closed. Two things worth
// knowing before touching it:
//   - It is a DIFFERENT gate from `is_international`, which only hides the
//     retail PRICE. A house can be public with hidden prices, or trade-only with
//     prices, and the row prints both states side by side for that reason.
//   - The seed writes trade_only on INSERT only (it is absent from the upsert's
//     SET list, unlike `story`), so a decision made here is permanent: it
//     survives every `npm run seed`, and re-opening a house is a CRM edit, never
//     a seed change.
//
// The featured panel is the third thing here that changes the public site: it
// replaces the storefront's hardcoded slug arrays, so the homepage hero and the
// "In focus" strip on /brands are now an office decision. Its rules live in
// featuredOrder.js — position in the list IS the rank, and the submitted list is
// authoritative, so anything absent from it stops being featured. It reads both
// catalogue lists archive-inclusive of its own accord, because an archived row
// stays FEATURED on purpose and the houses list above is filtered.
//
// requireRole('backoffice') on the API is the real gate — every CRM login is
// staff (see AuthContext's STAFF_ROLE_MAP), so there is no extra capability here.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
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
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { useConfirmation } from '../admin/useConfirmation.js'
import {
  CATALOGUE_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  brandListFilters,
  collectionsPath,
} from './adminCatalogue.js'
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
  Select,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  readOnlyInput,
  sectionLabel,
} from '../admin/parts.jsx'

// One declaration per column, read by both draftFrom and diffFields so the form
// cannot format a value one way and parse it another.
const BRAND_FIELDS = Object.freeze([
  { key: 'name', label: 'House name', kind: 'text', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper', required: true },
  { key: 'country', label: 'Country', kind: 'text' },
  // The D365 reporting designation ("CF", "ST") the office's old reporting was
  // built on. `text`, so a cleared input goes up as null and empties the
  // column; unique per supplier on the API side, and a clash comes back as a
  // 409 whose sentence lands in the same inline error line as every other.
  { key: 'brand_code', label: 'Brand code', kind: 'text' },
  // The line the storefront house page opens on, above the story (16 Sep 2026).
  { key: 'headline', label: 'Headline', kind: 'text' },
  { key: 'story', label: 'Story', kind: 'text' },
  { key: 'website_url', label: 'Website', kind: 'url' },
  { key: 'image_url', label: 'House image', kind: 'url' },
  { key: 'logo_url', label: 'Logo', kind: 'url' },
  { key: 'is_international', label: 'International house', kind: 'bool' },
  { key: 'trade_only', label: 'Trade only', kind: 'bool' },
  // Takes made-to-measure commissions: the storefront lists the house on
  // /bespoke and puts the quote enquiry form on its page.
  { key: 'bespoke', label: 'Bespoke', kind: 'bool' },
])

// A new house defaults to CLOSED, matching the API's `trade_only` create default
// and the column's NOT NULL DEFAULT TRUE: a maison Atelier has just been given
// must not appear on the public website the moment someone types its name.
const NEW_BRAND = Object.freeze({
  name: '',
  currency: 'NZD',
  country: '',
  brand_code: '',
  headline: '',
  story: '',
  website_url: '',
  image_url: '',
  logo_url: '',
  is_international: true,
  trade_only: true,
  bespoke: false,
})

// The last column carries Edit / Archive / Delete.
const BRAND_COLUMNS = '1.5fr 80px 0.9fr 105px 115px 215px'
const FEATURED_COLUMNS = '34px 1fr 240px'

export default function AdminBrands() {
  const confirmation = useConfirmation()
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [brandDraft, setBrandDraft] = useState({})
  const [newBrand, setNewBrand] = useState(NEW_BRAND)
  const [showNewBrand, setShowNewBrand] = useState(false)
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
  const { busy, error, setError, run } = crud.mutation

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
  // delete, which a screen cannot hook — so a renamed, archived or deleted house
  // reaches the strips through the same cycle. Skipped while the list is loading
  // so a mount costs one pair of requests rather than two.
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
  // unsaved reorder is discarded if another edit on this screen is saved first —
  // the same lifetime brandDraft already has.
  useEffect(() => setBrandOrder(featuredBrands), [featuredBrands])
  useEffect(() => setCollectionOrder(featuredCollections), [featuredCollections])

  // Keep the open editor's draft in step with a reloaded row, so a saved name
  // is not immediately overwritten by a stale draft on the next keystroke.
  useEffect(() => {
    if (openId == null) return
    const brand = brands.find((b) => b.id === openId)
    if (!brand) {
      setOpenId(null)
      return
    }
    setBrandDraft(draftFrom(brand, BRAND_FIELDS))
  }, [openId, brands])

  const toggle = (brand) => {
    setError('')
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
                <Field
                  label="Brand code"
                  hint="The reporting designation the old D365 reports keyed on — unique within this house's supplier."
                >
                  <input
                    value={newBrand.brand_code}
                    onChange={(e) => setNewBrand((b) => ({ ...b, brand_code: e.target.value }))}
                    style={inputStyle}
                    placeholder="e.g. CF"
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label="Headline" hint="One line — the house's storefront page opens on it, above the story.">
                  <input
                    value={newBrand.headline}
                    onChange={(e) => setNewBrand((b) => ({ ...b, headline: e.target.value }))}
                    style={inputStyle}
                    maxLength={200}
                    placeholder="e.g. Silk woven in Lyon since 1787."
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label="Story" hint="The body copy on the house's storefront page — on the right for an ordinary house, under the headline for a bespoke one.">
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
                <Field
                  label="House image"
                  hint="The photograph the storefront's house tiles show, with the maison's name over it. Blank falls back to a collection or product shot."
                >
                  <input
                    value={newBrand.image_url}
                    onChange={(e) => setNewBrand((b) => ({ ...b, image_url: e.target.value }))}
                    style={inputStyle}
                    placeholder="https://media.atelier.co.nz/houses/pierre-frey.jpg"
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field
                  label="Logo"
                  hint="A transparent PNG of the maison's mark, white on nothing — the tile centres it over the house image in place of the typed name. Blank shows the name."
                >
                  <input
                    value={newBrand.logo_url}
                    onChange={(e) => setNewBrand((b) => ({ ...b, logo_url: e.target.value }))}
                    style={inputStyle}
                    placeholder="https://media.atelier.co.nz/houses/pierre-frey-logo.png"
                  />
                </Field>
              </div>
              <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                <CheckField
                  label="International house — retail prices stay hidden from shoppers"
                  checked={newBrand.is_international}
                  disabled={busy}
                  onChange={(e) =>
                    setNewBrand((b) => ({ ...b, is_international: e.target.checked }))
                  }
                />
                <CheckField
                  label="Trade only — signed-out visitors to the website cannot see this house's products at all"
                  checked={newBrand.trade_only}
                  disabled={busy}
                  onChange={(e) => setNewBrand((b) => ({ ...b, trade_only: e.target.checked }))}
                />
                <CheckField
                  label="Bespoke — takes made-to-measure commissions; listed on the website's Bespoke page, with the quote enquiry form on its house page"
                  checked={newBrand.bespoke}
                  disabled={busy}
                  onChange={(e) => setNewBrand((b) => ({ ...b, bespoke: e.target.checked }))}
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
          {!showNewBrand && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
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
              {brands.map((brand) => {
                const open = openId === brand.id
                return (
                  <div key={brand.id}>
                    <Row columns={BRAND_COLUMNS} archived={Boolean(brand.archived_at)}>
                      {/* The name expands the editor; the sub-line carries the
                          link through to this house's collections. They are
                          siblings rather than nested, because a <Link> inside a
                          <button> is a control inside a control. */}
                      <span style={{ minWidth: 0 }}>
                        <button
                          type="button"
                          onClick={() => toggle(brand)}
                          aria-expanded={open}
                          className="ab-t"
                          style={{
                            display: 'block',
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
                        </button>
                        <span style={{ display: 'block', ...mutedText, fontSize: 11.5, marginTop: 2 }}>
                          {brand.country ? `${brand.country} · ` : ''}
                          {brand.bespoke ? 'Bespoke · ' : ''}
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
                        <GhostButton disabled={busy} onClick={() => toggle(brand)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
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
                          {/* Filled from the CRM one house at a time — the
                              backfill planner found no defensible source for it,
                              so this input IS the write path. Blank clears it;
                              a code already used by another of this supplier's
                              houses is the API's 409, shown inline below. */}
                          <Field
                            label="Brand code"
                            hint="D365 reporting designation, e.g. CF — reports filter on it. Blank removes it."
                          >
                            <input
                              value={brandDraft.brand_code ?? ''}
                              disabled={busy}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, brand_code: e.target.value }))
                              }
                              style={inputStyle}
                              placeholder="e.g. CF"
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <Field label="Headline" hint="One line — the house's storefront page opens on it, above the story.">
                            <input
                              value={brandDraft.headline ?? ''}
                              disabled={busy}
                              maxLength={200}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, headline: e.target.value }))
                              }
                              style={inputStyle}
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <Field label="Story" hint="The body copy on the house's storefront page — on the right for an ordinary house, under the headline for a bespoke one.">
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
                        <div style={{ marginTop: 16 }}>
                          <Field
                            label="House image"
                            hint="Shown on the storefront's house tiles under the maison's name — blank falls back to a collection or product shot."
                          >
                            <input
                              value={brandDraft.image_url ?? ''}
                              disabled={busy}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, image_url: e.target.value }))
                              }
                              style={inputStyle}
                              placeholder="https://media.atelier.co.nz/houses/pierre-frey.jpg"
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <Field
                            label="Logo"
                            hint="A transparent PNG of the maison's mark — centred over the house image on the storefront tile in place of the name. Blank shows the name."
                          >
                            <input
                              value={brandDraft.logo_url ?? ''}
                              disabled={busy}
                              onChange={(e) =>
                                setBrandDraft((d) => ({ ...d, logo_url: e.target.value }))
                              }
                              style={inputStyle}
                              placeholder="https://media.atelier.co.nz/houses/pierre-frey-logo.png"
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                          <CheckField
                            label="International house — retail prices stay hidden from shoppers"
                            checked={brandDraft.is_international}
                            disabled={busy}
                            onChange={(e) =>
                              setBrandDraft((d) => ({ ...d, is_international: e.target.checked }))
                            }
                          />
                          {/* The public/closed switch. Untick it and this house's
                              products appear on the storefront to everyone,
                              signed in or not; ticked, only approved trade
                              accounts and staff can reach them. */}
                          <CheckField
                            label="Trade only — signed-out visitors to the website cannot see this house's products at all"
                            checked={brandDraft.trade_only}
                            disabled={busy}
                            onChange={(e) =>
                              setBrandDraft((d) => ({ ...d, trade_only: e.target.checked }))
                            }
                          />
                          <CheckField
                            label="Bespoke — takes made-to-measure commissions; listed on the website's Bespoke page, with the quote enquiry form on its house page"
                            checked={brandDraft.bespoke}
                            disabled={busy}
                            onChange={(e) =>
                              setBrandDraft((d) => ({ ...d, bespoke: e.target.checked }))
                            }
                          />
                        </div>
                        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveBrand(brand)}>
                            Save house
                          </GhostButton>
                          <Link
                            to={collectionsPath(brand)}
                            className="ab-link"
                            style={{ ...mutedText, color: c.accent }}
                          >
                            Manage this house's collections →
                          </Link>
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
