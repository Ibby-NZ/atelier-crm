// Reserves & cuttings — LIVE, the docket list replacing the D365 fulmar_reserve
// and cutting forms.
//
//   GET    /admin/reserves?q=&kind=&status=&supplier=&include_done=&page=  → { reserves, meta }
//   GET    /admin/reserves/suppliers                                      → { suppliers }
//   PATCH  /admin/reserves/:id · /admin/reserves/lines/:id                → { reserve }
//   POST   /admin/reserves/:id/lines · .../lines/:id/transition           → { reserve }
//   DELETE /admin/reserves/:id · /admin/reserves/lines/:id                → lifecycle envelope
//
// The unit on screen is the DOCKET (one account's visit to the form) with its
// lines under it — the account-first shape the office asked for. A line's
// everyday edit is typing the house's reply onto it (reserve number, hold
// date, CFA); its lifecycle is verbs from availableMoves, never a status
// select. "+ Cutting" posts a prefilled cutting line back onto the docket,
// linked through source_line_id — the generate-a-cutting-from-a-reserve wish.
//
// `expired` and every date shown here are the API's values; nothing in this
// file or ./reserveFlow.js constructs a Date (the sample register's clock
// rule, held by a source scan in reserveFlow.test.js).
//
// Layout only: every rule lives in ./reserveFlow.js, tested beside it.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import { apiSend, safeFetch } from '../lib/api.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import Pagination from '../admin/Pagination.jsx'
import { draftFrom, diffFields } from '../admin/drafts.js'
import {
  Select,
  ErrorLine,
  Field,
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
  LINE_FIELDS,
  DOCKET_FIELDS,
  LINE_KINDS,
  LINE_STATUSES,
  CFA_VALUES,
  availableMoves,
  buildReserveLines,
  cfaLabel,
  cuttingDraftFrom,
  describeDeleteTarget,
  deleteTargetPath,
  docketSummary,
  findLine,
  isDeletableDocket,
  isDeletableStatus,
  kindLabel,
  linePath,
  lineTransitionPath,
  quantityLabel,
  reserveFilters,
  reserveLinesPath,
  reservePath,
  stampEntries,
  statusLabel,
  statusTone,
} from './reserveFlow.js'

const LIST_LIMIT = 25

