// The rules behind AdminSamples, kept out of the .jsx so they can be tested.
// This repo has no jsdom, so a component cannot be rendered — the house pattern
// is a plain .js beside the screen (see adminSuppliers.js) holding everything
// that is a decision rather than a layout.
//
// The register answers three questions: what is on the shelf, what is out, and
// what is late back. Four decisions shape how this screen may answer them, and
// each one is a correctness rule rather than a style choice:
//
//   - **OVERDUE COMES FROM THE API AND IS NEVER RECOMPUTED HERE.** The API
//     derives it at read time as `returned_at IS NULL AND due_back_at < now()`
//     and hands it over as `sample.overdue`. A browser that compared the dates
//     itself would answer with the DEVICE's clock and time zone — a showroom
//     laptop set an hour fast would chase a client whose sample is not late —
//     and would disagree with every filter and export the API produces. This
//     module reads the boolean and nothing else; there is no date arithmetic in
//     it, and `adminSamples.test.js` asserts that against the source.
//   - **Nothing from the Dynamics cutting staging table is ever displayed.**
//     Its free-text staff column is the back office's scratchpad and carries
//     third parties' names, emails, phones and home addresses in current rows.
//     The register reads `/admin/samples` only; `sample.notes` is the platform's
//     own staff-typed field and is a different thing entirely. A source scan
//     holds both screens to it.
//   - **`out` is not a status a form may write.** It is the one status that
//     ASSERTS an open loan exists, and only the check-out route writes both
//     tables in the transaction that makes it true. The API refuses it at the
//     schema AND in the module; the form must not offer it, or staff meet a 400
//     for asking a reasonable-looking question.
//   - **A movement is a verb, never a status change.** Check-out and check-in
//     are their own endpoints for that reason, and the screen offers whichever
//     one the row's open loan makes possible.

export const SAMPLES_PATH = '/admin/samples'

// The API pages at 200. 25 keeps the register scannable on a laptop; the pager
// is the kit's.
export const SAMPLE_LIST_LIMIT = 25

/** `/admin/samples/12`. One place, so a typo is a failing test not a 404. */
export const samplePath = (id) => `${SAMPLES_PATH}/${id}`

/** The scanner's read, shared with US-009's SampleScanner. Exact, 200 or 404. */
export const byBarcodePath = (barcode) =>
  `${SAMPLES_PATH}/by-barcode/${encodeURIComponent(barcode ?? '')}`

export const checkOutPath = (sample) => `${samplePath(sample?.id)}/check-out`
export const checkInPath = (sample) => `${samplePath(sample?.id)}/check-in`

/**
 * Which lifecycle verb a row offers. An archived sample offers `restore`; a live
 * one offers `archive`. Both are POSTs to the same path shape.
 *
 * @param {{ archived_at?: string|null }} sample
 * @returns {'archive'|'restore'}
 */
export const archiveVerb = (sample) => (sample?.archived_at ? 'restore' : 'archive')

/** The endpoint the row's toggle posts to. */
export const archiveTogglePath = (sample) => `${samplePath(sample?.id)}/${archiveVerb(sample)}`

/**
 * The endpoint "Archive instead" posts to — ALWAYS archive. It is offered on a
 * REFUSED delete, so pointing it at the toggle would answer a request to remove
 * the row by restoring it. Same split adminCatalogue.js draws.
 */
export const archiveInsteadPath = (sample) => `${samplePath(sample?.id)}/archive`

// The full vocabulary `samples_status_check` holds — what the LIST may filter
// on. `out` is here because "what is out" is the register's headline question,
// even though nothing on this screen may write it.
export const SAMPLE_STATUSES = Object.freeze(['in_library', 'out', 'missing', 'retired'])

// What a create or a PATCH may write: everything except `out`. DERIVED from the
// vocabulary rather than re-typed, exactly as the API derives
// WRITABLE_SAMPLE_STATUSES from SAMPLE_STATUSES — so a status added to one set
// cannot be missing from the other.
export const WRITABLE_SAMPLE_STATUSES = Object.freeze(
  SAMPLE_STATUSES.filter((status) => status !== 'out')
)

// The column stores lower_snake_case; nobody reads "in_library" as a place.
export const STATUS_LABELS = Object.freeze({
  in_library: 'In the library',
  out: 'Out on loan',
  missing: 'Missing',
  retired: 'Retired',
})

export const statusLabel = (status) => STATUS_LABELS[status] ?? status ?? '—'

// Mirrors SAMPLE_UPDATE_COLUMNS in atelier-api's src/samples/admin-samples.js —
// the frozen whitelist a PATCH may write. A key declared here and missing there
// is stripped by Ajv's removeAdditional before the handler sees it, so it would
// silently save nothing.
//
// `barcode` IS editable: it is a printed tag that can be mistyped and nothing
// references it (`sample_loans.sample_id` points at the row's id), so a
// correction is safe and a collision is the same 409 the create answers with.
export const SAMPLE_FIELDS = Object.freeze([
  { key: 'barcode', label: 'Barcode', kind: 'text', required: true },
  { key: 'label', label: 'Label', kind: 'text' },
  { key: 'sample_type', label: 'Type', kind: 'text' },
  { key: 'location', label: 'Shelf location', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'enum' },
  { key: 'colourway_id', label: 'Colourway', kind: 'ref' },
  { key: 'supplier_id', label: 'Supplier', kind: 'ref' },
  { key: 'showroom_id', label: 'Showroom', kind: 'ref' },
  { key: 'notes', label: 'Notes', kind: 'text' },
])

