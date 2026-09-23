// Sample register — the physical library, wired to atelier-api's /admin/samples.
// Live: it reads AND writes real rows, unlike the demo Tracking screen beside it
// (which is backed by src/data/*.js and localStorage and loses everything on
// clear-site-data).
//
//   GET    /admin/samples?q=&status=&showroom_id=&supplier_id=&overdue=
//                        &include_archived=&page=&limit=
//                                     → { samples, meta: { total, page, limit } }
//   GET    /admin/samples/:id         → { sample } + loans
//   POST   /admin/samples             → { sample }  (201)
//   PATCH  /admin/samples/:id         → { sample }
//   POST   /admin/samples/:id/check-out|check-in   → { sample }
//   POST   /admin/samples/:id/archive|restore      → { sample }
//   DELETE /admin/samples/:id         → 200, or 409 { message, blockers, archivable }
//
// One sample OPENS ON ITS OWN PAGE (AdminSample, /admin/samples/:id), and a new
// one is registered on its own page too (AdminSampleNew, /admin/samples/new) —
// the client asked on 23 Sep 2026 that every kind of data entry open "in their
// own individual page instead of a tabbed drop down". The edit form, the
// check-out form and the movement history used to open inside the row, and the
// create form dropped down above the list. This screen is the list, the
// filters, and the row's verbs: Check in (the quick one, for a sample handed
// back over the counter), Archive/Restore and Delete.
//
// OVERDUE IS THE API'S VALUE. Every row carries `overdue`, derived server-side at
// read time from the open loan's due date; this screen renders it and never
// recomputes it. A browser comparing the dates itself would answer with the
// device's clock and disagree with the very filter that fetched the row. All of
// that lives in adminSamples.js — `loanState(sample)` reads the boolean — with a
// vitest test beside it, because there is no jsdom in this repo.
//
// Nothing from the Dynamics cutting staging table appears here. That table's
// free-text staff column carries third parties' names, emails, phones and home
// addresses; the register reads /admin/samples only, and `notes` on a sample row
// is the platform's own staff-typed field, a different thing entirely.
//
// A movement is a VERB, never a status change — see AdminSample, where the
// form and the check-out live. The status FILTER here still offers `out`,
// because "what is out" is the register's headline question.
//
// A row's recorded value (C18) prints only when the API sent one: the cost
// columns are DELETED from the response for a login without the finance grant,
// so the absent key prints nothing and nothing here needs to ask.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
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
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  NEW_SAMPLE_ROUTE,
  SAMPLES_PATH,
  SAMPLE_LIST_LIMIT,
  SAMPLE_STATUSES,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  checkInPath,
  describeSample,
  loanState,
  movementVerb,
  recordedCostText,
  sampleFilters,
  sampleMeta,
  sampleRoute,
  statusLabel,
} from './adminSamples.js'

const COLUMNS = '1.5fr 1.5fr 1fr 1.2fr 250px'

