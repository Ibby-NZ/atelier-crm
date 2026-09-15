// Sample orders — showroom stocking, wired to atelier-api's
// /admin/sample-orders. Live: it reads AND writes real rows.
//
//   GET    /admin/sample-orders?q=&status=&showroom_id=&supplier_id=&include_archived=&page=&limit=
//                                     → { sample_orders, meta: { total, page, limit } }
//   GET    /admin/sample-orders/:id   → { sample_order }
//   POST   /admin/sample-orders       → { sample_order }  (201, always `requested`)
//   PATCH  /admin/sample-orders/:id   → { sample_order }  (never `status`)
//   POST   /admin/sample-orders/:id/transition  { status } → { sample_order }
//   POST   /admin/sample-orders/:id/archive|restore
//   DELETE /admin/sample-orders/:id   → 200, or 409 unless requested/cancelled
//
// An order advances requested → ordered → in_transit → received → displayed,
// with cancelled reachable until a terminal state. The machine lives in
// sampleFlow.js, mirroring the API's sample-order-states.js, so the screen
// never offers a move the API would 409 — and Delete is greyed outside
// requested/cancelled rather than discovered as a refusal.
//
// Everything that is a decision lives in sampleFlow.js with a vitest test
// beside it; this file is layout, because there is no jsdom in this repo.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { apiSend, safeFetch } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import {
  Select,
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
  mutedText,
  panel,
} from '../admin/parts.jsx'
import { SHOWROOMS_PATH } from './adminShowrooms.js'
import {
  NEW_SAMPLE_ORDER,
  SAMPLE_ORDERS_PATH,
  SAMPLE_ORDER_FIELDS,
  SAMPLE_ORDER_LIST_LIMIT,
  SAMPLE_ORDER_STATUSES,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  availableMoves,
  describeSampleOrder,
  isDeletableStatus,
  orderMeta,
  orderTitle,
  sampleOrderFilters,
  sampleOrderPath,
  stampDate,
  stampEntries,
  statusLabel,
  statusTone,
  transitionPath,
} from './sampleFlow.js'

const COLUMNS = '1.8fr 1.2fr 130px 1fr 300px'
const PICKER_LIMIT = 200

