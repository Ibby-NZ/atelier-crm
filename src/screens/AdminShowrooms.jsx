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
// Everything that is a decision lives in adminShowrooms.js with a vitest test
// beside it; this file is layout, because there is no jsdom in this repo.
//
// Two things the screen deliberately does not do:
//   - **No pre-flight before a delete.** The API's 409 carries the blockers and
//     says whether archiving is available; asking first would race it. The
//     expanded row's counts come from the by-id read a staff member has already
//     opened, which is reading what the API said rather than asking again.
//   - **No list of what stands in the showroom.** That is the sample register
//     narrowed by its showroom filter, and a second grid here would be a screen
//     that has not been written yet.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import {
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
  messageOf,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  NEW_SHOWROOM,
  SHOWROOMS_PATH,
  SHOWROOM_FIELDS,
  SHOWROOM_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  describeShowroom,
  holdsSummary,
  showroomFilters,
  showroomMeta,
  showroomPath,
} from './adminShowrooms.js'

const COLUMNS = '1.4fr 1.6fr 1.4fr 230px'

export default function AdminShowrooms() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState({})
  const [newShowroom, setNewShowroom] = useState(NEW_SHOWROOM)
  const [showNew, setShowNew] = useState(false)

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

  // Keep the open editor in step with a reloaded row; close it if the row is gone.
  useEffect(() => {
    if (openId == null) return
    const row = list.rows.find((x) => x.id === openId)
    if (!row) {
      setOpenId(null)
      return
    }
    setDraft(draftFrom(row, SHOWROOM_FIELDS))
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

  const createShowroom = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newShowroom, SHOWROOM_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', SHOWROOMS_PATH, built.body),
      (res) => `${res.showroom.name} added.`
    )
    if (ok) {
      setNewShowroom(NEW_SHOWROOM)
      setShowNew(false)
    }
  }

  const saveShowroom = (row) => {
    const diff = diffFields(row, draft, SHOWROOM_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return toast.flash('No changes to save.')
    run(() => apiSend('PATCH', showroomPath(row.id), diff.patch), 'Showroom saved.')
  }

  const archiveShowroom = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archiveTogglePath(row), {}),
      `${describeShowroom(row) ?? 'That showroom'} ${verb === 'archive' ? 'archived' : 'restored'}.`
    )
  }

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const setNewField = (key) => (event) =>
    setNewShowroom((n) => ({ ...n, [key]: event.target.value }))

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Showrooms</>}
        subtitle="Where samples stand and where sample orders are sent. A showroom cannot be deleted while anything points at it — archive it instead."
        right={
          <CheckField
            label="Show archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
        }
      />
      <SectionTabs tabs={samplesTabs} active="showrooms" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Open a showroom"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNew((open) => !open)
                  setError('')
                }}
              >
                {showNew ? 'Cancel' : 'New showroom'}
              </GhostButton>
            }
          />
          {showNew && (
            <form onSubmit={createShowroom} style={{ padding: 20 }}>
              <ShowroomFields values={newShowroom} onChange={setNewField} disabled={busy} />
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Add showroom
                </GhostButton>
              </div>
            </form>
          )}
        </section>

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

          <ErrorLine style={{ padding: '12px 20px' }}>{showNew ? '' : error}</ErrorLine>
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
                <div key={row.id}>
                  <Row columns={COLUMNS} archived={Boolean(row.archived_at)}>
                    <span style={{ minWidth: 0, fontSize: 13, color: c.ink }}>
                      {row.name}
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
                      <GhostButton disabled={busy} onClick={() => toggleRow(row)}>
                        {openId === row.id ? 'Close' : 'Edit'}
                      </GhostButton>
                      <GhostButton disabled={busy} onClick={() => archiveShowroom(row)}>
                        {row.archived_at ? 'Restore' : 'Archive'}
                      </GhostButton>
                      <GhostButton disabled={busy} tone="danger" onClick={() => remove.ask(row)}>
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
                      <ShowroomFields values={draft} onChange={setField} disabled={busy} />
                      <div style={{ marginTop: 18 }}>
                        <GhostButton
                          tone="accent"
                          disabled={busy}
                          onClick={() => saveShowroom(row)}
                        >
                          Save showroom
                        </GhostButton>
                      </div>
                      <ShowroomHolds id={row.id} />
                    </div>
                  )}
                </div>
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

// --- sub-components (house style: they live at the bottom of the screen file) ---

// The editable columns, identical on create and on edit — SHOWROOM_FIELDS is the
// same whitelist the API's PATCH accepts, so the two forms cannot drift apart.
function ShowroomFields({ values, onChange, disabled }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field label="Name" hint="Unique. It is what every sample and sample order names this place by.">
        <input
          value={values.name ?? ''}
          disabled={disabled}
          onChange={onChange('name')}
          style={inputStyle}
        />
      </Field>
      <Field label="Address">
        <input
          value={values.address ?? ''}
          disabled={disabled}
          onChange={onChange('address')}
          style={inputStyle}
        />
      </Field>
      <Field label="City">
        <input
          value={values.city ?? ''}
          disabled={disabled}
          onChange={onChange('city')}
          style={inputStyle}
        />
      </Field>
      <Field label="Contact">
        <input
          value={values.contact_name ?? ''}
          disabled={disabled}
          onChange={onChange('contact_name')}
          style={inputStyle}
        />
      </Field>
      <Field label="Contact email">
        <input
          value={values.contact_email ?? ''}
          disabled={disabled}
          onChange={onChange('contact_email')}
          style={inputStyle}
        />
      </Field>
      <Field label="Contact phone">
        <input
          value={values.contact_phone ?? ''}
          disabled={disabled}
          onChange={onChange('contact_phone')}
          style={inputStyle}
        />
      </Field>
      <Field label="Notes" style={{ gridColumn: '1 / -1' }}>
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

// What stands in the showroom, from the by-id read. This is the only advance
// warning that Delete will be refused — the kit forbids asking the API "can I
// delete this", because that races the delete and the 409 is authoritative.
// The counts include archived rows, matching the probes exactly.
function ShowroomHolds({ id }) {
  const [detail, setDetail] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setStatus('loading')
    apiFetch(showroomPath(id))
      .then((body) => {
        if (!active) return
        setDetail(body.showroom ?? null)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(messageOf(err, 'Could not load what stands in this showroom.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [id])

  if (status === 'loading') return <PanelNote>Loading…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{error}</PanelNote>

  const holds = holdsSummary(detail)
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
        What points here
      </div>
      <div style={{ marginTop: 8, fontSize: 12.5, color: holds.blocked ? c.ink : c.muted }}>
        {holds.text}
      </div>
    </div>
  )
}
