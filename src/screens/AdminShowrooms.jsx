// Showrooms — the address book behind the sample register, wired to
// atelier-api's /admin/showrooms. Live: it reads AND writes real rows.
//
//   GET    /admin/showrooms?q=&include_archived=&page=&limit=
//                                        → { showrooms, meta: { total, page, limit } }
//   GET    /admin/showrooms/:id          → { showroom } + sample_count, sample_order_count
//   POST   /admin/showrooms              → { showroom }  (201)
//   PATCH  /admin/showrooms/:id          → { showroom }
//   POST   /admin/showrooms/:id/archive|restore
//   DELETE /admin/showrooms/:id          → 200, or 409 { message, blockers, archivable }
//
// A showroom is where samples stand and where sample orders are sent. It records
// the place and who to ring there, and nothing about what is in it.
//
// One showroom OPENS ON ITS OWN PAGE (AdminShowroom, /admin/showrooms/:id), and
// a new one is added on its own page too (AdminShowroomNew, /admin/showrooms/new)
// — the client asked on 23 Sep 2026 that every kind of data entry open "in
// their own individual page instead of a tabbed drop down". This screen is the
// list, the search and the row's lifecycle verbs.
//
// Everything that is a decision lives in adminShowrooms.js with a vitest test
// beside it; this file is layout, because there is no jsdom in this repo.
//
// Two things the screen deliberately does not do:
//   - **No pre-flight before a delete.** The API's 409 carries the blockers and
//     says whether archiving is available; asking first would race it. The
//     showroom's page shows its counts from the by-id read a staff member has
//     already opened, which is reading what the API said rather than asking
//     again.
//   - **No list of what stands in the showroom.** That is the sample register
//     narrowed by its showroom filter, and a second grid here would be a screen
//     that has not been written yet.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import {
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
  NEW_SHOWROOM_ROUTE,
  SHOWROOMS_PATH,
  SHOWROOM_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  describeShowroom,
  showroomFilters,
  showroomMeta,
  showroomRoute,
} from './adminShowrooms.js'

const COLUMNS = '1.4fr 1.6fr 1.4fr 230px'

export default function AdminShowrooms() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const { list, toast, mutation, remove } = useCrudScreen({
    path: SHOWROOMS_PATH,
    key: 'showrooms',
    limit: SHOWROOM_LIST_LIMIT,
    filters: showroomFilters({ term, showArchived }),
    entity: 'showroom',
    describe: describeShowroom,
    // Enables "Archive instead" on a blocked delete, which is the answer a
    // blocked showroom needs: sample_orders.showroom_id is NOT NULL + RESTRICT,
    // so a showroom that has ever been sent an order can never be removed.
    archive: (row) => apiSend('POST', archiveInsteadPath(row), {}),
  })
  const { busy, error, setError, run } = mutation

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const archiveShowroom = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archiveTogglePath(row), {}),
      `${describeShowroom(row) ?? 'That showroom'} ${verb === 'archive' ? 'archived' : 'restored'}.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Showrooms</>}
        subtitle="Where samples stand and where sample orders are sent. A showroom cannot be deleted while anything points at it — archive it instead."
        right={
          <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <CheckField
              label="Show archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <Link to={NEW_SHOWROOM_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">New showroom</GhostButton>
            </Link>
          </span>
        }
      />
      <SectionTabs tabs={samplesTabs} active="showrooms" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Showrooms"
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
              padding: '14px 20px',
              borderBottom: `1px solid ${c.line}`,
            }}
          >
            <input
              value={draftTerm}
              onChange={(e) => setDraftTerm(e.target.value)}
              placeholder="Name, city or contact"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
              aria-label="Search showrooms"
            />
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {list.status === 'loading' && <PanelNote>Loading showrooms…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
          {list.status === 'ready' && list.rows.length === 0 && (
            <PanelNote>
              {term ? 'No showroom matches that search.' : 'No showrooms recorded yet.'}
            </PanelNote>
          )}

          {list.status === 'ready' && list.rows.length > 0 && (
            <>
              <HeaderRow columns={COLUMNS} labels={['Showroom', 'Address', 'City · contact', '']} />
              {list.rows.map((row) => (
                <Row key={row.id} columns={COLUMNS} archived={Boolean(row.archived_at)}>
                  <span style={{ minWidth: 0, fontSize: 13, color: c.ink }}>
                    <Link
                      to={showroomRoute(row.id)}
                      className="ab-link"
                      style={{ color: c.ink, textDecoration: 'none' }}
                    >
                      {row.name}
                    </Link>
                    {row.archived_at && <ArchivedTag />}
                  </span>
                  <span
                    style={{
                      ...mutedText,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.address || '—'}
                  </span>
                  <span
                    style={{
                      ...mutedText,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {showroomMeta(row)}
                  </span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Link to={showroomRoute(row.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    <GhostButton disabled={busy} onClick={() => archiveShowroom(row)}>
                      {row.archived_at ? 'Restore' : 'Archive'}
                    </GhostButton>
                    <GhostButton disabled={busy} tone="danger" onClick={() => remove.ask(row)}>
                      Delete
                    </GhostButton>
                  </span>
                </Row>
              ))}
            </>
          )}
        </section>

        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          unit="showrooms"
          onPage={list.setPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog {...remove.dialog} />
      <ToastLine message={toast.message} />
    </div>
  )
}
