// Outstanding loans — the cross-register work queue, wired to atelier-api's
// /admin/sample-loans (W20-US-004 / US-007). Live: the reminder sends are real
// email, recorded against real rows.
//
//   GET  /admin/sample-loans?trade_account_id=&overdue=&due_before=&q=&page=&limit=
//                                     → { loans, meta: { total, page, limit } }
//   POST /admin/sample-loans/reminders/preview  { loan_ids }
//                                     → { drafts, missing }   (renders, sends NOTHING)
//   POST /admin/sample-loans/reminders { loan_id, to, subject, body }
//                                     → 201 { reminder, loan }  (sends VERBATIM)
//
// COMPOSE-BEFORE-SEND IS THE POINT. The preview renders one personalised letter
// per selected loan and sends nothing; every field — the address, the subject,
// the body — is edited here and posted back finished, so the text a staffer
// approved is the text delivered. There is no "send from template" call and no
// scheduler behind this screen: a reminder is a person's click off this queue.
//
// OVERDUE AND DAYS_OVERDUE ARE THE API'S VALUES, rendered and never recomputed
// — the register's rule, one field wider. All the decisions live in
// adminSampleLoans.js with a vitest suite beside them (no jsdom in this repo);
// this file is layout and effects.
//
// Not useCrudScreen: the queue has no delete — a loan is append-only history —
// and the composer's per-draft sent/failed states need the reducer, which
// useMutation's single error line would flatten (the same reason the scanner
// rolls its own `movement`).

