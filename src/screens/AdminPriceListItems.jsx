// Supplier rates — the platform's own price-list table, wired to atelier-api's
// /admin/price-list-items. Editable, unlike the Price Lists tab beside it (which
// mirrors Dynamics read-only until cutover).
//
//   GET    /admin/price-list-items?supplier=&category=&q=&include_archived=&page=&limit=
//                                                 → { items, meta: { total, page, limit } }
//   POST   /admin/price-list-items/:id/archive|restore
//   DELETE /admin/price-list-items/:id            → { deleted, warning }
//   POST   /admin/price-list-items/mark-discontinued → { result }
//
// One rate OPENS ON ITS OWN PAGE (AdminPriceListItem, /admin/price-lists/:id),
// and a rate keyed by hand is keyed on its own page too
// (AdminPriceListItemNew, /admin/price-lists/new). Both used to open inside
// this screen — the editor under its row, the create form dropping down above
// the table — and the client asked for every data-entry form to open on a page
// of its own instead (23 Sep 2026). This screen is the list, the search, the
// drop-detection mark and the lifecycle verbs; everything about ONE rate is on
// the page behind "Open". The form both pages draw is RateFields.jsx.
//
// **The search lives in the URL** (`?q=&supplier=&category=`,
// adminPriceListItems.js) because the office now leaves this list to edit a
// rate and comes back: held in state, the search died on the way out and Back
// landed on every rate there is. The row's link hands the page the list as it
// stood, so the page's own Back link returns to it too.
//
// Drop detection rides on every row as two flags the list must keep distinct:
// `discontinued_at` (a staff decision, clay — the alarm tone) and the derived
// `suspect` (missing from the group's most recent import, brass — a suspicion,
// not a verdict). Marking is an EXPLICIT act via mark-discontinued, scoped to
// one (supplier, category); the API's response states coverage before the
// count it acted on, and that statement is rendered as the confirmation. The
// flag rules live in ./adminLists.js. The mark stays HERE, not on a page: it is
// a decision about a group of rows the list is showing, not data entry on one.
//
// The corpus is ~19,500 rows imported from the supplier templates, so this
// screen is paginated and search-first: it is for correcting or hand-keying a
// rate, not for browsing everything. A new season's rates arrive through
// `npm run convert:pricing` + `import:pricing`, not by typing. It is the CRM's
// only genuinely paged list, and therefore the first real consumer of the kit's
// shared <Pagination />.
//
// **Delete here is the one removal in the platform that is not durable.** The
// import upserts on (supplier, category, code) and keeps rows absent from later
// files, so the next `npm run import:pricing` re-creates a deleted rate verbatim
// while leaving an archived one archived. The API says so in the 200's
// `warning`, but useCrudScreen discards a delete's response body — and a caveat
// that arrives after the deletion is not a caveat — so the confirmation carries
// it instead (RATE_DELETE_CAVEAT).

