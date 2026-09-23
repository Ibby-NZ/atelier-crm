// One reserve / cutting docket on its own page (23 Sep 2026, client asked: "for
// any kind of data entry … they will open in their own individual page instead
// of a tabbed drop down"). The docket used to be edited in place on the
// Reserves & cuttings list — its fields behind an Edit toggle in the card's
// head, each line behind an Open toggle under it — so a busy docket pushed every
// other account's off the screen while the office typed a reply onto one line.
// The list is the list now; this is the desk.
//
//   GET    /admin/reserves/:id                    → { reserve }  (lines embedded)
//   PATCH  /admin/reserves/:id                    → { reserve }
//   PATCH  /admin/reserves/lines/:id              → { reserve }
//   POST   /admin/reserves/:id/lines              → { reserve }  ("+ Cutting")
//   POST   /admin/reserves/lines/:id/transition   → { reserve }
//   DELETE /admin/reserves/lines/:id              → lifecycle envelope
//
// The unit is still the DOCKET (one account's visit to the form) with its lines
// under it — the account-first shape the office asked for. A line's everyday
// edit is typing the house's reply onto it (reserve number, hold date, CFA); its
// lifecycle is verbs from availableMoves, never a status select. "+ Cutting"
// posts a prefilled cutting line back onto the docket, linked through
// source_line_id — the generate-a-cutting-from-a-reserve wish. A line is a
// sub-record, so it keeps its small inline editor here rather than a page.
//
// Every write answers with the whole docket, and useMutation re-reads it (the
// kit's reload, standing in for a list's) — so a move's stamp and the
// server-derived `expired` are always the API's, never patched in locally.
//
// Deleting the DOCKET stays on the list, where it was: it is a lifecycle verb on
// a row, and a docket that is gone has no page to stay on. Deleting a LINE is
// here, through the kit's own pieces (attemptDelete → deleteDialog →
// <ConfirmDialog>): one request, no pre-flight, and a refusal keeps the dialog
// open with the API's reason. useCrudScreen cannot serve it — it is bound to a
// list, and lines are not one.
//
// `expired` and every date shown here are the API's values; nothing in this
// file or ./reserveFlow.js constructs a Date (the sample register's clock rule,
// held by a source scan in reserveFlow.test.js).
//
// Layout only: every rule lives in ./reserveFlow.js, tested beside it.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiDelete, apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { attemptDelete, deleteDialog } from '../admin/deleteFlow.js'
import { draftFrom, diffFields } from '../admin/drafts.js'
import {
  Select,
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  RESERVES_PATH,
  LINE_FIELDS,
  DOCKET_FIELDS,
  CFA_VALUES,
  availableMoves,
  buildReserveLines,
  cfaLabel,
  cuttingDraftFrom,
  describeLine,
  docketSummary,
  findLine,
  isDeletableStatus,
  kindLabel,
  linePath,
  lineTransitionPath,
  quantityLabel,
  reserveLinesPath,
  reservePath,
  stampEntries,
  statusLabel,
  statusTone,
} from './reserveFlow.js'

const LINE_COLS = '0.6fr 1.7fr 0.8fr 1fr 0.8fr 1.1fr 0.9fr 0.9fr auto'
const LINE_LABELS = ['Kind', 'Design', 'Code', 'Colour', 'Qty', 'Reserve #', 'CFA', 'Status', '']

