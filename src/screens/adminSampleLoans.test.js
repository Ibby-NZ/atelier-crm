import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import {
  EMAIL_PATTERN,
  IDLE_COMPOSE,
  MAX_DRAFTS,
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

const MODULE_SOURCE = readFileSync(new URL('./adminSampleLoans.js', import.meta.url), 'utf8')
const SCREEN_SOURCE = readFileSync(new URL('./AdminSampleLoans.jsx', import.meta.url), 'utf8')

// A queue row as the API returns it: the loan, its sample's tag, the DERIVED
// overdue pair, the address suggestion and the chase history.
const loan = (extra = {}) => ({
  id: 4,
  sample_id: 7,
  barcode: 'ATX-0001',
  label: 'Atlas hanger',
  sample_type: 'hanger',
  location: 'Bay 3',
  holder_name: 'Peter Kedgley Architects',
  trade_account_id: 12,
  suggested_email: 'studio@kedgley.co.nz',
  out_at: '2026-08-04T02:00:00.000Z',
  due_back_at: '2026-08-18T02:00:00.000Z',
  notes: null,
  overdue: true,
  days_overdue: 6,
  reminder_count: 1,
  last_reminded_at: '2026-08-20T02:00:00.000Z',
  ...extra,
})

// A draft as the preview returns it, before the reducer annotates it.
const draft = (extra = {}) => ({
  loan_id: 4,
  sample_id: 7,
  barcode: 'ATX-0001',
  label: 'Atlas hanger',
  holder_name: 'Peter Kedgley Architects',
  trade_account_id: 12,
  to: 'studio@kedgley.co.nz',
  subject: 'Your Atelier sample ATX-0001',
  body: 'Dear Peter Kedgley Architects, the sample is 6 days overdue.',
  source: 'code',
  due_back_at: '2026-08-18T02:00:00.000Z',
  overdue: true,
  days_overdue: 6,
  reminder_count: 1,
  last_reminded_at: '2026-08-20T02:00:00.000Z',
  ...extra,
})

const opened = (drafts = [draft()], missing = []) =>
  composeReducer(IDLE_COMPOSE, { type: 'open', drafts, missing })

describe('overdue and days_overdue come from the API and are never recomputed', () => {
  it('badges the API booleans, whatever the dates say', () => {
    // The decisive pair, like the register's: dates that contradict the flag.
    // Only a reader of `overdue` gets both right.
    const lateByFlag = loan({ due_back_at: '2099-01-01T00:00:00.000Z', overdue: true })
    expect(overdueBadge(lateByFlag)).toEqual({ text: '6 days overdue', tone: 'clay' })
    const fineByFlag = loan({ due_back_at: '2020-01-01T00:00:00.000Z', overdue: false })
    expect(overdueBadge(fineByFlag)).toBeNull()
  })

  it('says "overdue" for a loan under a day late rather than "0 days"', () => {
    // The API floors days_overdue, so the first hours of lateness read 0 —
    // which is still late, not "due today".
    expect(overdueBadge(loan({ days_overdue: 0 }))).toEqual({ text: 'Overdue', tone: 'clay' })
    expect(overdueBadge(loan({ days_overdue: 1 }))).toEqual({ text: '1 day overdue', tone: 'clay' })
  })

  it('shows no badge for a loan that is out on time — a badge on every row is a badge on none', () => {
    expect(overdueBadge(loan({ overdue: false, days_overdue: null }))).toBeNull()
    expect(overdueBadge({})).toBeNull()
  })

  it('does no date arithmetic anywhere in the module or the screen', () => {
    // The register's rule, held against this screen's source the same way: the
    // API derives lateness against ITS clock, and a browser comparing dates
    // would disagree with the very filter that fetched the row.
    for (const source of [MODULE_SOURCE, SCREEN_SOURCE]) {
      expect(source).not.toMatch(/Date\.now\(/)
      expect(source).not.toMatch(/new Date\(/)
      expect(source).not.toMatch(/Date\.parse\(/)
      expect(source).not.toMatch(/getTime\(/)
    }
    expect(MODULE_SOURCE.length).toBeGreaterThan(0)
    expect(SCREEN_SOURCE.length).toBeGreaterThan(0)
  })

  it('renders a due day by slicing the ISO string, never via the clock', () => {
    expect(dayOf('2026-08-18T02:00:00.000Z')).toBe('2026-08-18')
    expect(dayOf(null)).toBe('')
    expect(dueBackText(loan())).toBe('due 2026-08-18')
    expect(dueBackText(loan({ due_back_at: null }))).toBe('no date agreed')
  })
})

describe('the queue read', () => {
  it('drops unset filters rather than sending them empty', () => {
    expect(buildListQuery(loanFilters())).toBe('')
  })

  it('keeps overdue tri-state', () => {
    // Absent is everything still out; true the chase list; false out but not
    // yet late. `|| null` on this one would erase the false case.
    expect(buildListQuery(loanFilters({ overdue: '' }))).toBe('')
    expect(buildListQuery(loanFilters({ overdue: 'true' }))).toBe('overdue=true')
    expect(buildListQuery(loanFilters({ overdue: 'false' }))).toBe('overdue=false')
  })

  it('passes every set filter through', () => {
    const params = new URLSearchParams(
      buildListQuery(
        loanFilters({ term: ' kedgley ', overdue: 'true', dueBefore: '2026-09-01', tradeAccountId: '12' })
      )
    )
    expect(params.get('q')).toBe('kedgley')
    expect(params.get('overdue')).toBe('true')
    expect(params.get('due_before')).toBe('2026-09-01')
    expect(params.get('trade_account_id')).toBe('12')
  })

  it('addresses the three routes from constants, so a typo is a failing test', () => {
    expect(SAMPLE_LOANS_PATH).toBe('/admin/sample-loans')
    expect(REMINDER_PREVIEW_PATH).toBe('/admin/sample-loans/reminders/preview')
    expect(REMINDER_SEND_PATH).toBe('/admin/sample-loans/reminders')
    // The screen quotes no /admin path of its own — every endpoint arrives as
    // an imported constant, the register's rule.
    expect(SCREEN_SOURCE.match(/['"`]\/admin\/[a-z-]+/g)).toBeNull()
  })
})

describe('row copy', () => {
  it('summarises the chase history for the queue and the composer alike', () => {
    expect(reminderSummary(loan({ reminder_count: 0, last_reminded_at: null }))).toBe('Never chased')
    expect(reminderSummary(loan())).toBe('Chased once · last 2026-08-20')
    expect(reminderSummary(loan({ reminder_count: 3 }))).toBe('Chased 3 times · last 2026-08-20')
  })

  it('names a loan by its holder and its tag', () => {
    expect(describeLoan(loan())).toBe('Peter Kedgley Architects — ATX-0001')
    expect(describeLoan({})).toBe('someone — a sample')
  })

  it('says which letter a draft came from', () => {
    expect(sourceNote(draft({ source: 'database' }))).toMatch(/edited letter/i)
    expect(sourceNote(draft({ source: 'code' }))).toMatch(/set letter/i)
  })
})

describe('the selection and the preview request', () => {
  it('toggles a loan in and out', () => {
    expect(toggleId([], 4)).toEqual([4])
    expect(toggleId([4, 9], 4)).toEqual([9])
  })

  it('refuses an empty selection with a sentence', () => {
    expect(previewBody([]).error).toMatch(/select at least one/i)
  })

  it('dedupes and caps at the API MAX_DRAFTS rather than meeting a schema 400', () => {
    expect(previewBody([4, 4, 9]).body).toEqual({ loan_ids: [4, 9] })
    const over = Array.from({ length: MAX_DRAFTS + 1 }, (_, i) => i + 1)
    expect(previewBody(over).error).toContain(String(MAX_DRAFTS))
    expect(previewBody(Array.from({ length: MAX_DRAFTS }, (_, i) => i + 1)).body.loan_ids).toHaveLength(
      MAX_DRAFTS
    )
  })
})

describe('sendBody: the approved text travels verbatim', () => {
  it('builds the exact send payload, subject and body untouched', () => {
    // Trailing spaces and all: the point of the story is that the text on
    // screen is the text delivered, so nothing may "tidy" it.
    const edited = draft({ subject: 'A politer subject ', body: 'Dear you,\n\ncome back.\n' })
    expect(sendBody(edited).body).toEqual({
      loan_id: 4,
      to: 'studio@kedgley.co.nz',
      subject: 'A politer subject ',
      body: 'Dear you,\n\ncome back.\n',
    })
  })

  it('trims only the address — a stray space is not part of anyone\'s email', () => {
    expect(sendBody(draft({ to: '  studio@kedgley.co.nz  ' })).body.to).toBe('studio@kedgley.co.nz')
  })

  it('says "no address on file" out loud instead of posting an empty to', () => {
    // suggested_email is null for a borrower with no linked login — plenty are
    // not trade clients at all — and the reducer turns that into ''. The screen
    // must ask for an address, not let the API answer with a pattern error.
    expect(sendBody(draft({ to: '' })).error).toMatch(/no address on file/i)
  })

  it('mirrors the API email pattern so a typo is named beside the field', () => {
    expect(EMAIL_PATTERN.test('studio@kedgley.co.nz')).toBe(true)
    expect(EMAIL_PATTERN.test('not-an-address')).toBe(false)
    expect(sendBody(draft({ to: 'not-an-address' })).error).toMatch(/email address/i)
  })

  it('refuses a blank subject or letter', () => {
    expect(sendBody(draft({ subject: '   ' })).error).toMatch(/subject/i)
    expect(sendBody(draft({ body: '' })).error).toMatch(/letter/i)
  })
})

describe('the compose state machine', () => {
  it('opens with every draft editable and the suggestion nulls made typeable', () => {
    const state = opened([draft(), draft({ loan_id: 9, to: null })], [11])
    expect(state.status).toBe('composing')
    expect(state.missing).toEqual([11])
    expect(state.drafts).toHaveLength(2)
    expect(state.drafts.every((d) => d.state === 'draft')).toBe(true)
    // Null means "we have no address"; the input needs '' and the screen says
    // the words.
    expect(state.drafts[1].to).toBe('')
  })

  it('edits exactly one card, and only its letter fields', () => {
    let state = opened([draft(), draft({ loan_id: 9 })])
    state = composeReducer(state, { type: 'edit', loanId: 9, key: 'body', value: 'Rewritten.' })
    expect(state.drafts.find((d) => d.loan_id === 9).body).toBe('Rewritten.')
    expect(state.drafts.find((d) => d.loan_id === 4).body).toBe(draft().body)
    // The record fields are not editable through the reducer at all.
    state = composeReducer(state, { type: 'edit', loanId: 9, key: 'loan_id', value: 999 })
    expect(state.drafts.find((d) => d.loan_id === 9)).toBeTruthy()
    expect(state.drafts.find((d) => d.loan_id === 999)).toBeUndefined()
  })

  it('freezes a sent letter: it is a record now, not a draft', () => {
    let state = opened()
    state = composeReducer(state, { type: 'sent', loanId: 4, loan: loan({ reminder_count: 2 }) })
    expect(state.drafts[0].state).toBe('sent')
    expect(state.drafts[0].reminder_count).toBe(2)
    // Editing what the client already received would make the screen lie.
    const after = composeReducer(state, { type: 'edit', loanId: 4, key: 'body', value: 'oops' })
    expect(after.drafts[0].body).toBe(draft().body)
  })

  it('bumps the chase count itself only when the send answered without the row', () => {
    let state = opened()
    state = composeReducer(state, { type: 'sent', loanId: 4, loan: null })
    expect(state.drafts[0].reminder_count).toBe(2)
  })

  it('holds a failure on its own card and lets the next edit retry', () => {
    let state = opened([draft(), draft({ loan_id: 9 })])
    state = composeReducer(state, { type: 'failed', loanId: 4, message: 'Mailer down.' })
    expect(state.drafts[0].state).toBe('failed')
    expect(state.drafts[0].error).toBe('Mailer down.')
    // One refused send never blocks the rest of the page from going out.
    expect(sendableDrafts(state).map((d) => d.loan_id)).toEqual([4, 9])
    // Fixing the field is the natural retry: the edit returns it to draft.
    state = composeReducer(state, { type: 'edit', loanId: 4, key: 'to', value: 'x@y.nz' })
    expect(state.drafts[0].state).toBe('draft')
    expect(state.drafts[0].error).toBe('')
  })

  it('counts what went and what is still to go', () => {
    let state = opened([draft(), draft({ loan_id: 9 }), draft({ loan_id: 11 })])
    state = composeReducer(state, { type: 'sent', loanId: 9, loan: null })
    state = composeReducer(state, { type: 'sending', loanId: 11 })
    expect(sentCount(state)).toBe(1)
    // In-flight is not sendable — clicking "send the rest" twice must not
    // double a letter.
    expect(sendableDrafts(state).map((d) => d.loan_id)).toEqual([4])
  })

  it('closes back to idle', () => {
    expect(composeReducer(opened(), { type: 'close' })).toBe(IDLE_COMPOSE)
    expect(composeReducer(undefined, {})).toBe(IDLE_COMPOSE)
  })
})

describe('the screen wires the flow it is told to', () => {
  // No jsdom, so the flow cannot be driven; held against the source like the
  // scanner's suite.
  it('previews before it sends, and sends per loan', () => {
    expect(SCREEN_SOURCE).toContain("apiSend('POST', REMINDER_PREVIEW_PATH, built.body)")
    expect(SCREEN_SOURCE).toContain("apiSend('POST', REMINDER_SEND_PATH, built.body)")
    expect(SCREEN_SOURCE).toContain('sendBody(draft)')
  })

  it('reloads the queue after a send, so the chase counts stay the server\'s', () => {
    expect(SCREEN_SOURCE).toContain('await list.reload()')
  })

  it('sends the batch sequentially, never Promise.all', () => {
    // Each send is a real email and its own record; a failure mid-way must
    // leave every earlier card honestly marked. Banned as a CALL, so a comment
    // may still explain the rule — the API's source-scan posture.
    expect(SCREEN_SOURCE).not.toContain('Promise.all(')
  })
})
