// The rules behind AdminSampleLoans, kept out of the .jsx so they test without
// a DOM (the adminSamples.js pattern — this repo has no jsdom).
//
// The screen is the OUTSTANDING register and the reminder work queue at once,
// because those two screens ask one question: what is out, everywhere. It reads
// `GET /admin/sample-loans` — every loan with `returned_at IS NULL`, which is
// not a filter and cannot be overridden — and composes reminders off the same
// rows. Four decisions shape it:
//
//   - **OVERDUE AND DAYS_OVERDUE COME FROM THE API, VERBATIM.** The same rule
//     the register carries, one field wider: `days_overdue` is derived
//     server-side from the SAME expression as `overdue` and is NULL (not 0) for
//     a loan that is not late, because 0 reads as "due today". A browser doing
//     the subtraction itself would answer with the device's clock and disagree
//     with the very filter that fetched the row. There is no date arithmetic in
//     this module or its screen, and the test scans the source for it.
//   - **THE DRAFT AND THE SEND ARE TWO CALLS, AND THE TEXT TRAVELS VERBATIM.**
//     `POST …/reminders/preview` renders one letter per loan and sends nothing;
//     a staffer edits it; `POST …/reminders` takes the finished to/subject/body
//     and the API sends exactly that. That is the point of the story — the body
//     a staffer approved is the body that goes — so sendBody validates and
//     never rewrites: no trimming of the letter, no re-render, no template name
//     on the wire. A draft that has been SENT is frozen by the reducer, because
//     editing it afterwards would make the screen disagree with the record.
//   - **`suggested_email` IS A SUGGESTION AND NULL IS AN ANSWER.** A loan has
//     no email column (plenty of borrowers are not trade clients), so the API
//     suggests the linked login's address when there is one and the screen must
//     be able to say "no address on file" out loud. The staffer confirms or
//     replaces it; the send snapshots whatever they approved.
//   - **A loan the preview will not draft comes back in `missing`, never
//     silently dropped** — it has come back or never existed, and a draft list
//     quietly shorter than the selection reads as a rendering bug. The screen
//     says so in words.

export const SAMPLE_LOANS_PATH = '/admin/sample-loans'
export const REMINDER_PREVIEW_PATH = `${SAMPLE_LOANS_PATH}/reminders/preview`
export const REMINDER_SEND_PATH = `${SAMPLE_LOANS_PATH}/reminders`

// The API pages at 200; 25 keeps the queue scannable, like the register.
export const LOAN_LIST_LIMIT = 25

// Mirrors MAX_DRAFTS in atelier-api's src/routes/admin-sample-loans.js: the
// preview drafts a page of the work queue at a time, and a selection past the
// cap must be refused HERE with a sentence rather than arrive as a schema 400.
export const MAX_DRAFTS = 50

