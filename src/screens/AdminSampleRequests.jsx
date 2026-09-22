// Sample requests — the storefront's sample enquiry cart, landed
// (16 Sep 2026). A shopper presses "Request a sample" on colourways, sends the
// list as one request, and it arrives here as PENDING with both sides already
// emailed by the API. The office marks it sent once the cuttings go out, or
// declines it. Rules in ./sampleRequestFlow.js; this file is layout.
//
//   GET    /admin/sample-requests?q=&status=&include_archived=&page=&limit=
//   GET    /admin/sample-requests/:id
//   POST   /admin/sample-requests/:id/transition { status }
//   POST   /admin/sample-requests/:id/archive|restore
//   DELETE /admin/sample-requests/:id            → 409 { archivable } once sent

import { useEffect, useState } from 'react'
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
  sectionLabel,
} from '../admin/parts.jsx'
import { productPath } from './adminOrders.js'
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
  statusLabel,
  statusTone,
  transitionPath,
} from './sampleRequestFlow.js'

const COLUMNS = '1.4fr 1.6fr 110px 1fr 300px'
const LINE_COLUMNS = '1fr 1.6fr 1.4fr'

export default function AdminSampleRequests() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('pending')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)

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

  // The open row follows the list: gone after a delete, or an archive with
  // "Show archived" off.
  useEffect(() => {
    if (openId == null || list.status !== 'ready') return
    if (list.rows.some((row) => row.id === openId)) return
    setOpenId(null)
  }, [openId, list.rows, list.status])

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const toggleRow = (row) => {
    setError('')
    setOpenId((current) => (current === row.id ? null : row.id))
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
              const open = openId === row.id
              const moves = availableMoves(row)
              return (
                <div key={row.id}>
                  <Row
                    columns={COLUMNS}
                    archived={Boolean(row.archived_at)}
                    style={{ borderLeft: `3px solid ${open ? c.accent : 'transparent'}`, padding: '13px 20px 13px 17px' }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRow(row)}
                      aria-expanded={open}
                      className="ab-t"
                      style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                    >
                      <span style={{ ...monoText, display: 'block', fontSize: 13, fontWeight: 600, color: c.ink }}>
                        {row.request_number}
                        {row.archived_at && <ArchivedTag />}
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: c.ink, marginTop: 3 }}>
                        {requesterLabel(row)}
                      </span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11, marginTop: 2, overflowWrap: 'anywhere' }}>
                        {row.contact_email}
                      </span>
                    </button>
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
                      <GhostButton disabled={busy} aria-expanded={open} onClick={() => toggleRow(row)}>
                        {open ? 'Close' : 'Open'}
                      </GhostButton>
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

                  {open && (
                    <div style={{ padding: '18px 20px 22px 17px', background: c.surface, borderLeft: `3px solid ${c.accent}`, borderBottom: `1px solid ${c.line}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
                        <div>
                          <span style={sectionLabel}>Who asked</span>
                          <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7 }}>
                            <div style={{ color: c.ink, fontWeight: 500 }}>{requesterLabel(row)}</div>
                            <div>
                              <a href={`mailto:${row.contact_email}`} style={{ color: c.accent }}>{row.contact_email}</a>
                            </div>
                            {row.contact_phone && <div style={monoText}>{row.contact_phone}</div>}
                            {row.user_id != null ? (
                              <div style={{ marginTop: 6 }}>
                                <Link to={`/clients/accounts?q=${encodeURIComponent(row.account_email ?? row.contact_email)}`} style={{ color: c.accent }}>
                                  Open client account
                                </Link>
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, fontStyle: 'italic', fontFamily: font.display }}>Guest — no account.</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <span style={sectionLabel}>Their note</span>
                          <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                            {row.notes || <span style={{ fontStyle: 'italic', fontFamily: font.display }}>Nothing added.</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 20 }}>
                        <span style={sectionLabel}>Cuttings</span>
                        <div style={{ ...panel, marginTop: 10, background: c.paper }}>
                          <HeaderRow columns={LINE_COLUMNS} labels={['SKU', 'Design', 'Note']} />
                          {(row.lines ?? []).map((line) => (
                            <Row key={line.id} columns={LINE_COLUMNS} style={{ alignItems: 'start' }}>
                              <span style={{ ...monoText, paddingTop: 2 }}>
                                {productPath(line.product_id) ? (
                                  <Link to={productPath(line.product_id)} style={{ color: 'inherit' }}>{line.sku}</Link>
                                ) : (
                                  line.sku
                                )}
                              </span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 13, color: c.ink }}>
                                  {line.product_name ?? '—'}
                                  {line.colourway_name ? ` — ${line.colourway_name}` : ''}
                                </span>
                                {line.brand_name && <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>{line.brand_name}</span>}
                              </span>
                              <span style={{ ...mutedText, fontSize: 12, whiteSpace: 'pre-wrap' }}>{line.note ?? '—'}</span>
                            </Row>
                          ))}
                        </div>
                      </div>
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
        unit="requests"
        onPage={list.setPage}
        busy={busy}
      />

      <ConfirmDialog {...remove.dialog} />
      <ToastLine message={toast.message} />
    </div>
  )
}
