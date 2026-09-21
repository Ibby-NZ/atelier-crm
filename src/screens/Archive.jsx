import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { c, font, radius } from '../theme.js'
import { PageHeader, AttributePill, SecondaryButton } from '../components/ui.jsx'
import LegacyImportPanel from '../components/LegacyImportPanel.jsx'
import DynamicsCorrection from '../components/DynamicsCorrection.jsx'
import Pagination from '../admin/Pagination.jsx'
import { pageCount } from '../admin/list.js'
import { GhostButton, Select, cellInput, mutedText, monoText } from '../admin/parts.jsx'
import { apiFetch, ApiError } from '../lib/api.js'
import {
  DEFAULT_ENTITY,
  ENTITY_GROUPS,
  ENTITY_LABELS,
  NO_VALUE_OPS,
  PAGE_LIMIT,
  chooserColumns,
  defaultColumns,
  filterReady,
  formatCell,
  labelFor,
  nextSort,
  operatorsFor,
  recordScreenPath,
  recordTitle,
  viewFromSearch,
  viewQuery,
} from './archive.js'

// Archive — everything Atelier held in Dynamics 365, in one place. Twelve
// entities off GET /admin/dynamics/:entity, every column filterable, the view
// carried in the URL so a filtered list can be bookmarked or sent to a colleague.
//
// This screen REPLACES the four Dynamics mirror lists that used to sit inside
// the live sections (Orders → Dynamics (historical), Stock → Dynamics
// (historical), Clients → Dynamics mirror, Pricing → Price lists): going live
// means the working sections are live-only and the incumbent's data is the
// archive it now is. Those routes redirect here (App.jsx). Corrections are
// still made through <DynamicsCorrection>, mounted in the record drawer for the
// four entities the API lets the office correct; the two older per-record
// screens (ClientAccount, SalesOrder) stay reachable from the drawer.
//
// All the rules — labels, default columns, operator vocabulary, URL form —
// live in ./archive.js with a test beside them; this file is layout.

const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, whiteSpace: 'nowrap' }
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }
const control = { ...cellInput, width: 'auto', minWidth: 140 }
const box = { border: `1px solid ${c.line}`, borderRadius: radius.xs, background: c.surface }

