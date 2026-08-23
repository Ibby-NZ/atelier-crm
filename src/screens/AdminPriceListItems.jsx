// Supplier rates — the platform's own price-list table, wired to atelier-api's
// /admin/price-list-items. Editable, unlike the Price Lists tab beside it (which
// mirrors Dynamics read-only until cutover).
//
//   GET    /admin/price-list-items?supplier=&category=&q=&include_archived=&page=&limit=
//                                                 → { items, meta: { total, page, limit } }
//   POST   /admin/price-list-items                → { item }   (201)
//   PATCH  /admin/price-list-items/:id            → { item }
//   POST   /admin/price-list-items/:id/archive|restore
//   DELETE /admin/price-list-items/:id            → { deleted, warning }
//   GET    /admin/price-list-items/:id/price-history → { changes }   (finance)
//   GET    /admin/price-list-items/:id/rate?as_at=   → { rate }      (finance)
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
//
// Two fields the form deliberately does not offer:
//   - `code_normalized` is derived server-side from the code (uniform code format,
//     raw kept for traceability). Typing it would let the two disagree.
//   - `source_file` is provenance; a hand-keyed row is stamped 'manual-entry' by
//     the API so it stays distinguishable from an imported one.
//
// `supplier` is create-only — it is part of the identity key (supplier, category,
// code), so the PATCH schema omits it and the edit form shows it read-only.
// `wholesale_rate` stays in the SUPPLIER's currency, never NZD: the pricing
// waterfall converts downstream, and rewriting it here would double-convert.
//
// A save that MOVES the wholesale rate must carry a `reason` — the API answers
// 422 without one (requireChangeReason, recorded against the old and new rate
// in the price-history ledger), so the form collects it beside the rate.
// Restating the same rate needs nothing, which diffFields already guarantees by
// dropping an unmoved field. The rule lives in src/admin/priceChange.js.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { RATE_PRICE_KEYS, withReason } from '../admin/priceChange.js'
import {
  asAtLookup,
  dayOf,
  isDenied,
  rateHistoryPath,
  rateMove,
  sourceLabel,
} from '../admin/priceHistory.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  RATE_DELETE_CAVEAT,
  RATE_LIST_LIMIT,
  describeRate,
  rateListFilters,
  withDeleteCaveat,
} from './adminLists.js'
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
  sectionLabel,
} from '../admin/parts.jsx'

// Enums mirror the API schemas exactly — a value outside them is a 400.
const CATEGORIES = ['fabric', 'wallpaper', 'trimming', 'accessory']
const UNITS = ['metre', 'yard', 'roll', 'piece', 'hide', 'panel']
// Only the three currencies the supplier templates actually carry. NZD is
// absent on purpose: this column is the supplier's own rate, pre-conversion.
const CURRENCIES = ['EUR', 'USD', 'GBP']
const FREIGHT_CLASSES = ['A', 'B', 'C', 'D', 'E']

const IDENTITY_FIELDS = Object.freeze([
  { key: 'supplier', label: 'Supplier', kind: 'text', required: true },
])

// Editable on both create and PATCH.
const ITEM_FIELDS = Object.freeze([
  { key: 'category', label: 'Category', kind: 'enum', required: true },
  { key: 'code', label: 'Code', kind: 'text', required: true },
  { key: 'unit', label: 'Unit', kind: 'enum', required: true },
  { key: 'wholesale_rate', label: 'Wholesale rate', kind: 'decimal', required: true },
  { key: 'currency', label: 'Currency', kind: 'enum', required: true },
  // The template's Brand column. The storage keeps v1's name (19.5k rows deep, and the
  // converter's committed JSON keys on it); only the label the office reads was corrected.
  { key: 'product_range', label: 'Brand', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'contents', label: 'Contents', kind: 'text' },
  { key: 'width', label: 'Width', kind: 'text' },
  { key: 'repeat', label: 'Horizontal repeat', kind: 'text' },
  { key: 'vertical_repeat', label: 'Vertical repeat', kind: 'text' },
  { key: 'duty_class', label: 'Duty class', kind: 'text' },
  { key: 'freight_class', label: 'Freight class', kind: 'enum' },
  { key: 'date_effective', label: 'Date effective', kind: 'date' },
])

