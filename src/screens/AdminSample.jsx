// One sample on its own page (23 Sep 2026). The client asked that "any kind of
// data entry … open in their own individual page instead of a tabbed drop
// down", and the register's row was one of those drop-downs: the edit form, the
// counter's check-out form and the movement history all opened INSIDE the row
// and pushed the rest of the register off the screen. The register is the list;
// the sample is the desk — the move the sales order and the supplier made.
//
//   GET    /admin/samples/:id                      → { sample } + loans
//   PATCH  /admin/samples/:id                      → { sample }
//   POST   /admin/samples/:id/check-out|check-in   → { sample }
//
// The single detail read feeds every part of this page — the form, the loan
// line and the movement history — so a check-out re-reads it and the history
// shows the new loan at once. In the row the history was a fetch of its own,
// keyed on the id, and it went stale the moment the sample moved.
//
// Archive, restore and delete stay on the register's row: they are lifecycle
// verbs on a row, and the row is where the office reaches for them. So does
// Check in, the quick verb for a sample handed back over the counter — it is
// here too, because this page has no row above it to point at.
//
// OVERDUE IS THE API'S VALUE, rendered through loanState and never recomputed
// here: a browser comparing the dates itself would answer with the device's
// clock. Nothing from the Dynamics cutting staging table appears here either —
// the page reads /admin/samples/:id only. Both rules are argued at length in
// adminSamples.js and held by its test against this file.
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

import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { c } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { useAccess } from '../auth/AuthContext.jsx'
import { diffFields, draftFrom } from '../admin/drafts.js'
import TradeAccountPicker from '../admin/TradeAccountPicker.jsx'
import SampleFields from './SampleFields.jsx'
import { useSamplePickers } from './useSamplePickers.js'
import {
  ArchivedTag,
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  EMPTY_CHECK_OUT,
  SAMPLES_PATH,
  arrivalNote,
  checkInPath,
  checkOutBody,
  checkOutPath,
  loanState,
  movementVerb,
  sampleCostText,
  sampleFieldsFor,
  sampleMeta,
  samplePath,
  statusLabel,
  withTradeAccount,
} from './adminSamples.js'