// Mirror of the API's EMAIL_PATTERN (its Ajv has no `email` format, so the
// route validates with this exact regex) — checked here so a typo is named
// beside the field instead of coming back as "body/to must match pattern".
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * The list filters, in the shape buildListQuery expects — unset filters vanish
 * (an empty value would 400 the whole list at the endpoint's schema), and
 * `overdue` stays TRI-STATE exactly as the register's does: absent is
 * everything still out, true is the chase list, false is out but not yet late.
 *
 * `due_before` deliberately reaches the API as the raw date: a loan with NO
 * agreed date is not matched by it (the API's comparison yields NULL), because
 * "no date agreed" is not "due by Friday".
 *
 * @param {{ term?: string, overdue?: string, dueBefore?: string,
 *   tradeAccountId?: string|number }} [state]
 */
export function loanFilters({ term = '', overdue = '', dueBefore = '', tradeAccountId = '' } = {}) {
  return {
    q: term,
    overdue: overdue === '' ? null : overdue === 'true',
    due_before: dueBefore || null,
    trade_account_id: tradeAccountId || null,
  }
}

/**
 * An ISO timestamp's day, for display only. A slice, never a Date: nothing on
 * this screen reads the device's clock.
 */
export function dayOf(value) {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : ''
}

/** How the due-back cell reads. No agreed date is a fact, not a blank. */
export function dueBackText(loan = {}) {
  const day = dayOf(loan.due_back_at)
  return day ? `due ${day}` : 'no date agreed'
}

/**
 * The lateness badge, from the API's derivation VERBATIM. Null when the loan is
 * not overdue — out on time gets no badge, because a badge on every row is a
 * badge on none. `days_overdue` can be 0 for a loan under a day late (the API
 * floors it), which still deserves the word rather than "0 days".
 *
 * Clay, not danger: overdue is the register's warning tone (the same choice
 * stock's "oversold" makes), while red stays reserved for failures.
 *
 * @param {{ overdue?: boolean, days_overdue?: number|null }} loan
 * @returns {{ text: string, tone: 'clay' }|null}
 */
export function overdueBadge(loan = {}) {
  if (loan.overdue !== true) return null
  const days = Number(loan.days_overdue)
  if (!Number.isInteger(days) || days < 1) return { text: 'Overdue', tone: 'clay' }
  return { text: days === 1 ? '1 day overdue' : `${days} days overdue`, tone: 'clay' }
}

/**
 * How often this borrower has been chased, and when last — what tells a staffer
 * whether to send a politer letter or pick up the phone.
 */
export function reminderSummary(loan = {}) {
  const count = Number(loan.reminder_count ?? 0)
  if (!Number.isInteger(count) || count < 1) return 'Never chased'
  const times = count === 1 ? 'Chased once' : `Chased ${count} times`
  const last = dayOf(loan.last_reminded_at)
  return last ? `${times} · last ${last}` : times
}

/** The loan's name in copy: who has what. */
export function describeLoan(loan = {}) {
  const holder = typeof loan.holder_name === 'string' && loan.holder_name.trim() !== ''
    ? loan.holder_name.trim()
    : 'someone'
  const what = loan.barcode || loan.label || 'a sample'
  return `${holder} — ${what}`
}

/** Toggle a loan in the selection. Pure, so the checkbox column tests. */
export function toggleId(ids = [], id) {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
}

/**
 * The preview request, or the reason there is none. Deduplicated (a re-render
 * cannot double an id) and capped at the API's MAX_DRAFTS with a sentence
 * instead of a schema 400.
 *
 * @param {number[]} ids
 * @returns {{ body: { loan_ids: number[] } }|{ error: string }}
 */
export function previewBody(ids = []) {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0)
  if (unique.length === 0) {
    return { error: 'Select at least one loan to compose reminders for.' }
  }
  if (unique.length > MAX_DRAFTS) {
    return {
      error: `Compose for at most ${MAX_DRAFTS} loans at a time — the drafts are read and approved one page of the queue at a time.`,
    }
  }
  return { body: { loan_ids: unique } }
}

/**
 * The send request for one approved draft, or the reason it cannot go.
 *
 * The address is trimmed (a stray space would fail the API's pattern and the
 * copy-pasted address is the same address); the subject and the body travel
 * VERBATIM — validation only refuses a blank, because the text on screen being
 * the text delivered is the whole of the story.
 *
 * @param {{ loan_id?: number, to?: string, subject?: string, body?: string }} draft
 * @returns {{ body: { loan_id: number, to: string, subject: string, body: string } }|{ error: string }}
 */
export function sendBody(draft = {}) {
  if (!Number.isInteger(draft.loan_id) || draft.loan_id < 1) {
    return { error: 'This draft has lost its loan. Close the composer and compose again.' }
  }
  const to = typeof draft.to === 'string' ? draft.to.trim() : ''
  if (to === '') {
    return { error: 'No address on file for this borrower — type one before sending.' }
  }
  if (!EMAIL_PATTERN.test(to)) {
    return { error: `“${to}” does not look like an email address.` }
  }
  const subject = typeof draft.subject === 'string' ? draft.subject : ''
  if (subject.trim() === '') {
    return { error: 'The subject is blank.' }
  }
  const body = typeof draft.body === 'string' ? draft.body : ''
  if (body.trim() === '') {
    return { error: 'The letter is blank. Revert your edits or close the composer.' }
  }
  return { body: { loan_id: draft.loan_id, to, subject, body } }
}

/** Which letter a draft was rendered from, for the card's corner. */
export function sourceNote(draft = {}) {
  return draft.source === 'database' ? 'From the edited letter' : 'From the set letter'
}

// --- the compose state machine --------------------------------------------
//
// One reducer, like the scanner's, because the composer is a small state
// machine and useState confetti is how a "sent" card becomes editable again by
// accident. Each draft carries its own `state` — draft → sending → sent, with
// failed → draft on the next edit — so one refused send never blocks the rest
// of the page from going out.

export const IDLE_COMPOSE = Object.freeze({ status: 'idle', drafts: [], missing: [] })

// The keys an edit may touch. `loan_id` and friends are the record; these three
// are the letter.
const EDITABLE_KEYS = Object.freeze(['to', 'subject', 'body'])

const updateDraft = (state, loanId, patch) => ({
  ...state,
  drafts: state.drafts.map((draft) => (draft.loan_id === loanId ? { ...draft, ...patch } : draft)),
})

export function composeReducer(state = IDLE_COMPOSE, action = {}) {
  switch (action.type) {
    case 'open':
      return {
        status: 'composing',
        missing: Array.isArray(action.missing) ? action.missing : [],
        drafts: (Array.isArray(action.drafts) ? action.drafts : []).map((draft) => ({
          ...draft,
          // The suggestion may be null — "we have no address" — and the input
          // needs a string either way.
          to: draft.to ?? '',
          state: 'draft',
          error: '',
        })),
      }
    case 'edit': {
      if (!EDITABLE_KEYS.includes(action.key)) return state
      const target = state.drafts.find((draft) => draft.loan_id === action.loanId)
      // A sent letter is a record, not a draft: editing it would make the
      // screen show text the client never received. Sending is in flight for
      // the same reason.
      if (!target || target.state === 'sent' || target.state === 'sending') return state
      // An edit clears the card's error and returns a failed card to draft —
      // the natural next move after fixing the address the API refused.
      return updateDraft(state, action.loanId, {
        [action.key]: action.value,
        state: 'draft',
        error: '',
      })
    }
    case 'sending':
      return updateDraft(state, action.loanId, { state: 'sending', error: '' })
    case 'sent':
      return updateDraft(state, action.loanId, {
        state: 'sent',
        error: '',
        // The API answers the send with the queue row as it now reads. Taken
        // verbatim when present; the +1 is only the fallback for a response
        // that carried no row.
        reminder_count:
          action.loan?.reminder_count ??
          Number(state.drafts.find((draft) => draft.loan_id === action.loanId)?.reminder_count ?? 0) + 1,
        last_reminded_at:
          action.loan?.last_reminded_at ??
          state.drafts.find((draft) => draft.loan_id === action.loanId)?.last_reminded_at ??
          null,
      })
    case 'failed':
      return updateDraft(state, action.loanId, { state: 'failed', error: action.message ?? '' })
    case 'close':
      return IDLE_COMPOSE
    default:
      return state
  }
}

/** The drafts "Send the rest" still has to send: unsent and not in flight. */
export function sendableDrafts(state = IDLE_COMPOSE) {
  return state.drafts.filter((draft) => draft.state === 'draft' || draft.state === 'failed')
}

/** How many went, for the composer's footer. */
export function sentCount(state = IDLE_COMPOSE) {
  return state.drafts.filter((draft) => draft.state === 'sent').length
}