import { useReducer, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { useAdminList } from '../admin/useAdminList.js'
import Pagination from '../admin/Pagination.jsx'
import TradeAccountPicker from '../admin/TradeAccountPicker.jsx'
import {
  Select,
  ErrorLine,
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
  useToast,
} from '../admin/parts.jsx'
import {
  IDLE_COMPOSE,
  LOAN_LIST_LIMIT,
  REMINDER_PREVIEW_PATH,
  REMINDER_SEND_PATH,
  SAMPLE_LOANS_PATH,
  composeReducer,
  dayOf,
  describeLoan,
  dueBackText,
  loanFilters,
  overdueBadge,
  previewBody,
  reminderSummary,
  sendBody,
  sendableDrafts,
  sentCount,
  sourceNote,
  toggleId,
} from './adminSampleLoans.js'

const COLUMNS = '26px 1.4fr 1.3fr 1.1fr 1.1fr'

export default function AdminSampleLoans() {
  const [draftTerm, setDraftTerm] = useState('')
  const [term, setTerm] = useState('')
  const [overdue, setOverdue] = useState('')
  const [dueBefore, setDueBefore] = useState('')
  const [account, setAccount] = useState(null)
  const [selection, setSelection] = useState([])
  const [compose, dispatch] = useReducer(composeReducer, IDLE_COMPOSE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { message, flash } = useToast()

  const list = useAdminList({
    path: SAMPLE_LOANS_PATH,
    key: 'loans',
    limit: LOAN_LIST_LIMIT,
    filters: loanFilters({ term, overdue, dueBefore, tradeAccountId: account?.id ?? '' }),
  })

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const toggle = (loan) => setSelection((ids) => toggleId(ids, loan.id))

  // The preview: renders every selected letter, sends nothing. A selected loan
  // the API will not draft comes back in `missing` — it has been returned or
  // never existed — and the list is reloaded so the queue stops offering it.
  const composeReminders = async () => {
    const built = previewBody(selection)
    if (built.error) return setError(built.error)
    setBusy(true)
    setError('')
    try {
      const body = await apiSend('POST', REMINDER_PREVIEW_PATH, built.body)
      dispatch({ type: 'open', drafts: body.drafts, missing: body.missing })
      if ((body.missing ?? []).length > 0) await list.reload()
    } catch (err) {
      setError(messageOf(err, 'The reminders could not be drafted.'))
    } finally {
      setBusy(false)
    }
  }

  // One send per loan, each carrying the text as edited on THIS card. The
  // reducer keeps per-draft sent/failed state, so one refused address never
  // blocks the rest; the list reloads after each send so the queue's chase
  // counts stay the server's.
  const sendOne = async (draft) => {
    const built = sendBody(draft)
    if (built.error) {
      dispatch({ type: 'failed', loanId: draft.loan_id, message: built.error })
      return false
    }
    dispatch({ type: 'sending', loanId: draft.loan_id })
    setBusy(true)
    try {
      const res = await apiSend('POST', REMINDER_SEND_PATH, built.body)
      dispatch({ type: 'sent', loanId: draft.loan_id, loan: res.loan })
      flash(`Reminder sent to ${built.body.to}.`)
      await list.reload()
      return true
    } catch (err) {
      dispatch({
        type: 'failed',
        loanId: draft.loan_id,
        message: messageOf(err, 'The reminder could not be sent, so nothing was recorded.'),
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  // Sequential, not Promise.all: each send is a real email and its own record,
  // and a failure mid-way must leave every earlier card honestly marked sent.
  const sendRemaining = async () => {
    for (const draft of sendableDrafts(compose)) {
      await sendOne(draft)
    }
  }

  const closeComposer = () => {
    dispatch({ type: 'close' })
    setSelection([])
  }

  const composing = compose.status === 'composing'

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Outstanding loans</>}
        subtitle="Everything still out, across the whole register, soonest due first. Select loans and compose reminders: each letter is drafted per borrower, edited here, and sent exactly as approved."
      />
      <SectionTabs tabs={samplesTabs} active="loans" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Out on loan"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {list.total.toLocaleString('en-NZ')} outstanding
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
              placeholder="Holder, barcode or label"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 240 }}
              aria-label="Search loans"
            />
            {/* Tri-state, like the register's: false is out but NOT YET late,
                which is a different question from "on the shelf". */}
            <Select
              value={overdue}
              onChange={(e) => setOverdue(e.target.value)}
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 150 }}
              aria-label="Overdue"
            >
              <option value="">Overdue: any</option>
              <option value="true">Overdue only</option>
              <option value="false">Not yet late</option>
            </Select>
            <input
              type="date"
              value={dueBefore}
              onChange={(e) => setDueBefore(e.target.value)}
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 160 }}
              aria-label="Due before"
              title="Due back before this date. A loan with no agreed date is never matched."
            />
            <div style={{ width: 260 }}>
              <TradeAccountPicker
                value={account}
                onPick={setAccount}
                onClear={() => setAccount(null)}
                disabled={busy}
                label={null}
                compact
              />
            </div>
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
            <span style={{ flex: 1 }} />
            <GhostButton
              tone="accent"
              disabled={busy || selection.length === 0}
              onClick={composeReminders}
            >
              Compose reminders{selection.length > 0 ? ` (${selection.length})` : ''}
            </GhostButton>
          </form>

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {list.status === 'loading' && <PanelNote>Loading the loan queue…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}
          {list.status === 'ready' && list.rows.length === 0 && (
            <PanelNote>
              {term || overdue || dueBefore || account
                ? 'No outstanding loan matches those filters.'
                : 'Nothing is out on loan.'}
            </PanelNote>
          )}

          {list.status === 'ready' && list.rows.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['', 'Holder', 'Sample', 'Due back', 'Reminders']}
              />
              {list.rows.map((loan) => {
                const badge = overdueBadge(loan)
                return (
                  <Row key={loan.id} columns={COLUMNS}>
                    <input
                      type="checkbox"
                      checked={selection.includes(loan.id)}
                      onChange={() => toggle(loan)}
                      disabled={busy}
                      aria-label={`Select the loan to ${describeLoan(loan)}`}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          color: c.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {loan.holder_name}
                      </span>
                      <span style={{ display: 'block', ...monoText, fontSize: 11 }}>
                        {/* Null is an answer: no linked login, no address to suggest. */}
                        {loan.suggested_email ?? 'no address on file'}
                      </span>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', ...monoText, fontSize: 12 }}>
                        {loan.barcode}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: c.inkSoft,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {loan.label || loan.sample_type || '—'}
                      </span>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', ...monoText }}>{dueBackText(loan)}</span>
                      {/* The API's days_overdue, verbatim. Clay is the register's
                          warning tone; red stays for failures. */}
                      {badge && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 10.5,
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: c.clay,
                          }}
                        >
                          {badge.text}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: c.inkSoft }}>
                      {reminderSummary(loan)}
                    </span>
                  </Row>
                )
              })}
            </>
          )}
        </section>

        {composing && (
          <section style={panel}>
            <PanelHead
              label="Compose reminders"
              right={
                <GhostButton disabled={busy} onClick={closeComposer}>
                  Close
                </GhostButton>
              }
            />
            <PanelNote>
              One letter per loan, already personalised. Edit anything — the address, the
              subject, the words — and what you send is exactly what the client receives.
              Nothing goes until its Send is clicked.
            </PanelNote>
            {compose.missing.length > 0 && (
              <PanelNote>
                {compose.missing.length === 1
                  ? 'One selected loan could not be drafted — that sample has come back, so there is nothing to chase.'
                  : `${compose.missing.length} selected loans could not be drafted — those samples have come back, so there is nothing to chase.`}{' '}
                The queue above has been refreshed.
              </PanelNote>
            )}

            {compose.drafts.map((draft) => (
              <ReminderDraft
                key={draft.loan_id}
                draft={draft}
                busy={busy}
                onEdit={(key, value) => dispatch({ type: 'edit', loanId: draft.loan_id, key, value })}
                onSend={() => sendOne(draft)}
              />
            ))}

            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '14px 20px',
              }}
            >
              <GhostButton
                tone="accent"
                disabled={busy || sendableDrafts(compose).length === 0}
                onClick={sendRemaining}
              >
                Send the rest ({sendableDrafts(compose).length})
              </GhostButton>
              <span style={mutedText}>
                {sentCount(compose) > 0
                  ? `${sentCount(compose)} sent this sitting.`
                  : 'Each send is recorded against its loan only once the mail has actually gone.'}
              </span>
            </div>
          </section>
        )}

        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          unit="loans"
          onPage={list.setPage}
          busy={busy}
        />
      </div>

      <ToastLine message={message} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// One draft card. Sent and in-flight cards render read-only — the reducer
