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
// One order OPENS ON ITS OWN PAGE (AdminSampleOrder, /admin/sample-orders/:id),
// where it is edited and moved through its lifecycle, and a new request is
// raised on its own page too (AdminSampleOrderNew, /admin/sample-orders/new) —
// the client asked on 23 Sep 2026 that every kind of data entry open "in their
// own individual page instead of a tabbed drop down". This screen is the list,
// the filters and the row's lifecycle verbs.
//
// Everything that is a decision lives in sampleFlow.js with a vitest test
// beside it; this file is layout, because there is no jsdom in this repo.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useSamplePickers } from './useSamplePickers.js'
import {
  Select,
  ArchivedTag,
  CheckField,
  ErrorLine,
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
import {
  NEW_SAMPLE_ORDER_ROUTE,
  SAMPLE_ORDERS_PATH,
  SAMPLE_ORDER_LIST_LIMIT,
  SAMPLE_ORDER_STATUSES,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  describeSampleOrder,
  isDeletableStatus,
  orderMeta,
  orderTitle,
  sampleOrderFilters,
  sampleOrderRoute,
  stampDate,
  stampEntries,
  statusLabel,
  statusTone,
} from './sampleFlow.js'

const COLUMNS = '1.8fr 1.2fr 130px 1fr 300px'

export default function AdminSampleOrders() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('')
  const [showroomId, setShowroomId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // The showroom filter's options. The supplier half of the pair is the forms'
  // — they live on the order's page and the raise-a-request page now.
  const { showrooms } = useSamplePickers()

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

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
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

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Sample orders</>}
        subtitle="Material requested from the houses for the showrooms, advanced through its lifecycle as it ships and arrives. A move stamps the date it happened."
        right={
          <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <CheckField
              label="Show archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <Link to={NEW_SAMPLE_ORDER_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">New request</GhostButton>
            </Link>
          </span>
        }
      />
      <SectionTabs tabs={samplesTabs} active="orders" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
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

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
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
                const latest = stampEntries(row).at(-1)
                return (
                  <Row key={row.id} columns={COLUMNS} archived={Boolean(row.archived_at)}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, color: c.ink }}>
                        <Link
                          to={sampleOrderRoute(row.id)}
                          className="ab-link"
                          style={{ color: c.ink, textDecoration: 'none' }}
                        >
                          {orderTitle(row)}
                        </Link>
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
                      <Link to={sampleOrderRoute(row.id)} style={{ textDecoration: 'none' }}>
                        <GhostButton>Open</GhostButton>
                      </Link>
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
