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
// A movement is a VERB, never a status change: `out` is the one status that
// asserts an open loan exists, and only check-out writes both tables in the
// transaction that makes it true. The form does not offer it, so nobody meets a
// 400 for asking a reasonable-looking question.
//
// WHAT A SAMPLE COST IS FINANCE-GATED (C18). The API deletes `unit_cost` and
// `cost_currency` from every response a login without `report_access.finance`
// gets, and 403s a write that names them — so the form's field list itself
// switches on useAccess().finance (sampleFieldsFor), and the Value inputs are
// simply not drawn without the grant. The usual fill is automatic: receipting a
// priced sample line on a purchase order writes these by barcode, and the
// fields here are the MANUAL fallback for a tag registered after the fact.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend, safeFetch } from '../lib/api.js'
import { useAccess } from '../auth/AuthContext.jsx'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import TradeAccountPicker from '../admin/TradeAccountPicker.jsx'
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
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  EMPTY_CHECK_OUT,
  NEW_SAMPLE,
  SAMPLES_PATH,
  SAMPLE_LIST_LIMIT,
  SAMPLE_STATUSES,
  WRITABLE_SAMPLE_STATUSES,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  checkInPath,
  checkOutBody,
  checkOutPath,
  createSampleBody,
  createdSampleNote,
  describeSample,
  loanState,
  movementVerb,
  recordedCostText,
  sampleCostText,
  sampleFieldsFor,
  samplePath,
  sampleFilters,
  sampleMeta,
  statusLabel,
  withTradeAccount,
} from './adminSamples.js'
import { SHOWROOMS_PATH } from './adminShowrooms.js'

const COLUMNS = '1.5fr 1.5fr 1fr 1.2fr 250px'
// Both pickers are small tables read whole; neither endpoint is paged by a
// screen that only needs a <select>.
const PICKER_LIMIT = 200