const SEARCH_INPUT = { height: 38, width: 320, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 13, outline: 'none' }
const SEARCH_BUTTON = { height: 38, padding: '0 16px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, color: c.ink, fontFamily: font.ui, fontSize: 13, cursor: 'pointer' }

export default function Archive() {
  const { entity: routeEntity } = useParams()
  const entity = routeEntity && ENTITY_LABELS[routeEntity] ? routeEntity : DEFAULT_ENTITY
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = useMemo(() => viewFromSearch(searchParams), [searchParams])

  // The describe read: every entity's columns and count. Fetched once.
  const [catalogue, setCatalogue] = useState(null)
  const [catalogueError, setCatalogueError] = useState('')
  useEffect(() => {
    let active = true
    apiFetch('/admin/dynamics')
      .then((body) => { if (active) setCatalogue(body.entities) })
      .catch((err) => { if (active) setCatalogueError(err instanceof ApiError ? err.message : 'Could not load the archive.') })
    return () => { active = false }
  }, [])

  const meta = catalogue?.find((item) => item.entity === entity) ?? null
  const columns = meta?.columns ?? []
  const typeOf = useMemo(() => Object.fromEntries(columns.map((col) => [col.name, col.type])), [columns])

  // Draft filter rows live here; the URL only ever holds the complete ones.
  // Re-synced whenever the URL moves (entity change, Apply, back button), never
  // while a row is being typed.
  const [drafts, setDrafts] = useState(view.filters)
  const [q, setQ] = useState(view.q)
  useEffect(() => { setDrafts(view.filters); setQ(view.q) }, [view])

  const [shown, setShown] = useState(null) // column names, or null = entity default
  const [chooserOpen, setChooserOpen] = useState(false)
  const [selected, setSelected] = useState(null) // guid of the open record
  const [importing, setImporting] = useState(false)
  useEffect(() => { setShown(null); setChooserOpen(false); setSelected(null); setImporting(false) }, [entity])
  const shownColumns = shown ?? defaultColumns(entity, columns)

  const [data, setData] = useState({ items: [], total: 0, sort: null })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick((tick) => tick + 1), [])
  const query = viewQuery({ ...view, limit: PAGE_LIMIT })

  useEffect(() => {
    let active = true
    setStatus('loading')
    apiFetch(`/admin/dynamics/${entity}${query ? `?${query}` : ''}`)
      .then((body) => {
        if (!active) return
        setData({ items: body.items ?? [], total: body.meta?.total ?? 0, sort: body.meta?.sort ?? null })
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Could not load the archive.')
        setStatus('error')
      })
    return () => { active = false }
  }, [entity, query, reloadTick])

  const commit = (next) => setSearchParams(viewQuery({ ...view, page: 1, ...next }))
  const setPage = (page) => setSearchParams(viewQuery({ ...view, page }))
  const applyFilters = (rows) => { setDrafts(rows); commit({ filters: rows }) }
  const submitSearch = (event) => { event.preventDefault(); commit({ q }) }
  const sortBy = (column) => commit(nextSort({ sort: view.sort || data.sort?.column, dir: view.dir || data.sort?.dir }, column))

  const totalPages = pageCount(data.total, PAGE_LIMIT)
  const activeFilters = view.filters.length + (view.q ? 1 : 0)
  const sortState = { column: view.sort || data.sort?.column, dir: view.dir || data.sort?.dir }

  return (
    <>
      <PageHeader
        eyebrow="Archive · from Dynamics 365"
        title="Archive"
        subtitle={catalogue
          ? `${catalogue.reduce((sum, item) => sum + item.total, 0).toLocaleString('en-NZ')} records across ${catalogue.length} Dynamics tables, read-only. Filter on any column; the view is in the address bar, so it can be bookmarked.`
          : 'Everything Atelier held in Dynamics 365, read-only.'}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search every text field of ${ENTITY_LABELS[entity].toLowerCase()}`} style={SEARCH_INPUT} aria-label="Search" />
              <button type="submit" className="ab-t" style={SEARCH_BUTTON}>Search</button>
            </form>
            <SecondaryButton size="sm" onClick={() => setImporting((open) => !open)}>{importing ? 'Close import' : 'Import'}</SecondaryButton>
          </div>
        }
      />

      {catalogueError && <div role="alert" style={{ marginTop: 18, fontSize: 12.5, color: c.clay }}>{catalogueError}</div>}

      <EntityPicker catalogue={catalogue} entity={entity} onPick={(next) => navigate(`/archive/${next}`)} />

      {importing && (
        <LegacyImportPanel entity={entity} title={`Load ${ENTITY_LABELS[entity].toLowerCase()} from the Dynamics export`} fileHint={`${entity}.json.gz`} onImported={reload} />
      )}

      <FilterBar
        columns={columns}
        typeOf={typeOf}
        entity={entity}
        drafts={drafts}
        onChange={setDrafts}
        onApply={() => applyFilters(drafts)}
        onClear={() => { setQ(''); setDrafts([]); setSearchParams('') }}
        activeCount={activeFilters}
        chooser={{ open: chooserOpen, toggle: () => setChooserOpen((open) => !open), columns: chooserColumns(columns), shown: shownColumns, onShown: setShown, reset: () => setShown(null) }}
      />

      <div style={{ marginTop: 16, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: shownColumns.length * 150 }}>
          <thead>
            <tr style={{ background: c.surfaceDeep }}>
              {shownColumns.map((name) => (
                <th key={name} style={{ textAlign: typeOf[name] === 'numeric' ? 'right' : 'left', padding: '11px 14px', borderBottom: `1px solid ${c.line}` }}>
                  <button type="button" onClick={() => sortBy(name)} className="ab-t" aria-sort={sortState.column === name ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                    style={{ ...hCell, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: sortState.column === name ? c.ink : c.muted, fontFamily: font.ui }}>
                    {labelFor(name)}{sortState.column === name ? (sortState.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {status === 'loading' && <tr><td colSpan={shownColumns.length} style={{ padding: '18px 14px', ...mutedText, fontStyle: 'italic' }}>Loading {ENTITY_LABELS[entity].toLowerCase()}…</td></tr>}
            {status === 'error' && <tr><td colSpan={shownColumns.length} role="alert" style={{ padding: '18px 14px', fontSize: 12.5, color: c.clay }}>{error}</td></tr>}
            {status === 'ready' && data.items.length === 0 && <tr><td colSpan={shownColumns.length} style={{ padding: '18px 14px', ...mutedText, fontStyle: 'italic' }}>Nothing in {ENTITY_LABELS[entity].toLowerCase()} matches.</td></tr>}
            {status === 'ready' && data.items.map((row) => (
              <tr key={row.guid} className="ab-rowhover ab-t" onClick={() => setSelected(row.guid)} style={{ cursor: 'pointer', borderBottom: `1px solid ${c.line}`, background: selected === row.guid ? c.surface : undefined }}>
                {shownColumns.map((name) => (
                  <td key={name} title={row[name] == null ? '' : String(row[name])} style={{ ...cell, padding: '10px 14px', textAlign: typeOf[name] === 'numeric' ? 'right' : 'left', fontFamily: typeOf[name] === 'numeric' || typeOf[name] === 'timestamp' ? font.mono : font.ui, fontSize: typeOf[name] === 'numeric' ? 12 : 12.5 }}>
                    {formatCell(row[name], typeOf[name])}
                    {row.overridden_fields?.includes(name) && <span title="Corrected in the CRM" style={{ marginLeft: 6, color: c.accent }}>●</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: c.muted }}>
          {data.total.toLocaleString('en-NZ')} {ENTITY_LABELS[entity].toLowerCase()}{activeFilters ? ' matching' : ''} · <AttributePill style={{ fontSize: 9.5, padding: '2px 7px' }}>read-only from Dynamics</AttributePill>
          {' '}<span style={{ color: c.accent }}>●</span> corrected in the CRM
        </span>
        <Pagination page={view.page} totalPages={totalPages} total={data.total} unit="records" onPage={setPage} busy={status === 'loading'} />
      </div>

      {selected && meta && (
        <RecordDrawer entity={entity} guid={selected} meta={meta} onClose={() => setSelected(null)} onSaved={reload} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function EntityPicker({ catalogue, entity, onPick }) {
  const countOf = (name) => catalogue?.find((item) => item.entity === name)?.total
  return (
    <div style={{ marginTop: 20, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {ENTITY_GROUPS.map((group) => (
        <div key={group.label}>
          <div style={{ ...hCell, marginBottom: 6 }}>{group.label}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {group.entities.map((name) => {
              const on = name === entity
              return (
                <button key={name} type="button" onClick={() => onPick(name)} className="ab-t" aria-pressed={on}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: radius.pill, background: on ? c.paper : c.surface, color: on ? c.ink : c.inkSoft, fontFamily: font.ui, fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: 'pointer' }}>
                  {ENTITY_LABELS[name]}
                  <span style={{ ...monoText, fontSize: 10.5, color: c.muted }}>{countOf(name)?.toLocaleString('en-NZ') ?? '…'}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function FilterBar({ columns, typeOf, entity, drafts, onChange, onApply, onClear, activeCount, chooser }) {
  const ordered = chooserColumns(columns)
  const update = (index, patch) => onChange(drafts.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const remove = (index) => { const rows = drafts.filter((_, i) => i !== index); onChange(rows) }
  const add = () => {
    const first = ordered[0]?.name ?? ''
    onChange([...drafts, { column: first, op: operatorsFor(typeOf[first])[0].value, value: '' }])
  }
  const changeColumn = (index, column) => update(index, { column, op: operatorsFor(typeOf[column])[0].value, value: '' })
  const ready = drafts.every(filterReady)

  return (
    <div style={{ ...box, marginTop: 18, padding: '12px 14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {drafts.map((row, index) => (
          <FilterRow key={index} row={row} type={typeOf[row.column]} entity={entity} columns={ordered}
            onColumn={(column) => changeColumn(index, column)} onOp={(op) => update(index, { op, value: NO_VALUE_OPS.has(op) ? '' : row.value })} onValue={(value) => update(index, { value })} onRemove={() => remove(index)} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: drafts.length ? 10 : 0 }}>
        <GhostButton onClick={add} disabled={columns.length === 0}>+ Add filter</GhostButton>
        {drafts.length > 0 && <GhostButton tone="accent" onClick={onApply} disabled={!ready}>Apply</GhostButton>}
        {(activeCount > 0 || drafts.length > 0) && <GhostButton onClick={onClear}>Clear all</GhostButton>}
        <span style={{ flex: 1 }} />
        <span style={mutedText}>{activeCount ? `${activeCount} active` : 'No filters'}</span>
        <GhostButton onClick={chooser.toggle} aria-expanded={chooser.open}>Columns ({chooser.shown.length})</GhostButton>
      </div>
      {chooser.open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.line}`, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {chooser.columns.map((column) => {
            const on = chooser.shown.includes(column.name)
            return (
              <label key={column.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: c.inkSoft, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => chooser.onShown(on ? chooser.shown.filter((name) => name !== column.name) : [...chooser.shown, column.name])} />
                {labelFor(column.name)}
              </label>
            )
          })}
          <GhostButton onClick={chooser.reset} style={{ marginLeft: 'auto' }}>Default columns</GhostButton>
        </div>
      )}
    </div>
  )
}