import FreightByHouse from './FreightByHouse.jsx'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { useConfirmation } from '../admin/useConfirmation.js'
import {
  RATE_DELETE_CAVEAT,
  RATE_FLAG_NOTE,
  RATE_LIST_LIMIT,
  describeRate,
  filterByRateFlag,
  markDiscontinuedAsk,
  markDiscontinuedScope,
  rateListFilters,
  withDeleteCaveat,
} from './adminLists.js'
import {
  NEW_RATE_ROUTE,
  PRICE_LIST_ITEMS_PATH,
  priceListItemPath,
  rateRoute,
  rateSearchFromParams,
  rateSearchParams,
  ratesListRoute,
} from './adminPriceListItems.js'
import { EnumSelect, FlagTag } from './RateFields.jsx'
import {
  ArchivedTag,
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
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import { useCategories } from '../admin/useCategories.js'

const COLUMNS = '1.1fr 1fr 1.4fr 80px 1fr 90px 215px'

export default function AdminPriceListItems() {
  const confirmation = useConfirmation()
  // The live vocabulary. `values` feeds every category select on this screen and
  // `labelFor` names a stored value — including one added since this build
  // shipped, which the frozen list would render as its raw slug.
  const { values: CATEGORIES, labelFor: categoryLabel } = useCategories()
  // The committed search, from the URL (see the header). The term has a draft
  // because it only moves the list on Search; the supplier box and the
  // category select filter as they change, as they always have.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSearch = rateSearchFromParams(searchParams)
  const { q: term, supplier, category } = urlSearch
  const [draftTerm, setDraftTerm] = useState(term)
  const [showArchived, setShowArchived] = useState(false)
  // Drop-detection: the client-side flag filter and the mark-discontinued form.
  const [flag, setFlag] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [dropScope, setDropScope] = useState({ supplier: '', category: 'fabric' })
  const [dropResult, setDropResult] = useState(null)

  // A link that arrives with a search in it (the sidebar's bare path included)
  // has to refill the box as well as move the list — a box reading "linen" over
  // an unfiltered list says those are all the rates there are. Keyed on the
  // term, a primitive, so the supplier box writing the URL never erases a term
  // typed and not yet searched.
  useEffect(() => {
    setDraftTerm(term)
  }, [term])

  // The paged list, the toast, the mutate-then-reload cycle and the delete flow
  // in one. `archive` is what puts "Archive instead" on a refusal — and here it
  // is also the durable removal, which is the whole point of the caveat below.
  const crud = useCrudScreen({
    path: PRICE_LIST_ITEMS_PATH,
    key: 'items',
    limit: RATE_LIST_LIMIT,
    filters: rateListFilters({ term, supplier, category, showArchived }),
    entity: 'rate',
    describe: describeRate,
    archive: (item) => apiSend('POST', `${priceListItemPath(item.id)}/archive`, {}),
  })
  const items = crud.list.rows
  // The flag filter narrows THIS PAGE only — the endpoint has no
  // discontinued/suspect param, and inventing one would be Ajv-stripped and
  // silently filter nothing. RATE_FLAG_NOTE says so beside the rows.
  const visible = filterByRateFlag(items, flag)
  const { message } = crud.toast
  const { busy, error, setError, run } = crud.mutation
  // Handed to every rate opened from here, so its page comes back to this.
  const here = { list: ratesListRoute(urlSearch) }

  // Replace, not push: a keystroke in the supplier box is not a place the back
  // button should stop at.
  const commitSearch = (patch) =>
    setSearchParams(rateSearchParams({ ...urlSearch, ...patch }), { replace: true })

  // The kit resets the page to 1 whenever the serialised filters change, so a
  // narrower search never lands on a page past the end of its own result set.
  const search = (event) => {
    event.preventDefault()
    setError('')
    commitSearch({ q: draftTerm })
  }

  const archiveItem = (item) => {
    const archived = Boolean(item.archived_at)
    run(
      () =>
        apiSend(
          'POST',
          `${priceListItemPath(item.id)}/${archived ? 'restore' : 'archive'}`,
          {}
        ),
      archived ? `${item.code} restored.` : `${item.code} archived.`
    )
  }

  // The mark itself. The API computes coverage and marks in ONE snapshot, so
  // the ask promises the coverage statement and the statement — "this file
  // covered 412 of the 2,516 codes we hold, marked 2,104" — arrives as the
  // confirmation, rendered persistently rather than as a passing toast. Its
  // refusals (no rows held, no import to compare against) are the API's own
  // 422 sentences on the error line.
  const markDrop = async () => {
    const scope = markDiscontinuedScope(dropScope)
    if (scope.error) return setError(scope.error)
    if (!(await confirmation.ask({
      title: `Mark ${scope.body.supplier} ${scope.body.category} codes discontinued?`,
      body: markDiscontinuedAsk(scope.body),
      confirmLabel: 'Mark discontinued',
      confirmTone: 'ink',
    }))) {
      return
    }
    setDropResult(null)
    let outcome = null
    const ok = await run(async () => {
      const body = await apiSend('POST', `${PRICE_LIST_ITEMS_PATH}/mark-discontinued`, scope.body)
      outcome = body.result
      return body
    }, 'Discontinued marks recorded.')
    if (ok) setDropResult(outcome)
  }

  const openDrop = () => {
    // Opening prefills the scope from the list filters — the group on screen
    // is almost always the group being judged.
    if (!showDrop) {
      setDropScope({ supplier, category: category || 'fabric' })
      setDropResult(null)
    }
    setShowDrop(!showDrop)
    setError('')
  }

  const setScope = (key) => (event) => {
    setDropScope((s) => ({ ...s, [key]: event.target.value }))
    // A statement about one scope must not sit under an edited one.
    setDropResult(null)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Price lists · live"
        title={<>Supplier rates</>}
        subtitle="The platform's own rate table. Rates stay in the supplier's currency — the pricing waterfall converts them downstream."
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />{' '}
              Show archived
            </label>
            {/* A rate keyed by hand opens on its own page; the list is where
                it comes back to. */}
            <Link to={NEW_RATE_ROUTE} state={here} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">New rate</GhostButton>
            </Link>
          </div>
        }
      />
      <SectionTabs tabs={priceListTabs} active="rates" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Drop detection"
            right={
              <GhostButton disabled={busy} onClick={openDrop}>
                {showDrop ? 'Cancel' : 'Mark discontinued'}
              </GhostButton>
            }
          />
          {showDrop && (
            <div style={{ padding: 20 }}>
              <p style={{ ...mutedText, margin: 0, lineHeight: 1.6, maxWidth: 720 }}>
                Marks every code of one supplier and category that the group&apos;s most recent
                import did not name. An import only ever records what it saw — this is the
                explicit act — and the response states what that file covered before the count
                it acted on, which is the whole defence against a partial file. A discontinued
                mark blocks nothing and archives nothing.
              </p>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16, alignItems: 'end' }}
                className="r-grid-2"
              >
                <Field label="Supplier">
                  <input value={dropScope.supplier} disabled={busy} onChange={setScope('supplier')} style={inputStyle} />
                </Field>
                <Field label="Category">
                  <EnumSelect value={dropScope.category} options={CATEGORIES} labelOf={categoryLabel} disabled={busy} onChange={setScope('category')} />
                </Field>
                <div>
                  <GhostButton tone="accent" disabled={busy} onClick={markDrop}>
                    Mark discontinued
                  </GhostButton>
                </div>
              </div>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              {dropResult && (
                <div
                  role="status"
                  style={{ marginTop: 14, fontSize: 13, color: c.ink, fontFamily: font.ui, lineHeight: 1.6 }}
                >
                  {dropResult.message}
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ ...panel, minWidth: 0, overflow: 'clip' }}>
          <PanelHead
            label="Rates"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {crud.list.total.toLocaleString('en-NZ')} total
              </span>
            }
          />

          <form
            onSubmit={search}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}
          >
            <input
              value={draftTerm}
              onChange={(e) => setDraftTerm(e.target.value)}
              placeholder="Code, description or range"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 240 }}
              aria-label="Search rates"
            />
            <input
              value={supplier}
              onChange={(e) => commitSearch({ supplier: e.target.value })}
              placeholder="Supplier"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 180 }}
              aria-label="Filter by supplier"
            />
            <EnumSelect
              value={category}
              options={CATEGORIES} labelOf={categoryLabel}
              allowBlank
              ariaLabel="Filter by category"
              onChange={(e) => commitSearch({ category: e.target.value })}
              style={{ height: 34, fontSize: 12.5, width: 'auto' }}
            />
            {/* Client-side, so it applies as picked — no Search needed. */}
            <Select
              value={flag}
              onChange={(e) => setFlag(e.target.value)}
              aria-label="Filter by drop-detection flag"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 'auto' }}
            >
              <option value="">All rows</option>
              <option value="discontinued">Discontinued</option>
              <option value="suspect">Suspect</option>
            </Select>
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          {!showDrop && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
          {flag !== '' && <PanelNote>{RATE_FLAG_NOTE}</PanelNote>}
          {crud.list.status === 'loading' && <PanelNote>Loading rates…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && items.length === 0 && (
            <PanelNote>Nothing matches those filters.</PanelNote>
          )}

          {crud.list.status === 'ready' && items.length > 0 && visible.length === 0 && (
            <PanelNote>No {flag} rows on this page.</PanelNote>
          )}

          {crud.list.status === 'ready' && visible.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['Supplier', 'Code', 'Description', 'Unit', 'Wholesale', 'Effective', '']}
                sticky
                numeric={[4]}
              />
              {visible.map((item) => (
                <Row key={item.id} columns={COLUMNS} archived={Boolean(item.archived_at)}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.supplier}
                      {item.archived_at && <ArchivedTag />}
                    </span>
                    <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>{categoryLabel(item.category)}</span>
                    <FlagTag item={item} />
                  </span>
                  {/* The code is the rate's name within its supplier, so it is
                      the link to the rate's page. */}
                  <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Link
                      to={rateRoute(item.id)}
                      state={here}
                      className="ab-link"
                      style={{ color: c.ink, textDecoration: 'none' }}
                    >
                      {item.code}
                    </Link>
                  </span>
                  <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.description || item.product_range || '—'}
                  </span>
                  <span style={mutedText}>{item.unit}</span>
                  <span style={{ ...monoText, textAlign: 'right' }}>
                    {item.wholesale_rate ?? '—'} {item.currency}
                  </span>
                  <span style={{ ...monoText, fontSize: 11.5 }}>
                    {String(item.date_effective ?? '').slice(0, 10) || '—'}
                  </span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={rateRoute(item.id)} state={here} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    {/* Archive is the reversible verb and the durable one:
                        only Delete is drawn danger, and only Archive
                        survives the next import. */}
                    <GhostButton disabled={busy} onClick={() => archiveItem(item)}>
                      {item.archived_at ? 'Restore' : 'Archive'}
                    </GhostButton>
                    <GhostButton
                      disabled={busy}
                      tone="danger"
                      onClick={() => crud.remove.ask(item)}
                    >
                      Delete
                    </GhostButton>
                  </span>
                </Row>
              ))}
            </>
          )}

          {/* Outside the visible block on purpose: with a flag filter emptying
              this page, paging on is exactly what the note tells the office to
              do next. */}
          {crud.list.status === 'ready' && items.length > 0 && (
            <div style={{ padding: '4px 20px 14px' }}>
              <Pagination
                page={crud.list.page}
                totalPages={crud.list.totalPages}
                total={crud.list.total}
                unit="rates"
                onPage={crud.list.setPage}
                busy={busy}
              />
            </div>
          )}
        </section>

        {/* The freight each house lands at, under the rates it is added to. */}
        <FreightByHouse />
      </div>

      {/* The ask step says the removal is undone by the next import; a refusal
          keeps the API's own sentence. */}
      <ConfirmDialog {...withDeleteCaveat(crud.remove.dialog, RATE_DELETE_CAVEAT)} />
      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