export default function AdminSamples() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('')
  const [showroomId, setShowroomId] = useState('')
  const [overdue, setOverdue] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState({})
  const [newSample, setNewSample] = useState(NEW_SAMPLE)
  const [showNew, setShowNew] = useState(false)
  const [showrooms, setShowrooms] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [checkOut, setCheckOut] = useState(EMPTY_CHECK_OUT)

  // The API's own derived report_access, via /auth/me. It decides which FIELD
  // LIST the two forms work over: without finance the cost pair is neither
  // drawn nor sent (the API deletes the keys from every response and 403s a
  // write naming them), so a showroom login's register stays fully usable. The
  // 403 stays the real gate — this only decides what is drawn.
  const { finance } = useAccess()
  const fields = sampleFieldsFor(finance)

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

  // The two <select> sources. Read once — a showroom or supplier added mid-session
  // is picked up on the next visit, which is the same lifetime every other picker
  // in this repo has.
  useEffect(() => {
    let active = true
    // safeFetch never throws: a picker that failed to load leaves an empty
    // <select>, which must not take the whole register down with it.
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

  // Keep the open editor in step with a reloaded row; close it if the row is
  // gone. Re-seeds on a finance change too, so the draft always matches the
  // field list the form is about to render.
  useEffect(() => {
    if (openId == null) return
    const row = list.rows.find((x) => x.id === openId)
    if (!row) {
      setOpenId(null)
      return
    }
    setDraft(draftFrom(row, sampleFieldsFor(finance)))
  }, [openId, list.rows, finance])

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const toggleRow = (row) => {
    setError('')
    setCheckOut(EMPTY_CHECK_OUT)
    setOpenId((current) => (current === row.id ? null : row.id))
  }

  // createSampleBody, not bodyFrom over SAMPLE_FIELDS: a blank barcode is
  // OMITTED from the body (asking the server to mint a tag), never sent as the
  // explicit null bodyFrom would produce — which the API answers with a 400.
  const createSample = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newSample, fields)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', SAMPLES_PATH, built.body),
      // The minted barcode is flashed here — the one moment the office can read
      // the new tag off the screen while the object is still in hand.
      (res) => createdSampleNote(built.body, res.sample)
    )
    if (ok) {
      setNewSample(NEW_SAMPLE)
      setShowNew(false)
    }
  }

  const saveSample = (row) => {
    const diff = diffFields(row, draft, fields)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return toast.flash('No changes to save.')
    run(() => apiSend('PATCH', samplePath(row.id), diff.patch), 'Sample saved.')
  }

  const archiveSample = (row) => {
    const verb = archiveVerb(row)
    run(
      () => apiSend('POST', archiveTogglePath(row), {}),
      `${describeSample(row) ?? 'That sample'} ${verb === 'archive' ? 'archived' : 'restored'}.`
    )
  }

  const sendOut = async (row) => {
    const built = checkOutBody(checkOut)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', checkOutPath(row), built.body),
      `Checked out to ${built.body.holder_name}.`
    )
    if (ok) setCheckOut(EMPTY_CHECK_OUT)
  }

  // A bodyless POST: the API types the schema ['object','null'] for exactly this
  // call, and `returned_at` defaults to now().
  const takeBack = (row) =>
    run(() => apiSend('POST', checkInPath(row), {}), 'Checked back into the library.')

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const setNewField = (key) => (event) => setNewSample((n) => ({ ...n, [key]: event.target.value }))
  const setCheckOutField = (key) => (event) =>
    setCheckOut((v) => ({ ...v, [key]: event.target.value }))
  // The picker's fold: null clears the link. withTradeAccount also fills a
  // BLANK holder name with the company's, never overwriting a typed one.
  const linkAccount = (account) => setCheckOut((v) => withTradeAccount(v, account))

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Sample register</>}
        subtitle="Every physical sample, where it sits and who has it. Overdue is worked out by the API from the loan's due date — this screen shows what it was told."
        right={
          <CheckField
            label="Show archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
        }
      />
      <SectionTabs tabs={samplesTabs} active="register" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Register a sample"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNew((open) => !open)
                  setError('')
                }}
              >
                {showNew ? 'Cancel' : 'New sample'}
              </GhostButton>
            }
          />
          {showNew && (
            <form onSubmit={createSample} style={{ padding: 20 }}>
              <SampleFields
                values={newSample}
                onChange={setNewField}
                disabled={busy}
                showrooms={showrooms}
                suppliers={suppliers}
                finance={finance}
                creating
              />
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Register sample
                </GhostButton>
              </div>
            </form>
          )}
        </section>

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
            <select
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
            </select>
            <select
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
            </select>
            {/* Tri-state on purpose: "Not late back" is out ON TIME or on the
                shelf, which is a different question from "on the shelf". */}
            <select
              value={overdue}
              onChange={(e) => setOverdue(e.target.value)}
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 150 }}
              aria-label="Overdue"
            >
              <option value="">Overdue: any</option>
              <option value="true">Overdue only</option>
              <option value="false">Not late back</option>
            </select>
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{showNew ? '' : error}</ErrorLine>
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
                  <div key={row.id}>
                    <Row columns={COLUMNS} archived={Boolean(row.archived_at)}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', ...monoText, fontSize: 12 }}>
                          {row.barcode}
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
                        <GhostButton disabled={busy} onClick={() => toggleRow(row)}>
                          {openId === row.id ? 'Close' : 'Edit'}
                        </GhostButton>
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

                    {openId === row.id && (
                      <div
                        style={{
                          padding: '20px 20px 24px',
                          background: c.surface,
                          borderBottom: `1px solid ${c.line}`,
                        }}
                      >
                        {finance && (
                          <div style={{ ...mutedText, fontSize: 11.5, marginBottom: 14 }}>
                            Recorded value: {sampleCostText(row)}. Receipting a priced sample
                            line on a purchase order fills this by barcode; the Value fields
                            below are the manual fallback.
                          </div>
                        )}
                        <SampleFields
                          values={draft}
                          onChange={setField}
                          disabled={busy}
                          showrooms={showrooms}
                          suppliers={suppliers}
                          finance={finance}
                        />
                        <div style={{ marginTop: 18 }}>
                          <GhostButton
                            tone="accent"
                            disabled={busy}
                            onClick={() => saveSample(row)}
                          >
                            Save sample
                          </GhostButton>
                        </div>

                        {movementVerb(row) === 'check-out' ? (
                          <CheckOutForm
                            values={checkOut}
                            onChange={setCheckOutField}
                            onAccount={linkAccount}
                            disabled={busy}
                            onSubmit={() => sendOut(row)}
                          />
                        ) : (
                          <PanelNote>
                            {loanState(row).text}. Check it in from the row above when it comes
                            back.
                          </PanelNote>
                        )}

                        <SampleLoans id={row.id} />
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

// --- sub-components (house style: they live at the bottom of the screen file) ---

// The editable columns, shared by create and edit — SAMPLE_FIELDS is the same
// whitelist the API's PATCH accepts, so the two forms cannot drift apart. The
// ONE create/edit difference is the barcode's copy: on create a blank asks the
// server to mint a tag (createSampleBody omits the key), while on edit the
// column is NOT NULL and blanking it is refused by the diff.
//
// The status select offers WRITABLE_SAMPLE_STATUSES, never the full vocabulary:
// `out` is set by checking the sample out, and offering it here would put a 400
// behind a reasonable-looking choice.
function SampleFields({ values, onChange, disabled, showrooms, suppliers, creating = false }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field
        label="Barcode"
        hint={
          creating
            ? 'Optional — leave blank and the register numbers the tag itself.'
            : 'The tag on the object. Unique, and what the scanner reads.'
        }
      >
        <input
          value={values.barcode ?? ''}
          disabled={disabled}
          onChange={onChange('barcode')}
          placeholder={creating ? 'Leave blank to auto-generate' : undefined}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Label" hint="What staff call it where there is no catalogue link.">
        <input
          value={values.label ?? ''}
          disabled={disabled}
          onChange={onChange('label')}
          style={inputStyle}
        />
      </Field>
      <Field label="Type" hint="Free text: hanger, cutting, book, memo — the office's own word.">
        <input
          value={values.sample_type ?? ''}
          disabled={disabled}
          onChange={onChange('sample_type')}
          style={inputStyle}
        />
      </Field>
      <Field label="Shelf location">
        <input
          value={values.location ?? ''}
          disabled={disabled}
          onChange={onChange('location')}
          style={inputStyle}
        />
      </Field>
      <Field label="Status" hint="“Out” is set by checking the sample out, not here.">
        <select
          value={values.status ?? ''}
          disabled={disabled}
          onChange={onChange('status')}
          style={inputStyle}
          aria-label="Status"
        >
          <option value="">—</option>
          {WRITABLE_SAMPLE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Showroom" hint="Where it stands. Clearing it leaves the sample un-homed, which is normal.">
        <select
          value={values.showroom_id ?? ''}
          disabled={disabled}
          onChange={onChange('showroom_id')}
          style={inputStyle}
          aria-label="Showroom"
        >
          <option value="">—</option>
          {showrooms.map((showroom) => (
            <option key={showroom.id} value={showroom.id}>
              {showroom.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Supplier" hint="Who sent it. History — it survives the house being re-linked.">
        <select
          value={values.supplier_id ?? ''}
          disabled={disabled}
          onChange={onChange('supplier_id')}
          style={inputStyle}
          aria-label="Supplier"
        >
          <option value="">—</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Colourway id"
        hint="The SKU's id, from Catalogue → Colourways. Optional: plenty of samples predate the catalogue."
      >
        <input
          value={values.colourway_id ?? ''}
          disabled={disabled}
          onChange={onChange('colourway_id')}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      {finance && (
        <Field
          label="Value"
          hint="What the sample cost, in the supplier's currency. Blank is “no cost recorded”; 0 is a free hanger — different facts, both kept."
        >
          <input
            value={values.unit_cost ?? ''}
            disabled={disabled}
            inputMode="decimal"
            onChange={onChange('unit_cost')}
            style={{ ...inputStyle, fontFamily: font.mono }}
          />
        </Field>
      )}
      {finance && (
        <Field label="Value currency" hint="Free text — a sample can be bought from anyone in anything, NZD included.">
          <input
            value={values.cost_currency ?? ''}
            disabled={disabled}
            onChange={onChange('cost_currency')}
            style={{ ...inputStyle, fontFamily: font.mono }}
          />
        </Field>
      )}
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

// The counter form. `holder_name` is a SNAPSHOT of who took it, so the loan stays
// readable after a trade account is unlinked or renamed; the due date is optional
// because inventing one would make the sample overdue on a deadline nobody set.
// The trade-account link is optional the same way — the name stands alone for a
// walk-in; the link is what puts the loan on the company's chase list.
function CheckOutForm({ values, onChange, onAccount, disabled, onSubmit }) {
  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
      <div
        style={{ ...mutedText, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}
      >
        Check out
      </div>
      <div
        style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
        }}
        className="r-grid-2"
      >
        <Field label="Who is taking it" hint="Recorded as typed — the loan keeps this name whatever happens to the account.">
          <input
            value={values.holder_name ?? ''}
            disabled={disabled}
            onChange={onChange('holder_name')}
            style={inputStyle}
          />
        </Field>
        <Field label="Due back" hint="Optional. Blank means no date was agreed, so it is never overdue.">
          <input
            type="date"
            value={values.due_back_at ?? ''}
            disabled={disabled}
            onChange={onChange('due_back_at')}
            style={inputStyle}
          />
        </Field>
        <Field label="Notes">
          <input
            value={values.notes ?? ''}
            disabled={disabled}
            onChange={onChange('notes')}
            style={inputStyle}
          />
        </Field>
        <TradeAccountPicker
          value={
            values.trade_account_id
              ? { id: values.trade_account_id, name: values.trade_account_name }
              : null
          }
          onPick={onAccount}
          onClear={() => onAccount(null)}
          disabled={disabled}
          hint="Optional. Linking the company lets the loan queue filter by account and suggest a reminder address."
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <GhostButton tone="accent" disabled={disabled} onClick={onSubmit}>
          Check out
        </GhostButton>
      </div>
    </div>
  )
}

// The movement history, from the by-id read — the list rows do not carry it.
// Append-only: there is no edit and no delete, because a loan is the record the
// register exists to keep. Each row's `overdue` is the API's, like the list's.
function SampleLoans({ id }) {
  const [loans, setLoans] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setStatus('loading')
    apiFetch(samplePath(id))
      .then((body) => {
        if (!active) return
        setLoans(body.sample?.loans ?? [])
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(messageOf(err, 'Could not load this sample’s movements.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [id])

  if (status === 'loading') return <PanelNote>Loading movements…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{error}</PanelNote>

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{ ...mutedText, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}
      >
        Movements
      </div>
      {loans.length === 0 ? (
        <div style={{ ...mutedText, marginTop: 8 }}>
          This sample has never left the library.
        </div>
      ) : (
        <div style={{ marginTop: 8, border: `1px solid ${c.line}`, borderRadius: 4 }}>
          {loans.map((loan) => (
            <div
              key={loan.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr 1fr',
                gap: 12,
                alignItems: 'center',
                padding: '9px 14px',
                borderBottom: `1px solid ${c.line}`,
              }}
            >
              <span style={{ fontSize: 12.5, color: c.ink }}>{loan.holder_name}</span>
              <span style={monoText}>{dateText(loan.out_at)}</span>
              <span style={{ ...monoText, color: loan.overdue ? c.danger : c.inkSoft }}>
                {loan.due_back_at ? `due ${dateText(loan.due_back_at)}` : 'no date agreed'}
              </span>
              <span style={monoText}>
                {loan.returned_at ? `back ${dateText(loan.returned_at)}` : 'still out'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Display only: the ISO date the API sent, cut to its day. Nothing here compares
// it to anything — `overdue` is the API's answer, not this browser's.
function dateText(value) {
  if (typeof value !== 'string' || value.length < 10) return '—'
  return value.slice(0, 10)
}