// refuses their edits too, but greyed inputs are what SAY so — and the send
// button is replaced by the record of what happened.
function ReminderDraft({ draft, busy, onEdit, onSend }) {
  const badge = overdueBadge(draft)
  const frozen = draft.state === 'sent' || draft.state === 'sending'
  return (
    <div style={{ borderTop: `1px solid ${c.line}`, padding: '18px 20px 22px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
          {draft.holder_name}
        </span>
        <span style={monoText}>
          {draft.barcode}
          {draft.label ? ` · ${draft.label}` : ''}
        </span>
        {badge && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: c.clay,
            }}
          >
            {badge.text}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {/* Which letter this was rendered from — the office's edited one or the
            set letter — so a surprising draft has an explanation. */}
        <span style={{ ...mutedText, fontSize: 11 }}>{sourceNote(draft)}</span>
      </div>
      <div style={{ marginTop: 2, ...mutedText, fontSize: 11.5 }}>
        {reminderSummary(draft)}
        {draft.due_back_at ? ` · due back ${dayOf(draft.due_back_at)}` : ' · no date agreed'}
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
          gap: 16,
        }}
        className="r-grid-2"
      >
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={draftLabel}>To</span>
          <input
            value={draft.to}
            disabled={busy || frozen}
            onChange={(e) => onEdit('to', e.target.value)}
            placeholder="Type an address"
            style={{ ...inputStyle, fontFamily: font.mono, fontSize: 12.5 }}
            aria-label={`Reminder address for ${draft.holder_name}`}
          />
          {draft.to === '' && !frozen && (
            <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: c.clay }}>
              No address on file for this borrower — type one.
            </span>
          )}
        </label>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={draftLabel}>Subject</span>
          <input
            value={draft.subject}
            disabled={busy || frozen}
            onChange={(e) => onEdit('subject', e.target.value)}
            style={inputStyle}
            aria-label={`Reminder subject for ${draft.holder_name}`}
          />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 14 }}>
        <span style={draftLabel}>Letter</span>
        <textarea
          value={draft.body}
          disabled={busy || frozen}
          onChange={(e) => onEdit('body', e.target.value)}
          style={textareaStyle}
          aria-label={`Reminder letter for ${draft.holder_name}`}
        />
      </label>

      <ErrorLine style={{ marginTop: 10 }}>{draft.error}</ErrorLine>
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        {draft.state === 'sent' ? (
          <span style={{ fontSize: 12.5, color: c.sage }}>
            Sent — {reminderSummary(draft).toLowerCase()}.
          </span>
        ) : (
          <GhostButton
            tone="accent"
            disabled={busy || draft.state === 'sending'}
            onClick={onSend}
          >
            {draft.state === 'sending' ? 'Sending…' : 'Send this letter'}
          </GhostButton>
        )}
      </div>
    </div>
  )
}

const draftLabel = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: c.muted,
  marginBottom: 7,
}

const textareaStyle = {
  ...inputStyle,
  height: 'auto',
  minHeight: 180,
  padding: '10px 12px',
  fontFamily: font.mono,
  fontSize: 12.5,
  lineHeight: 1.6,
  resize: 'vertical',
}