const NEW_ITEM = Object.freeze({
  supplier: '',
  category: 'fabric',
  code: '',
  unit: 'metre',
  wholesale_rate: '',
  currency: 'EUR',
  product_range: '',
  description: '',
  contents: '',
  width: '',
  repeat: '',
  vertical_repeat: '',
  duty_class: '',
  freight_class: '',
  date_effective: '',
})

const COLUMNS = '1.1fr 1fr 1.4fr 80px 1fr 90px 215px'
// The rate-history table inside an open editor: changed day, the move, the
// supplier's effective date, provenance, reason.
const HISTORY_COLUMNS = '90px 1.1fr 90px 1.4fr 1.6fr'

// A select whose options are a flat string list, with a blank first entry when
// the column is nullable.
function EnumSelect({ value, options, onChange, disabled, allowBlank, ariaLabel, style }) {
  return (
    <select
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{ ...inputStyle, ...style }}
    >
      {allowBlank && <option value="">—</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

export default function AdminPriceListItems() {
  const [term, setTerm] = useState('')
  const [draftTerm, setDraftTerm] = useState('')
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [itemDraft, setItemDraft] = useState({})
  // The change-reason note for the OPEN editor. Not part of the draft: it is
  // not a column and must never be diffed against the record.
  const [reason, setReason] = useState('')
  const [newItem, setNewItem] = useState(NEW_ITEM)
  const [showNewItem, setShowNewItem] = useState(false)

  // The paged list, the toast, the mutate-then-reload cycle and the delete flow
  // in one. `archive` is what puts "Archive instead" on a refusal — and here it
  // is also the durable removal, which is the whole point of the caveat below.
  const crud = useCrudScreen({
    path: '/admin/price-list-items',
    key: 'items',
    limit: RATE_LIST_LIMIT,
    filters: rateListFilters({ term, supplier, category, showArchived }),
    entity: 'rate',
    describe: describeRate,
    archive: (item) => apiSend('POST', `/admin/price-list-items/${item.id}/archive`, {}),
  })
  const items = crud.list.rows
  const { message, flash } = crud.toast
  const { busy, error, setError, run } = crud.mutation

  // Keep the open editor in step with a reloaded row.
  useEffect(() => {
    if (openId == null) return
    const item = items.find((x) => x.id === openId)
    if (!item) {
      setOpenId(null)
      return
    }
    setItemDraft(draftFrom(item, ITEM_FIELDS))
  }, [openId, items])

  // The kit resets the page to 1 whenever the serialised filters change, so a
  // narrower search never lands on a page past the end of its own result set.
  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const toggle = (item) => {
    setError('')
    setReason('')
    setOpenId((current) => (current === item.id ? null : item.id))
  }

  const createItem = async (event) => {
    event.preventDefault()
    const identity = bodyFrom(newItem, IDENTITY_FIELDS)
    if (identity.error) return setError(identity.error)
    const rest = bodyFrom(newItem, ITEM_FIELDS)
    if (rest.error) return setError(rest.error)
    if (rest.body.wholesale_rate <= 0) {
      // The column has a CHECK > 0; a price-on-application item is simply not
      // recorded as a rate (the importer skips those rows too).
      return setError('Wholesale rate must be greater than zero.')
    }
    const ok = await run(
      () => apiSend('POST', '/admin/price-list-items', { ...rest.body, ...identity.body }),
      (res) => `Added ${res.item.supplier} ${res.item.code}.`
    )
    if (ok) {
      setNewItem(NEW_ITEM)
      setShowNewItem(false)
    }
  }

  const saveItem = async (item) => {
    const diff = diffFields(item, itemDraft, ITEM_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.hasOwn(diff.patch, 'wholesale_rate') && diff.patch.wholesale_rate <= 0) {
      return setError('Wholesale rate must be greater than zero.')
    }
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    // A moved rate must carry its reason or the API 422s; an unmoved one must
    // not be nagged for a note about a change that is not happening.
    const noted = withReason(diff.patch, reason, RATE_PRICE_KEYS)
    if (noted.error) return setError(noted.error)
    const ok = await run(
      () => apiSend('PATCH', `/admin/price-list-items/${item.id}`, noted.patch),
      'Rate saved.'
    )
    // The note belongs to the change it explained, not to the next edit.
    if (ok) setReason('')
  }

  const archiveItem = (item) => {
    const archived = Boolean(item.archived_at)
    run(
      () =>
        apiSend(
          'POST',
          `/admin/price-list-items/${item.id}/${archived ? 'restore' : 'archive'}`,
          {}
        ),
      archived ? `${item.code} restored.` : `${item.code} archived.`
    )
  }

  const setDraft = (key) => (event) => setItemDraft((d) => ({ ...d, [key]: event.target.value }))
  const setNew = (key) => (event) => setNewItem((n) => ({ ...n, [key]: event.target.value }))

  return (
    <div>
      <PageHeader
        eyebrow="Price lists · live"
        title={<>Supplier rates</>}
        subtitle="The platform's own rate table. Rates stay in the supplier's currency — the pricing waterfall converts them downstream."
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
      <SectionTabs tabs={priceListTabs} active="rates" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Add a rate by hand"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNewItem((open) => !open)
                  setError('')
                }}
              >
                {showNewItem ? 'Cancel' : 'New rate'}
              </GhostButton>
            }
          />
          {showNewItem && (
            <form onSubmit={createItem} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }} className="r-grid-2">
                <Field label="Supplier" hint="Part of the row's identity — fixed afterwards.">
                  <input value={newItem.supplier} disabled={busy} onChange={setNew('supplier')} style={inputStyle} />
                </Field>
                <Field label="Category">
                  <EnumSelect value={newItem.category} options={CATEGORIES} disabled={busy} onChange={setNew('category')} />
                </Field>
                <Field label="Code" hint="Kept raw; the normalised form is derived server-side.">
                  <input value={newItem.code} disabled={busy} onChange={setNew('code')} style={{ ...inputStyle, fontFamily: font.mono }} />
                </Field>
                <Field label="Unit">
                  <EnumSelect value={newItem.unit} options={UNITS} disabled={busy} onChange={setNew('unit')} />
                </Field>
                <Field label="Wholesale rate" hint="In the supplier's currency, up to 4 decimals.">
                  <input
                    value={newItem.wholesale_rate}
                    inputMode="decimal"
                    placeholder="0.0000"
                    disabled={busy}
                    onChange={setNew('wholesale_rate')}
                    style={{ ...inputStyle, fontFamily: font.mono }}
                  />
                </Field>
                <Field label="Currency">
                  <EnumSelect value={newItem.currency} options={CURRENCIES} disabled={busy} onChange={setNew('currency')} />
                </Field>
                <Field label="Product range">
                  <input value={newItem.product_range} disabled={busy} onChange={setNew('product_range')} style={inputStyle} />
                </Field>
                <Field label="Description">
                  <input value={newItem.description} disabled={busy} onChange={setNew('description')} style={inputStyle} />
                </Field>
                <Field label="Contents">
                  <input value={newItem.contents} disabled={busy} onChange={setNew('contents')} style={inputStyle} />
                </Field>
                <Field label="Width">
                  <input value={newItem.width} disabled={busy} onChange={setNew('width')} style={inputStyle} />
                </Field>
                <Field label="Repeat">
                  <input value={newItem.repeat} disabled={busy} onChange={setNew('repeat')} style={inputStyle} />
                </Field>
                <Field label="Vertical repeat" hint="Pattern-match notes live here too.">
                  <input value={newItem.vertical_repeat} disabled={busy} onChange={setNew('vertical_repeat')} style={inputStyle} />
                </Field>
                <Field label="Duty class" hint="Stored raw — the broker's duty table is still owed.">
                  <input value={newItem.duty_class} disabled={busy} onChange={setNew('duty_class')} style={inputStyle} />
                </Field>
                <Field label="Freight class">
                  <EnumSelect value={newItem.freight_class} options={FREIGHT_CLASSES} allowBlank disabled={busy} onChange={setNew('freight_class')} />
                </Field>
                <Field label="Date effective">
                  <input type="date" value={newItem.date_effective} disabled={busy} onChange={setNew('date_effective')} style={inputStyle} />
                </Field>
              </div>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Add rate
                </GhostButton>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
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
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Supplier"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 180 }}
              aria-label="Filter by supplier"
            />
            <EnumSelect
              value={category}
              options={CATEGORIES}
              allowBlank
              ariaLabel="Filter by category"
              onChange={(e) => setCategory(e.target.value)}
              style={{ height: 34, fontSize: 12.5, width: 'auto' }}
            />
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          {!showNewItem && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
          {crud.list.status === 'loading' && <PanelNote>Loading rates…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && items.length === 0 && (
            <PanelNote>Nothing matches those filters.</PanelNote>
          )}

          {crud.list.status === 'ready' && items.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['Supplier', 'Code', 'Description', 'Unit', 'Wholesale', 'Effective', '']}
              />
              {items.map((item) => {
                const open = openId === item.id
                return (
                  <div key={item.id}>
                    <Row columns={COLUMNS} archived={Boolean(item.archived_at)}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.supplier}
                          {item.archived_at && <ArchivedTag />}
                        </span>
                        <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>{item.category}</span>
                      </span>
                      <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.code}</span>
                      <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.description || item.product_range || '—'}
                      </span>
                      <span style={mutedText}>{item.unit}</span>
                      <span style={monoText}>
                        {item.wholesale_rate} {item.currency}
                      </span>
                      <span style={{ ...monoText, fontSize: 11.5 }}>
                        {String(item.date_effective ?? '').slice(0, 10) || '—'}
                      </span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <GhostButton disabled={busy} onClick={() => toggle(item)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
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

                    {open && (
                      <div style={{ padding: '20px 20px 24px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }} className="r-grid-2">
                          <Field label="Supplier" hint="Part of the identity key — fixed.">
                            <input value={item.supplier} readOnly disabled style={readOnlyInput} />
                          </Field>
                          <Field label="Normalised code" hint="Derived from the code.">
                            <input value={item.code_normalized ?? ''} readOnly disabled style={{ ...readOnlyInput, fontFamily: font.mono }} />
                          </Field>
                          <Field label="Source" hint="Provenance of this row.">
                            <input value={item.source_file ?? ''} readOnly disabled style={readOnlyInput} />
                          </Field>
                          <Field label="Category">
                            <EnumSelect value={itemDraft.category} options={CATEGORIES} disabled={busy} onChange={setDraft('category')} />
                          </Field>
                          <Field label="Code">
                            <input value={itemDraft.code ?? ''} disabled={busy} onChange={setDraft('code')} style={{ ...inputStyle, fontFamily: font.mono }} />
                          </Field>
                          <Field label="Unit">
                            <EnumSelect value={itemDraft.unit} options={UNITS} disabled={busy} onChange={setDraft('unit')} />
                          </Field>
                          <Field label="Wholesale rate">
                            <input
                              value={itemDraft.wholesale_rate ?? ''}
                              inputMode="decimal"
                              disabled={busy}
                              onChange={setDraft('wholesale_rate')}
                              style={{ ...inputStyle, fontFamily: font.mono }}
                            />
                          </Field>
                          <Field label="Currency">
                            <EnumSelect value={itemDraft.currency} options={CURRENCIES} disabled={busy} onChange={setDraft('currency')} />
                          </Field>
                          <Field label="Product range">
                            <input value={itemDraft.product_range ?? ''} disabled={busy} onChange={setDraft('product_range')} style={inputStyle} />
                          </Field>
                          <Field label="Description">
                            <input value={itemDraft.description ?? ''} disabled={busy} onChange={setDraft('description')} style={inputStyle} />
                          </Field>
                          <Field label="Contents">
                            <input value={itemDraft.contents ?? ''} disabled={busy} onChange={setDraft('contents')} style={inputStyle} />
                          </Field>
                          <Field label="Width">
                            <input value={itemDraft.width ?? ''} disabled={busy} onChange={setDraft('width')} style={inputStyle} />
                          </Field>
                          <Field label="Repeat">
                            <input value={itemDraft.repeat ?? ''} disabled={busy} onChange={setDraft('repeat')} style={inputStyle} />
                          </Field>
                          <Field label="Vertical repeat">
                            <input value={itemDraft.vertical_repeat ?? ''} disabled={busy} onChange={setDraft('vertical_repeat')} style={inputStyle} />
                          </Field>
                          <Field label="Duty class">
                            <input value={itemDraft.duty_class ?? ''} disabled={busy} onChange={setDraft('duty_class')} style={inputStyle} />
                          </Field>
                          <Field label="Freight class">
                            <EnumSelect value={itemDraft.freight_class} options={FREIGHT_CLASSES} allowBlank disabled={busy} onChange={setDraft('freight_class')} />
                          </Field>
                          <Field label="Date effective">
                            <input type="date" value={itemDraft.date_effective ?? ''} disabled={busy} onChange={setDraft('date_effective')} style={inputStyle} />
                          </Field>
                          <Field
                            label="Reason for the rate change"
                            hint="Needed only when the wholesale rate moves — recorded against the old and new rate in the history."
                          >
                            <input
                              value={reason}
                              placeholder='e.g. "supplier increase"'
                              disabled={busy}
                              onChange={(e) => setReason(e.target.value)}
                              style={inputStyle}
                            />
                          </Field>
                        </div>
                        <div style={{ marginTop: 18 }}>
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveItem(item)}>
                            Save rate
                          </GhostButton>
                        </div>
                        <RateHistory item={item} />
                      </div>
                    )}
                  </div>
                )
              })}

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
            </>
          )}
        </section>
      </div>

      {/* The ask step says the removal is undone by the next import; a refusal
          keeps the API's own sentence. */}
      <ConfirmDialog {...withDeleteCaveat(crud.remove.dialog, RATE_DELETE_CAVEAT)} />
      <ToastLine message={message} />
    </div>
  )
}