function FilterRow({ row, type, entity, columns, onColumn, onOp, onValue, onRemove }) {
  const needsValue = !NO_VALUE_OPS.has(row.op)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Select value={row.column} onChange={(e) => onColumn(e.target.value)} style={control} aria-label="Column">
        {columns.map((column) => <option key={column.name} value={column.name}>{labelFor(column.name)}</option>)}
      </Select>
      <Select value={row.op} onChange={(e) => onOp(e.target.value)} style={{ ...control, minWidth: 120 }} aria-label="Operator">
        {operatorsFor(type).map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
      </Select>
      {needsValue && <ValueInput row={row} type={type} entity={entity} onValue={onValue} />}
      <GhostButton onClick={onRemove} aria-label="Remove filter">×</GhostButton>
    </div>
  )
}

// The value control per type. Text columns get a datalist of the column's
// distinct values (GET …/facets), so "is one of" can be built by picking.
function ValueInput({ row, type, entity, onValue }) {
  const [facets, setFacets] = useState([])
  const wantsFacets = type === 'text' || type === 'boolean'
  useEffect(() => {
    if (!wantsFacets) return undefined
    let active = true
    apiFetch(`/admin/dynamics/${entity}/facets?column=${encodeURIComponent(row.column)}`)
      .then((body) => { if (active) setFacets(body.values ?? []) })
      .catch(() => { if (active) setFacets([]) })
    return () => { active = false }
  }, [entity, row.column, wantsFacets])

  if (type === 'boolean') {
    return (
      <Select value={row.value} onChange={(e) => onValue(e.target.value)} style={{ ...control, minWidth: 100 }} aria-label="Value">
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    )
  }
  const listId = `facets-${entity}-${row.column}`
  const inputType = type === 'numeric' ? 'number' : type === 'date' ? 'date' : type === 'timestamp' ? 'datetime-local' : 'text'
  return (
    <>
      <input type={inputType} step={type === 'numeric' ? 'any' : undefined} value={row.value} onChange={(e) => onValue(e.target.value)} list={type === 'text' ? listId : undefined}
        placeholder={row.op === 'in' ? 'value, value, value' : 'value'} style={{ ...control, minWidth: 200 }} aria-label="Value" />
      {type === 'text' && facets.length > 0 && (
        <datalist id={listId}>
          {facets.map((facet) => <option key={String(facet.value)} value={String(facet.value)}>{`${facet.count.toLocaleString('en-NZ')} records`}</option>)}
        </datalist>
      )}
      {type === 'text' && facets.length > 0 && row.op === 'in' && (
        <Select value="" onChange={(e) => { if (e.target.value) onValue(row.value ? `${row.value},${e.target.value}` : e.target.value) }} style={{ ...control, minWidth: 120 }} aria-label="Add a value">
          <option value="">+ pick…</option>
          {facets.map((facet) => <option key={String(facet.value)} value={String(facet.value)}>{facet.value} ({facet.count.toLocaleString('en-NZ')})</option>)}
        </Select>
      )}
    </>
  )
}

