// Sample requests — the storefront's sample enquiry cart, landed
// (16 Sep 2026). A shopper presses "Request a sample" on colourways, sends the
// list as one request, and it arrives here as PENDING with both sides already
// emailed by the API. The office marks it sent once the cuttings go out, or
// declines it. Rules in ./sampleRequestFlow.js; this file is layout.
//
// One request OPENS ON ITS OWN PAGE (AdminSampleRequest,
// /admin/sample-requests/:id) — who asked, their note and the cuttings used to
// open inside the row, and the client asked on 23 Sep 2026 that every kind of
// data entry open "in their own individual page instead of a tabbed drop
// down". This screen is the queue: the filters, and the row's verbs — the two
// moves (quick to take from a row the office already recognises), Archive/
// Restore and Delete. There is no create: a request arrives from the website.
//
//   GET    /admin/sample-requests?q=&status=&include_archived=&page=&limit=
//   GET    /admin/sample-requests/:id
//   POST   /admin/sample-requests/:id/transition { status }
//   POST   /admin/sample-requests/:id/archive|restore
//   DELETE /admin/sample-requests/:id            → 409 { archivable } once sent

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
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
  Select,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  SAMPLE_REQUESTS_PATH,
  SAMPLE_REQUEST_LIST_LIMIT,
  SAMPLE_REQUEST_STATUSES,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  availableMoves,
  describeSampleRequest,
  isDeletableStatus,
  lineCountLabel,
  linesSummary,
  movedLine,
  requesterLabel,
  sampleRequestFilters,
  sampleRequestRoute,
  statusLabel,
  statusTone,
  transitionPath,
} from './sampleRequestFlow.js'

const COLUMNS = '1.4fr 1.6fr 110px 1fr 300px'

export default function AdminSampleRequests() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('pending')
  const [showArchived, setShowArchived] = useState(false)

  const { list, toast, mutation, remove } = useCrudScreen({
    path: SAMPLE_REQUESTS_PATH,
    key: 'sample_requests',
    limit: SAMPLE_REQUEST_LIST_LIMIT,
    filters: sampleRequestFilters({ term, status, showArchived }),
    entity: 'sample request',
    describe: describeSampleRequest,
    // A sent request is a record of cuttings that left the building; the API
    // refuses the delete and "Archive instead" is the way off the list.
    archive: (row) => apiSend('POST', archiveInsteadPath(row), {}),
  })
  const { busy, error, setError, run } = mutation

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const move = (row, target) =>
    run(
      () => apiSend('POST', transitionPath(row), { status: target.key }),
      `${row.request_number} — ${statusLabel(target.key).toLowerCase()}.`
    )

  const archive = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archiveTogglePath(row), {}),
      `${row.request_number} ${verb === 'archive' ? 'archived' : 'restored'}.`
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Sample requests</>}
        subtitle="Cuttings asked for through the website. A request arrives pending with the shopper and the office already emailed; mark it sent once the cuttings go out, or decline it."
        right={
          <CheckField
            label="Show archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
        }
      />
      <SectionTabs tabs={samplesTabs} active="requests" />

      <section style={{ ...panel, marginTop: 16 }}>
        <PanelHead
          label="Requests"
          right={
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
              {list.total.toLocaleString('en-NZ')} total
            </span>
          }
        />
        <form
          onSubmit={search}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}
        >
          <input
            value={draftTerm}
            onChange={(e) => setDraftTerm(e.target.value)}
            placeholder="Request number, name, email, SKU or design"
            style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 300 }}
            aria-label="Search sample requests"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 150 }}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {SAMPLE_REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </Select>
          <GhostButton type="submit" disabled={busy}>
            Search
          </GhostButton>
        </form>

        <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
        {list.status === 'loading' && <PanelNote>Loading sample requests…</PanelNote>}
        {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
        {list.status === 'ready' && list.rows.length === 0 && (
          <PanelNote>
            {term || status
              ? 'No sample request matches those filters.'
              : 'No sample requests yet — they arrive from “Request a sample” on the website.'}
          </PanelNote>
        )}

        {list.status === 'ready' && list.rows.length > 0 && (
          <>
            <HeaderRow columns={COLUMNS} labels={['Request', 'Cuttings', 'Status', 'Moved', '']} />
            {list.rows.map((row) => {
              const moves = availableMoves(row)
              return (
                <Row key={row.id} columns={COLUMNS} archived={Boolean(row.archived_at)}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...monoText, display: 'block', fontSize: 13, fontWeight: 600, color: c.ink }}>
                      <Link
                        to={sampleRequestRoute(row.id)}
                        className="ab-link"
                        style={{ color: c.ink, textDecoration: 'none' }}
                      >
                        {row.request_number}
                      </Link>
                      {row.archived_at && <ArchivedTag />}
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: c.ink, marginTop: 3 }}>
                      {requesterLabel(row)}
                    </span>
                    <span style={{ display: 'block', ...mutedText, fontSize: 11, marginTop: 2, overflowWrap: 'anywhere' }}>
                      {row.contact_email}
                    </span>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, color: c.ink }}>{lineCountLabel(row)}</span>
                    <span style={{ display: 'block', ...mutedText, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {linesSummary(row)}
                    </span>
                  </span>
                  <span>
                    <StatusPill tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusPill>
                  </span>
                  <span style={{ ...mutedText, fontSize: 11.5 }}>{movedLine(row)}</span>
                  <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link to={sampleRequestRoute(row.id)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                    {moves.map((target) => (
                      <GhostButton key={target.key} tone={target.tone} disabled={busy} onClick={() => move(row, target)}>
                        {target.label}
                      </GhostButton>
                    ))}
                    <GhostButton disabled={busy} onClick={() => archive(row)}>
                      {row.archived_at ? 'Restore' : 'Archive'}
                    </GhostButton>
                    {/* Greyed rather than hidden outside pending/declined:
                        the API's 409 stays authoritative if the row moves. */}
                    <GhostButton
                      tone="danger"
                      disabled={busy || !isDeletableStatus(row.status)}
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
        unit="requests"
        onPage={list.setPage}
        busy={busy}
      />

      <ConfirmDialog {...remove.dialog} />
      <ToastLine message={toast.message} />
    </div>
  )
}