// --- rate history ---------------------------------------------------------

// One rate's recorded history plus the as-at lookup, inside the open editor.
//
// FINANCE-GATED, unlike everything else on this screen: a wholesale rate is
// Atelier's buy side, so both reads sit behind `can_view_finance` and a login
// without it gets a 403 whose message says what was needed. That sentence is
// rendered as the standard masked note — muted, not an error — the same
// treatment the report library gives a masked table; the lookup is hidden with
// it, because it sits behind the same gate.
//
// Keyed on the ITEM OBJECT, not the id: every save reloads the list, the
// reloaded row is a fresh object, and refetching then is what keeps the panel
// showing the change that was just saved (the reload-not-reconcile rule).
function RateHistory({ item }) {
  const [history, setHistory] = useState({ status: 'loading', changes: [], note: '' })
  const [asAt, setAsAt] = useState('')
  const [lookup, setLookup] = useState({ status: 'idle', rate: null, note: '' })

  useEffect(() => {
    let active = true
    setHistory({ status: 'loading', changes: [], note: '' })
    apiFetch(rateHistoryPath(item.id))
      .then((body) => {
        if (active) setHistory({ status: 'ready', changes: body.changes ?? [], note: '' })
      })
      .catch((err) => {
        if (!active) return
        setHistory({
          status: isDenied(err) ? 'denied' : 'error',
          changes: [],
          note: messageOf(err, 'Could not load the rate history.'),
        })
      })
    return () => {
      active = false
    }
  }, [item])

  const lookUp = async () => {
    const built = asAtLookup(item.id, asAt)
    if (built.error) return setLookup({ status: 'error', rate: null, note: built.error })
    setLookup({ status: 'loading', rate: null, note: '' })
    try {
      const body = await apiFetch(built.path)
      setLookup({ status: 'ready', rate: body.rate ?? null, note: '' })
    } catch (err) {
      // A 404 here is an ANSWER, not a fault: the API names which kind of miss
      // it is (the rate has never moved, or the ledger starts later). Only a
      // network drop or a real fault is drawn as an error.
      setLookup({
        status: isDenied(err) || err?.status === 404 ? 'noted' : 'error',
        rate: null,
        note: messageOf(err, 'Could not look that rate up.'),
      })
    }
  }

  return (
    <div style={{ marginTop: 26 }}>
      <span style={sectionLabel}>Rate history</span>
      <div style={{ ...panel, marginTop: 12 }}>
        {history.status === 'loading' && <PanelNote>Loading rate history…</PanelNote>}
        {history.status === 'denied' && <PanelNote>{history.note}</PanelNote>}
        {history.status === 'error' && <PanelNote tone="danger">{history.note}</PanelNote>}
        {history.status === 'ready' && history.changes.length === 0 && (
          <PanelNote>
            No recorded changes — the ledger starts the first time this rate moves.
          </PanelNote>
        )}
        {history.status === 'ready' && history.changes.length > 0 && (
          <>
            <HeaderRow
              columns={HISTORY_COLUMNS}
              labels={['Changed', 'Rate', 'Effective', 'Source', 'Reason']}
            />
            {history.changes.map((change) => (
              <Row key={change.id} columns={HISTORY_COLUMNS}>
                <span style={{ ...monoText, fontSize: 11.5 }}>{dayOf(change.changed_at)}</span>
                <span style={monoText}>{rateMove(change)}</span>
                <span style={{ ...monoText, fontSize: 11.5 }}>
                  {change.date_effective ?? '—'}
                </span>
                <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sourceLabel(change)}
                </span>
                <span style={{ ...mutedText, minWidth: 0 }}>{change.reason ?? '—'}</span>
              </Row>
            ))}
          </>
        )}
        {history.status === 'ready' && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '14px 20px' }}>
              <span style={{ ...mutedText, whiteSpace: 'nowrap' }}>What was the rate on</span>
              <input
                type="date"
                value={asAt}
                disabled={lookup.status === 'loading'}
                onChange={(e) => {
                  setAsAt(e.target.value)
                  // A new date makes the old answer a claim about the wrong day.
                  setLookup({ status: 'idle', rate: null, note: '' })
                }}
                aria-label="Look up the rate as at"
                style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 170 }}
              />
              <GhostButton disabled={lookup.status === 'loading'} onClick={lookUp}>
                Look up
              </GhostButton>
            </div>
            {lookup.status === 'noted' && (
              <div style={{ padding: '0 20px 16px', ...mutedText, lineHeight: 1.55 }}>{lookup.note}</div>
            )}
            {lookup.status === 'error' && (
              <ErrorLine style={{ padding: '0 20px 16px' }}>{lookup.note}</ErrorLine>
            )}
            {lookup.status === 'ready' && lookup.rate && (
              <div style={{ padding: '0 20px 16px', fontSize: 13, color: c.ink, fontFamily: font.ui, lineHeight: 1.6 }}>
                <span style={{ fontFamily: font.mono }}>
                  {lookup.rate.wholesale_rate} {lookup.rate.currency}
                </span>{' '}
                as at {lookup.rate.as_at} — set {dayOf(lookup.rate.changed_at)},{' '}
                {sourceLabel(lookup.rate)}
                {lookup.rate.reason ? ` · ${lookup.rate.reason}` : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
