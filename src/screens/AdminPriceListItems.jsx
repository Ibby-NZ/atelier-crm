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

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
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
  monoText,
  mutedText,
  panel,
  readOnlyInput,
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

  const saveItem = (item) => {
    const diff = diffFields(item, itemDraft, ITEM_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.hasOwn(diff.patch, 'wholesale_rate') && diff.patch.wholesale_rate <= 0) {
      return setError('Wholesale rate must be greater than zero.')
    }
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    run(() => apiSend('PATCH', `/admin/price-list-items/${item.id}`, diff.patch), 'Rate saved.')
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
                        </div>
                        <div style={{ marginTop: 18 }}>
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveItem(item)}>
                            Save rate
                          </GhostButton>
                        </div>
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