export default function AdminReserve() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [docket, setDocket] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | missing | error
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    const body = await apiFetch(reservePath(id))
    setDocket(body.reserve ?? null)
    return body.reserve ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })
  // Where the last action was taken — the docket form or one line's editor —
  // so its refusal is printed beside the button that caused it, not at the
  // foot of a docket that can run to a hundred lines.
  const [errorAt, setErrorAt] = useState(null)

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this docket.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // The docket form, re-seeded from server truth whenever the docket reloads.
  const [docketDraft, setDocketDraft] = useState({})
  useEffect(() => {
    if (!docket) return
    setDocketDraft(draftFrom(docket, DOCKET_FIELDS))
  }, [docket])

  // One open line editor, seeded from server truth and re-seeded after every
  // reload — and closed when its line is no longer on the docket (deleted), or
  // the next save reports a 404 nobody can act on.
  const [openLineId, setOpenLineId] = useState(null)
  const [lineDraft, setLineDraft] = useState({})
  useEffect(() => {
    if (openLineId == null || !docket) return
    const line = findLine([docket], openLineId)
    if (!line) {
      setOpenLineId(null)
      return
    }
    setLineDraft(draftFrom(line, LINE_FIELDS))
  }, [docket, openLineId])

  // --- line delete, through the kit's pieces ---------------------------------
  const [removeTarget, setRemoveTarget] = useState(null)
  const [blocked, setBlocked] = useState(null)
  const [removing, setRemoving] = useState(false)
  const closeRemove = () => {
    setRemoveTarget(null)
    setBlocked(null)
  }
  const confirmRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    // One request. No pre-flight — the API's 409 is the answer.
    const outcome = await attemptDelete(() => apiDelete(linePath(removeTarget.id)), {
      fallback: 'That line could not be deleted.',
    })
    setRemoving(false)
    if (!outcome.ok) {
      // Stay open and explain; closing would throw the reason away.
      setBlocked(outcome.blocked)
      return
    }
    const name = describeLine(removeTarget)
    closeRemove()
    try {
      await load()
    } catch (err) {
      setErrorAt('docket')
      setError(messageOf(err, 'The line was deleted, but the docket could not be re-read.'))
    }
    flash(`${name} deleted.`)
  }
  const removeDialog = deleteDialog({
    entity: 'line',
    name: removeTarget ? describeLine(removeTarget) : undefined,
    blocked,
    // Neither reserve table has `archived_at` — `cancelled` is the removal that
    // keeps the record — so the API answers `archivable: false` and a refusal
    // correctly offers Cancel alone.
    canArchive: false,
  })

  const backLink = (
    <>
      <Link to={RESERVES_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to reserves
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Docket not found"
        backTo={RESERVES_PATH}
        backLabel="Back to reserves"
        message="That reserve / cutting docket could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Reserve / cutting docket" />
        <PanelNote>Loading docket…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Reserve / cutting docket" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!docket) return null

  const act = (where, fn, note) => {
    setErrorAt(where)
    return run(fn, note)
  }

  const saveDocket = () => {
    setErrorAt('docket')
    const diffed = diffFields(docket, docketDraft, DOCKET_FIELDS)
    if (diffed.error) return setError(diffed.error)
    if (Object.keys(diffed.patch).length === 0) return setError('Nothing changed on that docket.')
    return act('docket', () => apiSend('PATCH', reservePath(docket.id), diffed.patch), 'Docket saved.')
  }

  const saveLine = (line) => {
    setErrorAt(line.id)
    const diffed = diffFields(line, lineDraft, LINE_FIELDS)
    if (diffed.error) return setError(diffed.error)
    if (Object.keys(diffed.patch).length === 0) return setError('Nothing changed on that line.')
    return act(line.id, () => apiSend('PATCH', linePath(line.id), diffed.patch), 'Line saved.')
  }

  const moveLine = (line, move) =>
    act(
      line.id,
      () => apiSend('POST', lineTransitionPath(line.id), { status: move.key }),
      `Line moved to ${statusLabel(move.key)}.`
    )

  // The generate-a-cutting wish: the reserve's product identity and paperwork,
  // a fresh cutting lifecycle, linked back through source_line_id.
  const addCutting = (line) => {
    setErrorAt(line.id)
    const built = buildReserveLines([cuttingDraftFrom(line)])
    if (!built.ok) return setError(built.error)
    return act(
      line.id,
      () => apiSend('POST', reserveLinesPath(line.request_id), { lines: built.lines }),
      'Cutting added from the reserve line.'
    )
  }

  const askRemove = (line) => {
    setBlocked(null)
    setRemoveTarget(line)
  }

  const lines = docket.lines ?? []

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={docket.account_name}
        subtitle={`Docket #${docket.id} · ${docketSummary(docket)}`}
        right={
          <span style={{ ...mutedText, fontSize: 11.5 }}>
            {docket.contact_name ? `attn ${docket.contact_name} · ` : ''}
            {docket.owner_name ?? ''}
          </span>
        }
      />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead label="Docket" />
          <div style={{ padding: '14px 20px 20px', display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {DOCKET_FIELDS.filter((field) => field.key !== 'notes').map((field) => (
                <Field key={field.key} label={field.label}>
                  <input
                    value={docketDraft[field.key] ?? ''}
                    onChange={(e) =>
                      setDocketDraft((current) => ({ ...current, [field.key]: e.target.value }))
                    }
                    aria-label={field.label}
                    style={{ ...cellInput, fontSize: 12.5, width: 240 }}
                  />
                </Field>
              ))}
            </div>
            {/* A textarea, not the one-line input the in-row editor used: notes
                are written as several lines on the create form, and an <input>
                silently drops the line breaks the moment anyone types in it. */}
            <Field label="Notes">
              <textarea
                value={docketDraft.notes ?? ''}
                onChange={(e) => setDocketDraft((current) => ({ ...current, notes: e.target.value }))}
                rows={3}
                aria-label="Notes"
                style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
              />
            </Field>
            {errorAt === 'docket' && <ErrorLine>{error}</ErrorLine>}
            <div>
              <GhostButton tone="accent" disabled={busy} onClick={saveDocket}>
                Save docket
              </GhostButton>
            </div>
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Lines" />
          <div style={{ padding: '6px 20px 16px' }}>
            {lines.length === 0 ? (
              <PanelNote>
                No lines left on this docket. It can be deleted from the reserves list.
              </PanelNote>
            ) : (
              <HeaderRow columns={LINE_COLS} labels={LINE_LABELS} numeric={[4]} />
            )}
            {lines.map((line) => (
              <div key={line.id}>
                <Row columns={LINE_COLS}>
                  <span style={{ fontSize: 12, color: c.muted }}>{kindLabel(line.kind)}</span>
                  <span style={{ fontSize: 13 }}>
                    {line.product_name}
                    <span style={{ ...mutedText, display: 'block', fontSize: 11 }}>
                      {[line.range_name, line.supplier].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={monoText}>{line.product_code ?? '—'}</span>
                  <span style={{ fontSize: 12.5 }}>{line.colour ?? '—'}</span>
                  <span style={{ fontSize: 12.5, fontFamily: font.mono, textAlign: 'right' }}>{quantityLabel(line)}</span>
                  <span style={{ fontSize: 12.5 }}>
                    {line.reserve_number ?? '—'}
                    {line.reserved_until && (
                      <span style={{ ...mutedText, display: 'block', fontSize: 11 }}>
                        until {line.reserved_until}
                        {line.expired === true && (
                          <span style={{ color: c.clay, fontWeight: 600 }}> · passed</span>
                        )}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12 }}>{line.kind === 'reserve' ? cfaLabel(line.cfa) : '—'}</span>
                  <span>
                    <StatusPill tone={statusTone(line.status)}>{statusLabel(line.status)}</StatusPill>
                  </span>
                  <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <GhostButton
                      disabled={busy}
                      onClick={() => setOpenLineId(openLineId === line.id ? null : line.id)}
                    >
                      {openLineId === line.id ? 'Close' : 'Open'}
                    </GhostButton>
                  </span>
                </Row>

                {openLineId === line.id && (
                  <LineEditor
                    line={line}
                    draft={lineDraft}
                    setDraft={setLineDraft}
                    busy={busy}
                    error={errorAt === line.id ? error : ''}
                    onSave={() => saveLine(line)}
                    onMove={(move) => moveLine(line, move)}
                    onCutting={() => addCutting(line)}
                    onDelete={() => askRemove(line)}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        {...removeDialog}
        onConfirm={confirmRemove}
        onCancel={closeRemove}
        busy={removing}
      />
      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// One line's editor: the house's reply typed onto the line, the moves its status
// allows, "+ Cutting" off a reserve, and the delete that stops the moment the
// supplier is involved (greyed off the status; the API's 409 stays the gate).
function LineEditor({ line, draft, setDraft, busy, error, onSave, onMove, onCutting, onDelete }) {
  const stamps = stampEntries(line)
  return (
    <div style={{ margin: '4px 0 14px', padding: 16, background: c.surfaceDeep, borderRadius: 8, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {LINE_FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            {field.key === 'cfa' ? (
              <Select
                value={draft.cfa ?? ''}
                onChange={(e) => setDraft((current) => ({ ...current, cfa: e.target.value }))}
                aria-label="CFA"
                style={{ ...cellInput, fontSize: 12.5 }}
              >
                <option value="">—</option>
                {CFA_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {cfaLabel(value)}
                  </option>
                ))}
              </Select>
            ) : (
              <input
                type={field.kind === 'date' ? 'date' : 'text'}
                value={draft[field.key] ?? ''}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    [field.key]: e.target.value,
                  }))
                }
                aria-label={field.label}
                style={{
                  ...cellInput,
                  fontSize: 12.5,
                  width: field.key === 'comment' ? 260 : field.key === 'product_name' ? 180 : 120,
                }}
              />
            )}
          </Field>
        ))}
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <GhostButton tone="accent" disabled={busy} onClick={onSave}>
          Save line
        </GhostButton>
        {availableMoves(line).map((move) => (
          <GhostButton key={move.key} tone={move.tone} disabled={busy} onClick={() => onMove(move)}>
            {move.label}
          </GhostButton>
        ))}
        {line.kind === 'reserve' && (
          <GhostButton disabled={busy} onClick={onCutting}>
            + Cutting from this line
          </GhostButton>
        )}
        <GhostButton tone="danger" disabled={busy || !isDeletableStatus(line.status)} onClick={onDelete}>
          Delete line
        </GhostButton>
      </div>
      {stamps.length > 0 && (
        <div style={{ ...mutedText, fontSize: 11.5 }}>
          {stamps.map((stamp) => `${stamp.label} ${stamp.date}`).join(' · ')}
        </div>
      )}
      {line.comment && <div style={{ fontSize: 12, color: c.inkSoft }}>“{line.comment}”</div>}
    </div>
  )
}