export default function AdminSampleOrders() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('')
  const [showroomId, setShowroomId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState({})
  const [newOrder, setNewOrder] = useState(NEW_SAMPLE_ORDER)
  const [showNew, setShowNew] = useState(false)
  const [showrooms, setShowrooms] = useState([])
  const [suppliers, setSuppliers] = useState([])

  const { list, toast, mutation, remove } = useCrudScreen({
    path: SAMPLE_ORDERS_PATH,
    key: 'sample_orders',
    limit: SAMPLE_ORDER_LIST_LIMIT,
    filters: sampleOrderFilters({ term, status, showroomId, showArchived }),
    entity: 'sample order',
    describe: describeSampleOrder,
    // Enables "Archive instead" on a blocked delete: an order past `requested`
    // is a commercial record — the house was asked for something — so the API
    // refuses the delete and archiving is the only way it leaves this list.
    archive: (row) => apiSend('POST', archiveInsteadPath(row), {}),
  })
  const { busy, error, setError, run } = mutation

  // The two <select> sources. Read once — a showroom or supplier added
  // mid-session is picked up on the next visit, the same lifetime every other
  // picker in this repo has. safeFetch never throws: a picker that failed to
  // load leaves an empty <select>, which must not take the whole list down.
  useEffect(() => {
    let active = true
    safeFetch(`${SHOWROOMS_PATH}?limit=${PICKER_LIMIT}`).then(({ data }) => {
      if (active && data?.showrooms) setShowrooms(data.showrooms)
    })
    safeFetch(`/admin/suppliers?limit=${PICKER_LIMIT}`).then(({ data }) => {
      if (active && data?.suppliers) setSuppliers(data.suppliers)
    })
    return () => {
      active = false
    }
  }, [])

  // Keep the open editor in step with a reloaded row; close it if the row is gone.
  useEffect(() => {
    if (openId == null) return
    const row = list.rows.find((x) => x.id === openId)
    if (!row) {
      setOpenId(null)
      return
    }
    setDraft(draftFrom(row, SAMPLE_ORDER_FIELDS))
  }, [openId, list.rows])

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const toggleRow = (row) => {
    setError('')
    setOpenId((current) => (current === row.id ? null : row.id))
  }

  const createOrder = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newOrder, SAMPLE_ORDER_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', SAMPLE_ORDERS_PATH, built.body),
      (res) => `${orderTitle(res.sample_order)} requested.`
    )
    if (ok) {
      setNewOrder(NEW_SAMPLE_ORDER)
      setShowNew(false)
    }
  }

  const saveOrder = (row) => {
    const diff = diffFields(row, draft, SAMPLE_ORDER_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return toast.flash('No changes to save.')
    run(() => apiSend('PATCH', sampleOrderPath(row.id), diff.patch), 'Sample order saved.')
  }

  // The move. The buttons come from the mirrored machine, so a 409 here means
  // the row moved under us — the reload shows where it actually is.
  const moveOrder = (row, move) => {
    run(
      () => apiSend('POST', transitionPath(row), { status: move.key }),
      `Moved to ${statusLabel(move.key)}.`
    )
  }

  const archiveOrder = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archiveTogglePath(row), {}),
      `${describeSampleOrder(row) ?? 'That sample order'} ${
        verb === 'archive' ? 'archived' : 'restored'
      }.`
    )
  }

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const setNewField = (key) => (event) =>
    setNewOrder((n) => ({ ...n, [key]: event.target.value }))

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Sample orders</>}
        subtitle="Material requested from the houses for the showrooms, advanced through its lifecycle as it ships and arrives. A move stamps the date it happened."
        right={
          <CheckField
            label="Show archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
        }
      />
      <SectionTabs tabs={samplesTabs} active="orders" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Request sample material"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNew((open) => !open)
                  setError('')
                }}
              >
                {showNew ? 'Cancel' : 'New request'}
              </GhostButton>
            }
          />
          {showNew && (
            <form onSubmit={createOrder} style={{ padding: 20 }}>
              <OrderFields
                values={newOrder}
                onChange={setNewField}
                disabled={busy}
                showrooms={showrooms}
                suppliers={suppliers}
              />
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Raise request
                </GhostButton>
              </div>
              <PanelNote>
                Every order starts as “Requested” and is advanced from the row —
                a state and the date it was reached are written together.
              </PanelNote>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Sample orders"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {list.total.toLocaleString('en-NZ')} total
              </span>
            }
          />

          <form
            onSubmit={search}
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              padding: '14px 20px',
              borderBottom: `1px solid ${c.line}`,
            }}
          >
            <input
              value={draftTerm}
              onChange={(e) => setDraftTerm(e.target.value)}
              placeholder="Label, showroom or design"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 260 }}
              aria-label="Search sample orders"
            />
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 150 }}
              aria-label="Status"
            >
              <option value="">All statuses</option>
              {SAMPLE_ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </Select>
            <Select
              value={showroomId}
              onChange={(e) => setShowroomId(e.target.value)}
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 170 }}
              aria-label="Showroom"
            >
              <option value="">All showrooms</option>
              {showrooms.map((showroom) => (
                <option key={showroom.id} value={showroom.id}>
                  {showroom.name}
                </option>
              ))}
            </Select>
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{showNew ? '' : error}</ErrorLine>
          {list.status === 'loading' && <PanelNote>Loading sample orders…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
          {list.status === 'ready' && list.rows.length === 0 && (
            <PanelNote>
              {term ? 'No sample order matches that search.' : 'No sample orders raised yet.'}
            </PanelNote>
          )}

          {list.status === 'ready' && list.rows.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['Request', 'Showroom', 'Status', 'Moved', '']}
              />
              {list.rows.map((row) => {
                const moves = availableMoves(row)
                const latest = stampEntries(row).at(-1)
                return (
                  <div key={row.id}>
                    <Row columns={COLUMNS} archived={Boolean(row.archived_at)}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, color: c.ink }}>
                          {orderTitle(row)}
                          {row.archived_at && <ArchivedTag />}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12.5,
                            color: c.inkSoft,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {orderMeta(row)}
                        </span>
                      </span>
                      <span
                        style={{
                          ...mutedText,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {row.showroom_name}
                      </span>
                      <span>
                        <StatusPill tone={statusTone(row.status)}>
                          {statusLabel(row.status)}
                        </StatusPill>
                      </span>
                      <span style={{ ...mutedText, minWidth: 0 }}>
                        {latest ? `${latest.label} ${stampDate(latest.at)}` : '—'}
                      </span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <GhostButton disabled={busy} onClick={() => toggleRow(row)}>
                          {openId === row.id ? 'Close' : 'Edit'}
                        </GhostButton>
                        <GhostButton disabled={busy} onClick={() => archiveOrder(row)}>
                          {row.archived_at ? 'Restore' : 'Archive'}
                        </GhostButton>
                        {/* Greyed rather than discovered: the API refuses a
                            delete outside requested/cancelled, and a button that
                            can only produce that 409 is a door onto a locked
                            panel. The 409 stays authoritative if a row moves. */}
                        <GhostButton
                          disabled={busy || !isDeletableStatus(row.status)}
                          tone="danger"
                          onClick={() => remove.ask(row)}
                        >
                          Delete
                        </GhostButton>
                      </span>
                    </Row>

                    {openId === row.id && (
                      <div
                        style={{
                          padding: '20px 20px 24px',
                          background: c.surface,
                          borderBottom: `1px solid ${c.line}`,
                        }}
                      >
                        <OrderFields
                          values={draft}
                          onChange={setField}
                          disabled={busy}
                          showrooms={showrooms}
                          suppliers={suppliers}
                        />
                        <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveOrder(row)}>
                            Save order
                          </GhostButton>
                          {moves.map((move) => (
                            <GhostButton
                              key={move.key}
                              tone={move.tone}
                              disabled={busy}
                              onClick={() => moveOrder(row, move)}
                            >
                              {move.label}
                            </GhostButton>
                          ))}
                        </div>
                        {moves.length === 0 && !row.archived_at && (
                          <PanelNote>
                            {statusLabel(row.status)} is a terminal state — an abandoned or
                            finished order is re-raised as a new request, never reopened.
                          </PanelNote>
                        )}
                        <OrderHistory order={row} />
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </section>

        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          unit="sample orders"
          onPage={list.setPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog {...remove.dialog} />
      <ToastLine message={toast.message} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// The editable columns, identical on create and on edit — SAMPLE_ORDER_FIELDS is
// the same whitelist the API's PATCH accepts, so the two forms cannot drift.
// `status` is deliberately not here: a create always lands in "requested" and a
// move goes through the transition endpoint, which stamps the date beside it.
function OrderFields({ values, onChange, disabled, showrooms, suppliers }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field label="Showroom" hint="Where the material is going. Required — a request with no destination cannot be fulfilled.">
        <Select
          value={values.showroom_id ?? ''}
          disabled={disabled}
          onChange={onChange('showroom_id')}
        >
          <option value="">Choose a showroom…</option>
          {showrooms.map((showroom) => (
            <option key={showroom.id} value={showroom.id}>
              {showroom.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Label" hint="What is being asked for, in the office's words — especially for material the catalogue does not hold.">
        <input
          value={values.label ?? ''}
          disabled={disabled}
          onChange={onChange('label')}
          style={inputStyle}
        />
      </Field>
      <Field label="Supplier">
        <Select
          value={values.supplier_id ?? ''}
          disabled={disabled}
          onChange={onChange('supplier_id')}
        >
          <option value="">No supplier</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </Field>
      {/* An id box, not a picker: colourways is ~19k rows and needs the search
          UI Manage stock has. The row shows the resolved design and house from
          the API, so a wrong id is visible rather than silent. */}
      <Field label="Colourway id" hint="Optional. The row shows the resolved design once saved.">
        <input
          value={values.colourway_id ?? ''}
          disabled={disabled}
          onChange={onChange('colourway_id')}
          style={inputStyle}
        />
      </Field>
      <Field label="Notes" style={{ gridColumn: 'span 2' }}>
        <input
          value={values.notes ?? ''}
          disabled={disabled}
          onChange={onChange('notes')}
          style={inputStyle}
        />
      </Field>
    </div>
  )
}

// One line per stamped transition, in machine order. The dates are the API's
// stamps rendered verbatim — nothing here reads a clock, so this screen can
// never disagree with the row it was handed.
function OrderHistory({ order }) {
  const entries = stampEntries(order)
  if (entries.length === 0) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          ...mutedText,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        History
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {entries.map((entry) => (
          <span key={entry.key} style={{ fontSize: 12.5, color: c.inkSoft }}>
            {entry.label}{' '}
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>
              {stampDate(entry.at)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
