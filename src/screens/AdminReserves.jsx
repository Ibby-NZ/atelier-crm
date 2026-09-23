// Reserves & cuttings — LIVE, the docket list replacing the D365 fulmar_reserve
// and cutting forms.
//
//   GET    /admin/reserves?q=&kind=&status=&supplier=&include_done=&page=  → { reserves, meta }
//   GET    /admin/reserves/suppliers                                      → { suppliers }
//   DELETE /admin/reserves/:id                                            → lifecycle envelope
//
// The unit on screen is the DOCKET (one account's visit to the form) — the
// account-first shape the office asked for — one row each, with the shape of its
// lines summed up (docketSummary) and any hold date that has passed named on the
// row, because the lines themselves are no longer drawn here.
//
// One docket OPENS ON ITS OWN PAGE (AdminReserve, /admin/reserves/:id — 23 Sep
// 2026, client asked: "for any kind of data entry … they will open in their own
// individual page instead of a tabbed drop down"). The docket's fields, its
// lines, each line's editor, the moves, "+ Cutting" and line delete all used to
// open in place under the row here, and one busy docket pushed every other
// account's off the screen. This screen is the list, the filters and the one
// lifecycle verb a docket row carries: Delete, through the kit, greyed unless
// every line on the docket could go (the API's 409 stays the gate).
//
// `expired` and every date shown here are the API's values; nothing in this
// file or ./reserveFlow.js constructs a Date (the sample register's clock
// rule, held by a source scan in reserveFlow.test.js).
//
// Layout only: every rule lives in ./reserveFlow.js, tested beside it.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import { safeFetch } from '../lib/api.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import Pagination from '../admin/Pagination.jsx'
import {
  Select,
  GhostButton,
  HeaderRow,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  monoText,
  mutedText,
  panel,
  PanelHead,
} from '../admin/parts.jsx'
import {
  RESERVES_PATH,
  RESERVE_SUPPLIERS_PATH,
  LINE_KINDS,
  LINE_STATUSES,
  describeReserve,
  docketAttention,
  docketSummary,
  isDeletableDocket,
  kindLabel,
  reserveFilters,
  reservePath,
  reserveRoute,
  statusLabel,
} from './reserveFlow.js'

const LIST_LIMIT = 25

const COLUMNS = '90px 1.5fr 1fr 1.7fr 170px'