export const NEW_SAMPLE = Object.freeze({
  barcode: '',
  label: '',
  sample_type: '',
  location: '',
  status: '',
  colourway_id: '',
  supplier_id: '',
  showroom_id: '',
  notes: '',
})

/**
 * The list filters, in the shape buildListQuery expects.
 *
 * Every optional filter is passed as `value || null` so it VANISHES when unset:
 * buildListQuery drops null/undefined/empty, and an "All" select forwarded as an
 * empty string would become `status=`, which the endpoint's enum answers with a
 * 400 that kills the WHOLE list rather than one filter.
 *
 * `overdue` is TRI-STATE and must stay so: absent leaves the list alone, true is
 * the chase list, false is "not late back" — out on time OR on the shelf. It is
 * therefore not passed through `|| null` (that would erase the `false` case);
 * only the empty selection becomes null.
 *
 * @param {{ term?: string, status?: string, showroomId?: string|number,
 *   supplierId?: string|number, overdue?: string, showArchived?: boolean }} [state]
 */
export function sampleFilters({
  term = '',
  status = '',
  showroomId = '',
  supplierId = '',
  overdue = '',
  showArchived = false,
} = {}) {
  return {
    q: term,
    status: status || null,
    showroom_id: showroomId || null,
    supplier_id: supplierId || null,
    overdue: overdue === '' ? null : overdue === 'true',
    include_archived: showArchived || null,
  }
}

/**
 * The row's name in the confirm dialog. The barcode identifies a sample across
 * the whole register — it is the unique column and the tag on the object — where
 * a label ("Atlas hanger") is freely duplicated.
 *
 * @param {{ barcode?: string, label?: string }} sample
 * @returns {string|undefined}
 */
export function describeSample(sample) {
  const barcode = typeof sample?.barcode === 'string' ? sample.barcode.trim() : ''
  if (barcode === '') return undefined
  const label = typeof sample?.label === 'string' ? sample.label.trim() : ''
  return label === '' ? barcode : `${barcode} (${label})`
}

/**
 * Which movement the row offers. An open loan means it is out and can come back;
 * no open loan means it can go out.
 *
 * Derived from `open_loan`, not from `status`: the loan row is what the movement
 * writes and what the one-open-loan index guards, and the two can only disagree
 * if something has gone wrong — in which case the loan is the truth.
 *
 * @param {{ open_loan?: object|null }} sample
 * @returns {'check-out'|'check-in'}
 */
export const movementVerb = (sample) => (sample?.open_loan ? 'check-in' : 'check-out')

/**
 * How a row's loan state reads, taking `overdue` from the API verbatim.
 *
 * There is no date comparison here and there must never be one — see the module
 * header. `sample.overdue` is the API's derivation; this function only chooses
 * words for it.
 *
 * @param {{ overdue?: boolean, open_loan?: {holder_name?: string}|null }} sample
 * @returns {{ text: string, tone: 'danger'|'ink'|'muted' }}
 */
export function loanState(sample) {
  const loan = sample?.open_loan ?? null
  if (!loan) return { text: 'On the shelf', tone: 'muted' }
  const holder = typeof loan.holder_name === 'string' ? loan.holder_name.trim() : ''
  const who = holder === '' ? 'someone' : holder
  // The API's boolean, verbatim — never a clock reading taken in this browser.
  return sample.overdue === true
    ? { text: `Overdue — with ${who}`, tone: 'danger' }
    : { text: `Out with ${who}`, tone: 'ink' }
}

/** One line of catalogue identity for the row's second line. */
export function sampleMeta(sample = {}) {
  const parts = [sample.brand_name, sample.product_name, sample.colourway_name]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  if (parts.length) return parts.join(' · ')
  // A sample with no catalogue link is normal, not broken: plenty predate the
  // catalogue or come from a house Atelier does not stock, and `label` is what
  // identifies those.
  return sample.label ? 'Not linked to a design' : 'No design and no label'
}

/**
 * Build a check-out body from the counter form.
 *
 * `holder_name` is the only required field. `due_back_at` is deliberately
 * optional: plenty of samples go out with no date agreed, and inventing one
 * would make them overdue on a deadline nobody set. A blank date is omitted
 * rather than sent as null — the API's schema types it a string, so an explicit
 * null is a 400.
 *
 * @param {{ holder_name?: string, due_back_at?: string, notes?: string }} draft
 * @returns {{ body: object }|{ error: string }}
 */
export function checkOutBody(draft = {}) {
  const holder = typeof draft.holder_name === 'string' ? draft.holder_name.trim() : ''
  if (holder === '') {
    return { error: 'Who is taking it? A loan that cannot say who has the sample answers nothing.' }
  }
  const body = { holder_name: holder }
  const due = typeof draft.due_back_at === 'string' ? draft.due_back_at.trim() : ''
  if (due !== '') body.due_back_at = due
  const notes = typeof draft.notes === 'string' ? draft.notes.trim() : ''
  if (notes !== '') body.notes = notes
  return { body }
}

export const EMPTY_CHECK_OUT = Object.freeze({ holder_name: '', due_back_at: '', notes: '' })

/**
 * Is this the by-barcode lookup saying "no such sample"? A 404 there is an
 * ANSWER, not a failure: the endpoint is an exact match on the unique column
 * and it found nothing, so the scanner offers the register instead of an error
 * line. Anything else — a network drop, a 500 — is a failure and reads through
 * messageOf as usual.
 *
 * @param {{ status?: number }|unknown} error
 * @returns {boolean}
 */
export const isNotFound = (error) => error?.status === 404