const LINE_COLS = '0.6fr 1.7fr 0.8fr 1fr 0.8fr 1.1fr 0.9fr 0.9fr auto'
const LINE_LABELS = ['Kind', 'Design', 'Code', 'Colour', 'Qty', 'Reserve #', 'CFA', 'Status', '']

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
    // One dialog serves dockets and lines; request_id is the discriminator.
    entity: 'entry',
    describe: describeDeleteTarget,
    deletePath: deleteTargetPath,
  })

  const dockets = crud.list.rows
  const { busy, error, setError, run } = crud.mutation

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

  // One open line editor, seeded from server truth and re-seeded after every
  // reload — and closed when its line is no longer in the list (deleted, or a
  // filter change), or the next save reports a 404 nobody can act on.
  const [openLineId, setOpenLineId] = useState(null)
  const [lineDraft, setLineDraft] = useState({})
  useEffect(() => {
    if (openLineId == null) return
    const line = findLine(dockets, openLineId)
    if (!line) {
      setOpenLineId(null)
      return
    }
    setLineDraft(draftFrom(line, LINE_FIELDS))
  }, [dockets, openLineId])

  const [openDocketId, setOpenDocketId] = useState(null)
  const [docketDraft, setDocketDraft] = useState({})
  useEffect(() => {
    if (openDocketId == null) return
    const docket = dockets.find((row) => row.id === openDocketId)
    if (!docket) {
      setOpenDocketId(null)
      return
    }
    setDocketDraft(draftFrom(docket, DOCKET_FIELDS))
  }, [dockets, openDocketId])

  const applyTerm = (event) => {
    event?.preventDefault()
    setTerm(draftTerm)
  }

  const saveLine = (line) => {
    const diffed = diffFields(line, lineDraft, LINE_FIELDS)
    if (diffed.error) return setError(diffed.error)
    if (Object.keys(diffed.patch).length === 0) return setError('Nothing changed on that line.')
    return run(() => apiSend('PATCH', linePath(line.id), diffed.patch), 'Line saved.')
  }

  const saveDocket = (docket) => {
    const diffed = diffFields(docket, docketDraft, DOCKET_FIELDS)
    if (diffed.error) return setError(diffed.error)
    if (Object.keys(diffed.patch).length === 0) return setError('Nothing changed on that docket.')
    return run(() => apiSend('PATCH', reservePath(docket.id), diffed.patch), 'Docket saved.')
  }

  const moveLine = (line, move) => {
    run(
      () => apiSend('POST', lineTransitionPath(line.id), { status: move.key }),
      `Line moved to ${statusLabel(move.key)}.`
    )
  }

  // The generate-a-cutting wish: the reserve's product identity and paperwork,
  // a fresh cutting lifecycle, linked back through source_line_id.
  const addCutting = (line) => {
    const built = buildReserveLines([cuttingDraftFrom(line)])
    if (!built.ok) return setError(built.error)
    return run(
      () => apiSend('POST', reserveLinesPath(line.request_id), { lines: built.lines }),
      'Cutting added from the reserve line.'
    )
  }

  const selectStyle = { ...cellInput, fontSize: 12.5 }

  return (
    <div>
      <PageHeader
        eyebrow="Stock · live"
        title={<>Reserves &amp; cuttings</>}
        subtitle="What each account has asked the houses to hold or cut, entered account-first. The supplier report is the tab beside this one."
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
        </div>

        {crud.list.status === 'loading' && <PanelNote>Loading reserves…</PanelNote>}
        {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
        {crud.list.status === 'ready' && dockets.length === 0 && (
          <PanelNote>
            Nothing here yet. Raise the first docket with “New reserve / cutting” above — or run
            the API&apos;s <span style={monoText}>npm run seed:reserves</span> for demo data.
          </PanelNote>
        )}

        {crud.list.status === 'ready' &&
          dockets.map((docket) => (
            <section key={docket.id} style={panel}>
              <PanelHead
                label={
                  <>
                    {docket.account_name}
                    <span style={{ ...mutedText, fontWeight: 400, marginLeft: 10 }}>
                      docket #{docket.id} · {docketSummary(docket)}
                    </span>
                  </>
                }
                right={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ ...mutedText, fontSize: 11.5 }}>
                      {docket.contact_name ? `attn ${docket.contact_name} · ` : ''}
                      {docket.owner_name ?? ''}
                    </span>
                    <GhostButton
                      disabled={busy}
                      onClick={() => setOpenDocketId(openDocketId === docket.id ? null : docket.id)}
                    >
                      {openDocketId === docket.id ? 'Close' : 'Edit'}
                    </GhostButton>
                    <GhostButton
                      tone="danger"
                      disabled={busy || !isDeletableDocket(docket)}
                      onClick={() => crud.remove.ask(docket)}
                    >
                      Delete
                    </GhostButton>
                  </div>
                }
              />

              {openDocketId === docket.id && (
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.line}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {DOCKET_FIELDS.map((field) => (
                    <Field key={field.key} label={field.label}>
                      <input
                        value={docketDraft[field.key] ?? ''}
                        onChange={(e) =>
                          setDocketDraft((current) => ({ ...current, [field.key]: e.target.value }))
                        }
                        aria-label={field.label}
                        style={{ ...cellInput, fontSize: 12.5, width: field.key === 'notes' ? 320 : 200 }}
                      />
                    </Field>
                  ))}
                  <GhostButton tone="accent" disabled={busy} onClick={() => saveDocket(docket)}>
                    Save docket
                  </GhostButton>
                </div>
              )}

              <div style={{ padding: '6px 20px 16px' }}>
                <HeaderRow columns={LINE_COLS} labels={LINE_LABELS} numeric={[4]} />
                {docket.lines.map((line) => (
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
                      <div style={{ margin: '4px 0 14px', padding: 16, background: c.surfaceDeep, borderRadius: 8, display: 'grid', gap: 14 }}>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          {LINE_FIELDS.map((field) => (
                            <Field key={field.key} label={field.label}>
                              {field.key === 'cfa' ? (
                                <Select
                                  value={lineDraft.cfa ?? ''}
                                  onChange={(e) =>
                                    setLineDraft((current) => ({ ...current, cfa: e.target.value }))
                                  }
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
                                  value={lineDraft[field.key] ?? ''}
                                  onChange={(e) =>
                                    setLineDraft((current) => ({
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
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveLine(line)}>
                            Save line
                          </GhostButton>
                          {availableMoves(line).map((move) => (
                            <GhostButton
                              key={move.key}
                              tone={move.tone}
                              disabled={busy}
                              onClick={() => moveLine(line, move)}
                            >
                              {move.label}
                            </GhostButton>
                          ))}
                          {line.kind === 'reserve' && (
                            <GhostButton disabled={busy} onClick={() => addCutting(line)}>
                              + Cutting from this line
                            </GhostButton>
                          )}
                          <GhostButton
                            tone="danger"
                            disabled={busy || !isDeletableStatus(line.status)}
                            onClick={() => crud.remove.ask(line)}
                          >
                            Delete line
                          </GhostButton>
                        </div>
                        {stampEntries(line).length > 0 && (
                          <div style={{ ...mutedText, fontSize: 11.5 }}>
                            {stampEntries(line)
                              .map((stamp) => `${stamp.label} ${stamp.date}`)
                              .join(' · ')}
                          </div>
                        )}
                        {line.comment && (
                          <div style={{ fontSize: 12, color: c.inkSoft }}>“{line.comment}”</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {docket.notes && (
                  <div style={{ ...mutedText, fontSize: 11.5, marginTop: 10 }}>{docket.notes}</div>
                )}
              </div>
            </section>
          ))}

        <Pagination
          page={crud.list.page}
          totalPages={crud.list.totalPages}
          total={crud.list.total}
          unit="dockets"
          onPage={crud.list.setPage}
          busy={crud.list.status === 'loading'}
        />
        <ErrorLine>{error}</ErrorLine>
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={crud.toast.message} />
    </div>
  )
}