// One record, every field, with the correction panel where the API offers one.
function RecordDrawer({ entity, guid, meta, onClose, onSaved }) {
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const typeOf = useMemo(() => Object.fromEntries(meta.columns.map((col) => [col.name, col.type])), [meta])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    let active = true
    apiFetch(`/admin/dynamics/${entity}/${guid}`)
      .then((body) => { if (active) { setRecord(body.record); setError('') } })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : 'Could not load the record.') })
    return () => { active = false }
  }, [entity, guid, tick])
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const screen = recordScreenPath(entity, guid)
  const fields = chooserColumns(meta.columns)

  return (
    <aside role="dialog" aria-modal="true" aria-label="Record" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 92vw)', background: c.paper, borderLeft: `1px solid ${c.line}`, boxShadow: '0 16px 40px -8px rgba(17,27,79,.18)', zIndex: 30, overflowY: 'auto', padding: '24px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={hCell}>{ENTITY_LABELS[entity]} · Dynamics 365</div>
          <h2 style={{ margin: '6px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 22, color: c.ink, lineHeight: 1.2 }}>{record ? recordTitle(entity, record) : '…'}</h2>
          <div style={{ ...monoText, fontSize: 10.5, marginTop: 4 }}>{guid}</div>
        </div>
        <GhostButton onClick={onClose} aria-label="Close">Close</GhostButton>
      </div>

      {error && <div role="alert" style={{ marginTop: 16, fontSize: 12.5, color: c.clay }}>{error}</div>}

      {record && (
        <>
          {(screen || record.overridden_fields?.length > 0) && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {record.overridden_fields?.length > 0 && <AttributePill style={{ color: c.accent, borderColor: c.accent }}>{record.overridden_fields.length} field{record.overridden_fields.length === 1 ? '' : 's'} corrected</AttributePill>}
              {screen && <Link to={screen} style={{ fontSize: 12.5, color: c.accent }}>Open full record →</Link>}
            </div>
          )}

          <dl style={{ margin: '18px 0 0', display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 2fr', gap: '7px 14px', fontSize: 12.5 }}>
            {fields.map((column) => (
              <FieldPair key={column.name} label={labelFor(column.name)} value={formatCell(record[column.name], column.type)} mono={typeOf[column.name] !== 'text'} corrected={record.overridden_fields?.includes(column.name)} empty={record[column.name] == null || record[column.name] === ''} />
            ))}
          </dl>

          {meta.read_entity && (
            <div style={{ marginTop: 24 }}>
              <DynamicsCorrection entity={meta.read_entity} guid={guid} onSaved={() => { setTick((t) => t + 1); onSaved() }} />
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <GhostButton onClick={() => setShowRaw((open) => !open)} aria-expanded={showRaw}>{showRaw ? 'Hide' : 'Show'} source row as exported</GhostButton>
            {showRaw && (
              <pre style={{ marginTop: 10, padding: 12, background: c.surface, border: `1px solid ${c.line}`, borderRadius: radius.xs, fontFamily: font.mono, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: c.inkSoft }}>
                {JSON.stringify(record.raw ?? {}, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </aside>
  )
}

function FieldPair({ label, value, mono, corrected, empty }) {
  return (
    <>
      <dt style={{ color: c.muted, fontFamily: font.ui, paddingTop: 2 }}>{label}{corrected && <span title="Corrected in the CRM" style={{ marginLeft: 6, color: c.accent }}>●</span>}</dt>
      <dd style={{ margin: 0, color: empty ? c.muted : c.ink, fontFamily: mono ? font.mono : font.ui, fontSize: mono ? 12 : 12.5, wordBreak: 'break-word' }}>{value}</dd>
    </>
  )
}