export default function AdminSample() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()

  const [sample, setSample] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState({})
  const [checkOut, setCheckOut] = useState(EMPTY_CHECK_OUT)
  const { showrooms, suppliers } = useSamplePickers()

  // The API's own derived report_access, via /auth/me. It decides which FIELD
  // LIST the form works over: without finance the cost pair is neither drawn
  // nor sent (the API deletes the keys from every response and 403s a write
  // naming them), so a showroom login's register stays fully usable. The 403
  // stays the real gate — this only decides what is drawn.
  const { finance } = useAccess()
  const fields = sampleFieldsFor(finance)

  const load = useCallback(async () => {
    const body = await apiFetch(samplePath(id))
    setSample(body.sample ?? null)
    return body.sample ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload:
  // every write here answers with the sample, and re-reading is what brings
  // the movement history along with it.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this sample.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Arriving from the register-a-sample page: its toast — the minted barcode
  // above all — rides in router state, because that page unmounted before it
  // could be shown. Flashed once, then cleared, so a reload or a Back does not
  // announce the registration a second time.
  useEffect(() => {
    const note = arrivalNote(location.state)
    if (!note) return
    flash(note)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, flash, navigate])

  // Re-seed the form from server truth whenever the record reloads. Re-seeds on
  // a finance change too, so the draft always matches the field list the form
  // is about to render.
  useEffect(() => {
    if (!sample) return
    setDraft(draftFrom(sample, sampleFieldsFor(finance)))
  }, [sample, finance])

  const backLink = (
    <>
      <Link to={SAMPLES_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to the sample register
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Sample not found"
        backTo={SAMPLES_PATH}
        backLabel="Back to the sample register"
        message="That sample could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Sample" />
        <PanelNote>Loading sample…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Sample" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!sample) return null

  const saveSample = () => {
    const diff = diffFields(sample, draft, fields)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', samplePath(sample.id), diff.patch), 'Sample saved.')
  }

  const sendOut = async () => {
    const built = checkOutBody(checkOut)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', checkOutPath(sample), built.body),
      `Checked out to ${built.body.holder_name}.`
    )
    if (ok) setCheckOut(EMPTY_CHECK_OUT)
    return undefined
  }

  // A bodyless POST: the API types the schema ['object','null'] for exactly this
  // call, and `returned_at` defaults to now().
  const takeBack = () =>
    run(() => apiSend('POST', checkInPath(sample), {}), 'Checked back into the library.')

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const setCheckOutField = (key) => (event) =>
    setCheckOut((v) => ({ ...v, [key]: event.target.value }))
  // The picker's fold: null clears the link. withTradeAccount also fills a
  // BLANK holder name with the company's, never overwriting a typed one.
  const linkAccount = (account) => setCheckOut((v) => withTradeAccount(v, account))

  const loan = loanState(sample)

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {sample.barcode}
            {sample.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={[sample.label || sample.sample_type, sampleMeta(sample), sample.location]
          .filter(Boolean)
          .join(' · ')}
        right={
          <span style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 12.5, color: c.inkSoft }}>
              {statusLabel(sample.status)}
            </span>
            {/* The API's `overdue`, worded by loanState. Never recomputed here. */}
            <span
              style={{
                display: 'block',
                fontSize: 12.5,
                color: loan.tone === 'danger' ? c.danger : loan.tone === 'ink' ? c.ink : c.muted,
              }}
            >
              {loan.text}
            </span>
          </span>
        }
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Sample" />
        {/* The same stack the row expansion held, in the same order — the value
            line, the form, the movement, the history. */}
        <div style={{ padding: '20px 20px 26px' }}>
          {finance && (
            <div style={{ ...mutedText, fontSize: 11.5, marginBottom: 14 }}>
              Recorded value: {sampleCostText(sample)}. Receipting a priced sample line on a
              purchase order fills this by barcode; the Value fields below are the manual
              fallback.
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
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18 }}>
            <GhostButton tone="accent" disabled={busy} onClick={saveSample}>
              Save sample
            </GhostButton>
          </div>

          {movementVerb(sample) === 'check-out' ? (
            <CheckOutForm
              values={checkOut}
              onChange={setCheckOutField}
              onAccount={linkAccount}
              disabled={busy}
              onSubmit={sendOut}
            />
          ) : (
            <CheckInBlock text={loan.text} disabled={busy} onSubmit={takeBack} />
          )}

          <SampleLoans loans={sample.loans ?? []} />
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

const movementLabel = {
  ...mutedText,
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

// The counter form. `holder_name` is a SNAPSHOT of who took it, so the loan stays
// readable after a trade account is unlinked or renamed; the due date is optional
// because inventing one would make the sample overdue on a deadline nobody set.
// The trade-account link is optional the same way — the name stands alone for a
// walk-in; the link is what puts the loan on the company's chase list.
function CheckOutForm({ values, onChange, onAccount, disabled, onSubmit }) {
  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
      <div style={movementLabel}>Check out</div>
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

// The other half of the movement. In the row this was a note pointing up at
// the row's own Check in button; a page has no row above it, so the verb is
// drawn here, posting the same bodyless check-in the register's row does.
function CheckInBlock({ text, disabled, onSubmit }) {
  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
      <div style={movementLabel}>Check in</div>
      <div style={{ marginTop: 10, fontSize: 12.5, color: c.inkSoft }}>
        {text}. Check it in when it comes back — the loan closes and the sample returns to
        the library.
      </div>
      <div style={{ marginTop: 16 }}>
        <GhostButton tone="accent" disabled={disabled} onClick={onSubmit}>
          Check in
        </GhostButton>
      </div>
    </div>
  )
}

// The movement history, from the by-id read this page already holds — the list
// rows do not carry it. Append-only: there is no edit and no delete, because a
// loan is the record the register exists to keep. Each row's `overdue` is the
// API's, like the sample's own.
function SampleLoans({ loans }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={movementLabel}>Movements</div>
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