export default function AdminSamples() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('')
  const [showroomId, setShowroomId] = useState('')
  const [overdue, setOverdue] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // The showroom filter's options. The supplier half of the pair is the forms'
  // — they live on the sample's page and the register-a-sample page now.
  const { showrooms } = useSamplePickers()

  const { list, toast, mutation, remove } = useCrudScreen({
    path: SAMPLES_PATH,
    key: 'samples',
    limit: SAMPLE_LIST_LIMIT,
    filters: sampleFilters({ term, status, showroomId, overdue, showArchived }),
    entity: 'sample',
    describe: describeSample,
    // Enables "Archive instead" on a blocked delete, which is the answer a
    // blocked sample needs: sample_loans.sample_id is RESTRICT, so a sample that
    // has ever been lent can never be removed without destroying the movements
    // the register exists to record.
    archive: (row) => apiSend('POST', archiveInsteadPath(row), {}),
  })
  const { busy, error, setError, run } = mutation

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const archiveSample = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archiveTogglePath(row), {}),
      `${describeSample(row) ?? 'That sample'} ${verb === 'archive' ? 'archived' : 'restored'}.`
    )
  }

  // A bodyless POST: the API types the schema ['object','null'] for exactly this
  // call, and `returned_at` defaults to now().
  const takeBack = (row) =>
    run(() => apiSend('POST', checkInPath(row), {}), 'Checked back into the library.')

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Sample register</>}
        subtitle="Every physical sample, where it sits and who has it. Overdue is worked out by the API from the loan's due date — this screen shows what it was told."
        right={
          <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <CheckField
              label="Show archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <Link to={NEW_SAMPLE_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">New sample</GhostButton>
            </Link>
          </span>
        }
      />
      <SectionTabs tabs={samplesTabs} active="register" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Samples"
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
              placeholder="Barcode, label, type, shelf or design"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 260 }}
              aria-label="Search samples"
            />
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 150 }}
              aria-label="Status"
            >
              <option value="">All statuses</option>
              {SAMPLE_STATUSES.map((value) => (
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
            {/* Tri-state on purpose: "Not late back" is out ON TIME or on the
                shelf, which is a different question from "on the shelf". */}
            <Select
              value={overdue}
              onChange={(e) => setOverdue(e.target.value)}
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 150 }}
              aria-label="Overdue"
            >
              <option value="">Overdue: any</option>
              <option value="true">Overdue only</option>
              <option value="false">Not late back</option>
            </Select>
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {list.status === 'loading' && <PanelNote>Loading samples…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
          {list.status === 'ready' && list.rows.length === 0 && (
            <PanelNote>
              {term ? 'No sample matches that search.' : 'No samples registered yet.'}
            </PanelNote>
          )}

          {list.status === 'ready' && list.rows.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['Sample', 'Design', 'Status', 'Loan', '']}
              />
              {list.rows.map((row) => {
                const loan = loanState(row)
                return (
                  <Row key={row.id} columns={COLUMNS} archived={Boolean(row.archived_at)}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', ...monoText, fontSize: 12 }}>
                        <Link
                          to={sampleRoute(row.id)}
                          className="ab-link"
                          style={{ color: c.ink, textDecoration: 'none' }}
                        >
                          {row.barcode}
                        </Link>
                        {row.archived_at && <ArchivedTag />}
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: c.inkSoft }}>
                        {row.label || row.sample_type || '—'}
                        {row.location ? ` · ${row.location}` : ''}
                        {/* Only a RECORDED value (0 = "Free of charge" included);
                            the key is absent without finance and prints nothing. */}
                        {recordedCostText(row) ? ` · ${recordedCostText(row)}` : ''}
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
                      {sampleMeta(row)}
                    </span>
                    <span style={{ fontSize: 12.5, color: c.inkSoft }}>
                      {statusLabel(row.status)}
                    </span>
                    {/* The API's `overdue`, rendered. Never recomputed here. */}
                    <span
                      style={{
                        fontSize: 12.5,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: loan.tone === 'danger' ? c.danger : loan.tone === 'ink' ? c.ink : c.muted,
                      }}
                    >
                      {loan.text}
                    </span>
                    <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Link to={sampleRoute(row.id)} style={{ textDecoration: 'none' }}>
                        <GhostButton>Open</GhostButton>
                      </Link>
                      {movementVerb(row) === 'check-in' && (
                        <GhostButton disabled={busy} onClick={() => takeBack(row)}>
                          Check in
                        </GhostButton>
                      )}
                      <GhostButton disabled={busy} onClick={() => archiveSample(row)}>
                        {row.archived_at ? 'Restore' : 'Archive'}
                      </GhostButton>
                      <GhostButton disabled={busy} tone="danger" onClick={() => remove.ask(row)}>
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
          unit="samples"
          onPage={list.setPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog {...remove.dialog} />
      <ToastLine message={toast.message} />
    </div>
  )
}