export default function AdminReserves() {
  // Text filters are submit-driven (`draft` → `term`), never keyed per
  // keystroke — useAdminList refetches on every serialized-filter change.
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [supplier, setSupplier] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [suppliers, setSuppliers] = useState([])

  const crud = useCrudScreen({
    path: RESERVES_PATH,
    key: 'reserves',
    limit: LIST_LIMIT,
    filters: reserveFilters({ term, kind, status, supplier, showDone }),
    // The row's one lifecycle verb. A LINE is deleted on the docket's page,
    // with its own dialog; this one only ever names a docket.
    entity: 'docket',
    describe: describeReserve,
    deletePath: (row) => reservePath(row.id),
  })

  // Nothing on this screen writes except the delete, which the kit runs — so
  // crud.mutation goes unused here, deliberately (the precedent AdminBrands set).
  const dockets = crud.list.rows

  // The report picker's facet doubles as the filter's option list. safeFetch:
  // a failed <select> must not take the list down.
  useEffect(() => {
    let active = true
    safeFetch(RESERVE_SUPPLIERS_PATH).then(({ data }) => {
      if (active && data?.suppliers) setSuppliers(data.suppliers)
    })
    return () => {
      active = false
    }
  }, [])

  const applyTerm = (event) => {
    event?.preventDefault()
    setTerm(draftTerm)
  }

  const filtered = Boolean(term || kind || status || supplier || showDone)
  const clearFilters = () => {
    setDraftTerm('')
    setTerm('')
    setKind('')
    setStatus('')
    setSupplier('')
    setShowDone(false)
  }

  const selectStyle = { ...cellInput, fontSize: 12.5 }

  return (
    <div>
      <PageHeader
        eyebrow="Stock · live"
        title={<>Reserves &amp; cuttings</>}
        subtitle="What each account has asked the houses to hold or cut, entered account-first. Open a docket to type the house's reply onto its lines and move them on. The supplier report, under Suppliers, is the sheet each house is sent."
      />
      <SectionTabs tabs={stockTabs} active="live" />

      <div style={{ display: 'grid', gap: 18, marginTop: 30 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <form onSubmit={applyTerm} style={{ display: 'flex', gap: 10 }}>
            <input
              value={draftTerm}
              onChange={(e) => setDraftTerm(e.target.value)}
              placeholder="Account, design, code, colour or reference"
              aria-label="Search reserves"
              style={{ ...selectStyle, width: 280 }}
            />
            <GhostButton type="submit" disabled={crud.list.status === 'loading'}>
              Search
            </GhostButton>
          </form>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" style={selectStyle}>
            <option value="">All kinds</option>
            {LINE_KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabel(value)}s
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={selectStyle}>
            <option value="">All statuses</option>
            {LINE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </Select>
          <Select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            aria-label="Supplier"
            style={selectStyle}
          >
            <option value="">All suppliers</option>
            {suppliers.map((row) => (
              <option key={row.supplier} value={row.supplier}>
                {row.supplier} ({row.open_lines} open)
              </option>
            ))}
          </Select>
          <label style={{ ...mutedText, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show closed dockets
          </label>
          {filtered && (
            <GhostButton onClick={clearFilters} disabled={crud.list.status === 'loading'}>
              Clear filters
            </GhostButton>
          )}
        </div>

        {crud.list.status === 'loading' && <PanelNote>Loading reserves…</PanelNote>}
        {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
        {crud.list.status === 'ready' && dockets.length === 0 && (
          <PanelNote>
            Nothing here yet. Raise the first docket with “New reserve / cutting” above — or run
            the API&apos;s <span style={monoText}>npm run seed:reserves</span> for demo data.
          </PanelNote>
        )}

        {crud.list.status === 'ready' && dockets.length > 0 && (
          <section style={panel}>
            <PanelHead
              label="Dockets"
              right={
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {crud.list.total.toLocaleString('en-NZ')} total
                </span>
              }
            />
            <HeaderRow columns={COLUMNS} labels={['Docket', 'Account', 'Owner', 'Lines', '']} />
            {dockets.map((docket) => {
              const attention = docketAttention(docket)
              return (
                <Row key={docket.id} columns={COLUMNS}>
                  <span style={monoText}>#{docket.id}</span>
                  <span style={{ minWidth: 0 }}>
                    <Link
                      to={reserveRoute(docket.id)}
                      className="ab-link"
                      style={{ display: 'block', fontSize: 13, color: c.ink, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {docket.account_name}
                    </Link>
                    {docket.contact_name && (
                      <span style={{ ...mutedText, display: 'block', fontSize: 11 }}>attn {docket.contact_name}</span>
                    )}
                  </span>
                  <span style={{ ...mutedText, fontSize: 12 }}>{docket.owner_name ?? '—'}</span>
                  <span style={{ fontSize: 12.5, color: c.inkSoft, minWidth: 0 }}>
                    {docketSummary(docket)}
                    {attention && (
                      <span style={{ display: 'block', fontSize: 11, color: c.clay, fontWeight: 600 }}>{attention}</span>
                    )}
                  </span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={reserveRoute(docket.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    <GhostButton
                      tone="danger"
                      disabled={!isDeletableDocket(docket)}
                      onClick={() => crud.remove.ask(docket)}
                    >
                      Delete
                    </GhostButton>
                  </span>
                </Row>
              )
            })}
          </section>
        )}

        <Pagination
          page={crud.list.page}
          totalPages={crud.list.totalPages}
          total={crud.list.total}
          unit="dockets"
          onPage={crud.list.setPage}
          busy={crud.list.status === 'loading'}
        />
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={crud.toast.message} />
    </div>
  )
}
