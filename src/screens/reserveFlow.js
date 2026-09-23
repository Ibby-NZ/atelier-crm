// Rules for the LIVE reserves & cuttings screens (AdminReserves, the docket
// page AdminReserve, AdminReserveNew, AdminReserveReport and the one-house
// report page AdminReserveSupplierReport) — the replacement for the D365
// fulmar_reserve / cutting entities. Kept apart from the .jsx because there is
// no jsdom here: everything with a wrong answer lives in this file, under test.
//
// The shape the office asked for, in their words: "enter them like a sales
// order — accounts first, then enter the reserve/cutting in each line so we
// don't have to create a new form all the time". So the unit of entry is a
// DOCKET (one account, one visit to the form) holding many LINES, where the
// old system was one form per line. Three corrections to the old report are
// structural here, not conventions:
//
//   · one COLOUR per line (the De Le Cuona sheet had "cols 05 + 06" crammed
//     into a single cell, and the rest of the request buried in a comment);
//   · CUSTOMER REFERENCE is its own column, not a phrase inside the comment;
//   · identical cuttings are one line with a COPIES multiplier (×10, ×20),
//     not ten lines — per account, because the office still wants each
//     account's requests connected to that account.
//
// The status vocabulary is the wish-list one ("more easily visible to see
// when they've arrived and been dispatched"), not the D365 one: In Progress
// splits into requested/confirmed, Complete becomes arrived → dispatched,
// Inactive is cancelled. The API is the authority on transitions and answers
// a wrong move with a 409; ALLOWED_TRANSITIONS below is the mirror that keeps
// a locked door from being drawn as a button, and the test holds a literal
// second copy so a hand-edit cannot drift silently.

export const RESERVES_PATH = '/admin/reserves'

export const reservePath = (id) => `${RESERVES_PATH}/${id}`
export const reserveLinesPath = (id) => `${RESERVES_PATH}/${id}/lines`
export const linePath = (id) => `${RESERVES_PATH}/lines/${id}`
export const lineTransitionPath = (id) => `${RESERVES_PATH}/lines/${id}/transition`

// Static segments that must win over /admin/reserves/:id — Fastify prefers a
// static route over a parametric one, so these are safe, but keep every new
// sibling OUT of the single-integer namespace all the same.
export const RESERVE_SUPPLIERS_PATH = `${RESERVES_PATH}/suppliers`
export const RESERVE_REPORT_PATH = `${RESERVES_PATH}/report`

export function reportPath(supplier) {
  return `${RESERVE_REPORT_PATH}?supplier=${encodeURIComponent(supplier)}`
}

export function reportExportPath(supplier) {
  return `${RESERVE_REPORT_PATH}/export.csv?supplier=${encodeURIComponent(supplier)}`
}

// The CRM pages, as opposed to the API reads above. The strings overlap today
// and the names are separate on purpose: a link is not a fetch, and moving one
// must never silently retarget the other.

// One docket's page. `new` and `report` are static siblings, which the router
// ranks above this dynamic segment — the same rule the API's routes follow.
export const reserveRoute = (id) => `${RESERVES_PATH}/${id}`

// The report page is keyed on the supplier as the API knows it — the free-text
// SNAPSHOT on the line (`reserve_lines.supplier`), exact match, because there
// is no supplier id or slug on a reserve line to key it by. So the name travels
// in the path, encodeURIComponent'd: a house name carries `&`, spaces and now
// and then a `/` ("C&C Milano / Fadini"), and React Router decodes the segment
// back to the exact string (an encoded `/` included) before useParams sees it.
export const RESERVE_REPORT_ROUTE = `${RESERVES_PATH}/report`

export function reportRoute(supplier) {
  return `${RESERVE_REPORT_ROUTE}/${encodeURIComponent(supplier)}`
}

// "3 open lines" — the chooser's count, off the facet's `open_lines`.
export function openLinesLabel(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < 0) return '—'
  return `${n} open line${n === 1 ? '' : 's'}`
}

// The API serves the authoritative CSV (formula-neutralised, every row); the
// disposition header is not CORS-exposed, so the filename falls back to the
// API's own naming rule here, mirrored rather than parsed.
export function reportFilename(supplier) {
  const slug = String(supplier ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `atelier-reserves-${slug || 'supplier'}.csv`
}

// ---------------------------------------------------------------------------
// Line kinds

export const LINE_KINDS = Object.freeze(['reserve', 'cutting'])

export const KIND_LABELS = Object.freeze({
  reserve: 'Reserve',
  cutting: 'Cutting',
})

export const kindLabel = (kind) => KIND_LABELS[kind] ?? String(kind ?? '')

// ---------------------------------------------------------------------------
// Line status machine (mirror — the API's reserve-line-states is the gate)

export const LINE_STATUSES = Object.freeze([
  'requested',
  'confirmed',
  'arrived',
  'dispatched',
  'cancelled',
])

// requested → arrived is legal on purpose: goods turn up that nobody marked
// confirmed, and refusing the truth teaches staff to falsify the middle step.
export const ALLOWED_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['confirmed', 'arrived', 'cancelled']),
  confirmed: Object.freeze(['arrived', 'cancelled']),
  arrived: Object.freeze(['dispatched']),
  dispatched: Object.freeze([]),
  cancelled: Object.freeze([]),
})

const MOVE_LABELS = Object.freeze({
  confirmed: 'Mark confirmed',
  arrived: 'Mark arrived',
  dispatched: 'Mark dispatched',
  cancelled: 'Cancel line',
})

export function availableMoves(line) {
  if (!line) return []
  return (ALLOWED_TRANSITIONS[line.status] ?? []).map((target) => ({
    key: target,
    label: MOVE_LABELS[target] ?? `Move to "${target}"`,
    tone: target === 'cancelled' ? 'danger' : 'accent',
  }))
}

export const STATUS_LABELS = Object.freeze({
  requested: 'Requested',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  dispatched: 'Dispatched',
  cancelled: 'Cancelled',
})

export const statusLabel = (status) => STATUS_LABELS[status] ?? String(status ?? '')

// requested is clay because it is the waiting state — the reserve number is
// still "TBA" and someone is owed a reply. Terminal states go quiet.
export const STATUS_TONE = Object.freeze({
  requested: 'clay',
  confirmed: 'accent',
  arrived: 'sage',
  dispatched: 'muted',
  cancelled: 'muted',
})

export const statusTone = (status) => STATUS_TONE[status] ?? 'muted'

// One timestamp column per state the API stamps in the transition — the
// samples pattern. Dates are ISO-sliced, never `new Date`d: a Date here would
// answer with the DEVICE's clock and time zone.
export const STATUS_STAMPS = Object.freeze({
  confirmed: 'confirmed_at',
  arrived: 'arrived_at',
  dispatched: 'dispatched_at',
  cancelled: 'cancelled_at',
})

export function stampDate(value) {
  const text = String(value ?? '')
  return text.length >= 10 ? text.slice(0, 10) : ''
}

export function stampEntries(line = {}) {
  return Object.entries(STATUS_STAMPS)
    .filter(([, column]) => line[column])
    .map(([status, column]) => ({ status, label: STATUS_LABELS[status], date: stampDate(line[column]) }))
}

// `expired` is the API's value (reserved_until has passed while the line is
// still open) and is never recomputed in the browser — same clock rule the
// sample register's `overdue` follows.
export function lineAttention(line = {}) {
  return line.expired === true ? 'Reserve date passed' : null
}

// ---------------------------------------------------------------------------
// CFA — "cutting for approval", the D365 field the suppliers reply to

export const CFA_VALUES = Object.freeze([
  'not_required',
  'required',
  'ordered',
  'received',
  'approved',
])

export const CFA_LABELS = Object.freeze({
  not_required: 'Not required',
  required: 'Required',
  ordered: 'Ordered',
  received: 'Received',
  approved: 'Approved by client',
})

export const cfaLabel = (value) => (value ? CFA_LABELS[value] ?? String(value) : '—')

// ---------------------------------------------------------------------------
// List filters

const trimmed = (value) => String(value ?? '').trim()

/**
 * Filters for GET /admin/reserves. Every "All" answer must arrive as null so
 * buildListQuery drops it — forwarded as '' the endpoint's enum answers with a
 * 400 that kills the whole list. `include_done` is a flag (`|| null`), not a
 * tri-state: the default list hides dockets whose every line is terminal.
 */
export function reserveFilters({ term = '', kind = '', status = '', supplier = '', showDone = false } = {}) {
  return {
    q: trimmed(term) || null,
    kind: LINE_KINDS.includes(kind) ? kind : null,
    status: LINE_STATUSES.includes(status) ? status : null,
    supplier: trimmed(supplier) || null,
    include_done: showDone || null,
  }
}

// ---------------------------------------------------------------------------
// Naming rows to people

// A docket's identity across the whole list is the account plus its number —
// account names repeat (one client, many visits to the form).
export function describeReserve(docket = {}) {
  const name = trimmed(docket.account_name) || 'Unknown account'
  return docket.id ? `${name} · docket #${docket.id}` : name
}

// A line's identity leads with what it is and what it is of; colour is the
// distinguishing half whenever it is present (the whole point of one colour
// per line).
export function describeLine(line = {}) {
  const parts = [kindLabel(line.kind), trimmed(line.product_name) || 'unnamed design']
  if (trimmed(line.colour)) parts.push(trimmed(line.colour))
  return parts.join(' · ')
}

// Delete is greyed rather than discovered — the API's 409 stays authoritative
// if the row moves under the button. Cancel is the everyday removal; delete
// exists for keying mistakes, so it stops the moment the supplier is involved.
export const DELETABLE_LINE_STATUSES = Object.freeze(['requested', 'cancelled'])

export const isDeletableStatus = (status) => DELETABLE_LINE_STATUSES.includes(status)

export function isDeletableDocket(docket = {}) {
  return (docket.lines ?? []).every((line) => isDeletableStatus(line.status))
}

// ---------------------------------------------------------------------------
// Quantities

// A reserve's qty is metres and may be blank (the old report has blank
// quantities); a cutting is counted in copies. `Number(null)` is 0, which
// would print a missing figure as a real one — hence the explicit dashes.
export function quantityLabel(line = {}) {
  const qty = line.qty == null || line.qty === '' ? null : Number(line.qty)
  const copies = Number(line.multiplier ?? 1)
  const qtyText = qty == null || Number.isNaN(qty) ? null : `${qty} m`
  if (copies > 1) return qtyText ? `${qtyText} × ${copies}` : `× ${copies}`
  return qtyText ?? '—'
}

// ---------------------------------------------------------------------------
// Create form — docket draft

// The working sections are live-only (Sept 2026), so the form offers ONE client
// finder over the platform roster and there is no mode toggle to draw. `legacy`
// and `manual` stay in buildReserveBody — the API takes all three and older
// dockets were raised that way — but nothing in the CRM writes them any more.
export const NEW_DOCKET = Object.freeze({
  mode: 'account',
  user_id: null,
  user_label: '',
  legacy: null,
  account_name: '',
  contact_name: '',
  notes: '',
})

export const NEW_LINE = Object.freeze({
  kind: 'reserve',
  product_name: '',
  range_name: '',
  supplier: '',
  product_code: '',
  price_list_item_id: null,
  colour: '',
  qty: '',
  multiplier: '1',
  customer_reference: '',
  reserve_number: '',
  reserved_until: '',
  cfa: 'not_required',
  comment: '',
})

// A price-list hit is what the old form's Product lookup was: picking one
// fills Range and Supplier the way D365 did on save. product_range holds the
// HOUSE (the v2→v3 template correction), description the design.
export function lineFromPriceHit(hit = {}, kind = 'reserve') {
  return {
    ...NEW_LINE,
    kind: LINE_KINDS.includes(kind) ? kind : 'reserve',
    product_name: trimmed(hit.description) || trimmed(hit.code),
    range_name: trimmed(hit.product_range),
    supplier: trimmed(hit.supplier),
    product_code: trimmed(hit.code),
    price_list_item_id: hit.id ?? null,
  }
}

// "generate a cutting request directly from a reserve" — the wish that made
// the two systems one. The cutting inherits the product identity and the
// account's paperwork, and starts its own life: no reserve number, no dates,
// one copy, linked back through source_line_id.
export function cuttingDraftFrom(line = {}) {
  return {
    ...NEW_LINE,
    kind: 'cutting',
    product_name: trimmed(line.product_name),
    range_name: trimmed(line.range_name),
    supplier: trimmed(line.supplier),
    product_code: trimmed(line.product_code),
    price_list_item_id: line.price_list_item_id ?? null,
    colour: trimmed(line.colour),
    customer_reference: trimmed(line.customer_reference),
    source_line_id: line.id ?? null,
  }
}

// ---------------------------------------------------------------------------
// Create form — validation and body assembly

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function lineProblem(line, index) {
  const at = `Line ${index + 1}`
  if (!LINE_KINDS.includes(line.kind)) return `${at}: choose reserve or cutting.`
  if (!trimmed(line.product_name)) return `${at}: the design name is required.`
  if (trimmed(line.qty)) {
    const qty = Number(line.qty)
    if (!Number.isFinite(qty) || qty <= 0) return `${at}: quantity must be a number above zero.`
  }
  const copies = trimmed(line.multiplier) === '' ? 1 : Number(line.multiplier)
  if (!Number.isInteger(copies) || copies < 1) return `${at}: copies must be a whole number, 1 or more.`
  if (trimmed(line.reserved_until) && !DATE_RE.test(trimmed(line.reserved_until))) {
    return `${at}: the reserved-until date must be a calendar date.`
  }
  if (trimmed(line.cfa) && !CFA_VALUES.includes(trimmed(line.cfa))) return `${at}: unknown CFA state.`
  return null
}

const orNull = (value) => trimmed(value) || null

function toApiLine(line) {
  return {
    kind: line.kind,
    product_name: trimmed(line.product_name),
    range_name: orNull(line.range_name),
    supplier: orNull(line.supplier),
    product_code: orNull(line.product_code),
    price_list_item_id: line.price_list_item_id ?? null,
    colour: orNull(line.colour),
    qty: trimmed(line.qty) ? Number(line.qty) : null,
    multiplier: trimmed(line.multiplier) === '' ? 1 : Number(line.multiplier),
    customer_reference: orNull(line.customer_reference),
    reserve_number: orNull(line.reserve_number),
    reserved_until: orNull(line.reserved_until),
    cfa: orNull(line.cfa),
    comment: orNull(line.comment),
    ...(line.source_line_id ? { source_line_id: line.source_line_id } : {}),
  }
}

export function buildReserveLines(lines = []) {
  if (lines.length === 0) return { ok: false, error: 'Add at least one reserve or cutting line.' }
  for (let i = 0; i < lines.length; i += 1) {
    const problem = lineProblem(lines[i], i)
    if (problem) return { ok: false, error: problem }
  }
  return { ok: true, lines: lines.map(toApiLine) }
}

/**
 * Assemble POST /admin/reserves. Attribution first: a docket needs an account
 * — a platform user id, a Dynamics account's name, or a typed name — never
 * none. The Dynamics account number goes into notes (nothing on the live
 * tables references the staging ones), same rule manual orders follow.
 */
export function buildReserveBody(draft = NEW_DOCKET, lines = [], { legacyReference } = {}) {
  const parsed = buildReserveLines(lines)
  if (!parsed.ok) return parsed
  const base = {
    lines: parsed.lines,
    ...(orNull(draft.contact_name) ? { contact_name: trimmed(draft.contact_name) } : {}),
  }
  const typedNotes = orNull(draft.notes)

  if (draft.mode === 'account') {
    if (draft.user_id == null) return { ok: false, error: 'Choose the client this docket is for.' }
    return { ok: true, body: { ...base, user_id: draft.user_id, ...(typedNotes ? { notes: typedNotes } : {}) } }
  }

  if (draft.mode === 'legacy') {
    if (!draft.legacy) return { ok: false, error: 'Choose the Dynamics client this docket is for.' }
    const name = trimmed(draft.legacy.name)
    if (!name) return { ok: false, error: 'That Dynamics account has no name on file — type one instead.' }
    const reference = typeof legacyReference === 'function' ? legacyReference(draft.legacy) : null
    const notes = [reference, typedNotes].filter(Boolean).join('\n')
    return { ok: true, body: { ...base, account_name: name, ...(notes ? { notes } : {}) } }
  }

  const name = trimmed(draft.account_name)
  if (!name) return { ok: false, error: 'Type the account name this docket is for.' }
  return { ok: true, body: { ...base, account_name: name, ...(typedNotes ? { notes: typedNotes } : {}) } }
}

// ---------------------------------------------------------------------------
// Field declarations (drafts.js reads these in both directions)

export const DOCKET_FIELDS = Object.freeze([
  { key: 'account_name', label: 'Account', kind: 'text', required: true },
  { key: 'contact_name', label: 'Contact', kind: 'text' },
  { key: 'notes', label: 'Notes', kind: 'text' },
])

// `status` is deliberately absent — a move is a verb through the transition
// route, which also writes the stamp that dates it. `multiplier` rides the
// `ref` kind (positive integer) and is required so a clear cannot send null.
export const LINE_FIELDS = Object.freeze([
  { key: 'product_name', label: 'Design', kind: 'text', required: true },
  { key: 'range_name', label: 'Range', kind: 'text' },
  { key: 'supplier', label: 'Supplier', kind: 'text' },
  { key: 'product_code', label: 'Code', kind: 'text' },
  { key: 'colour', label: 'Colour', kind: 'text' },
  { key: 'qty', label: 'Quantity (m)', kind: 'decimal' },
  { key: 'multiplier', label: 'Copies', kind: 'ref', required: true },
  { key: 'customer_reference', label: 'Customer ref', kind: 'text' },
  { key: 'reserve_number', label: 'Reserve number', kind: 'text' },
  { key: 'reserved_until', label: 'Reserved until', kind: 'date' },
  { key: 'cfa', label: 'CFA', kind: 'enum' },
  { key: 'comment', label: 'Comment', kind: 'text' },
])

// The open-editor-follows-the-docket rule needs to find a line after every
// reload — a deleted line must close its editor rather than let the next save
// 404. It takes dockets (plural) so the list's page of them and the docket
// page's single one (`[docket]`) read alike.
export function findLine(dockets = [], lineId) {
  for (const docket of dockets) {
    const line = (docket.lines ?? []).find((candidate) => candidate.id === lineId)
    if (line) return line
  }
  return null
}

// ---------------------------------------------------------------------------
// Docket summaries for the list

export function docketSummary(docket = {}) {
  const lines = docket.lines ?? []
  const open = lines.filter((line) => !['dispatched', 'cancelled'].includes(line.status)).length
  const reserves = lines.filter((line) => line.kind === 'reserve').length
  const cuttings = lines.length - reserves
  const parts = []
  if (reserves > 0) parts.push(`${reserves} reserve${reserves === 1 ? '' : 's'}`)
  if (cuttings > 0) parts.push(`${cuttings} cutting${cuttings === 1 ? '' : 's'}`)
  const shape = parts.join(', ') || 'no lines'
  return open > 0 ? `${shape} · ${open} open` : `${shape} · all closed`
}

// The list shows a docket, not its lines, so a line whose hold date has passed
// is named on the docket's row — otherwise nobody sees it until they open the
// docket. Counted off the API's `expired` (lineAttention), never the clock.
export function docketAttention(docket = {}) {
  const passed = (docket.lines ?? []).filter((line) => lineAttention(line) !== null).length
  if (passed === 0) return null
  return `${passed} reserve date${passed === 1 ? '' : 's'} passed`
}

// ---------------------------------------------------------------------------
// One house's supplier report, read as cards (23 Sep 2026, client asked)
//
// The report was a twelve-column table: at 1280px every cell wrapped to three
// lines and the comment ran down the customer column. The page now reads each
// open line as a card, with a summary of what is still to chase and a switch
// between reserves and cuttings. Everything below works on the rows the API
// already sent — `kind` and `status` arrive as LABELS ("Reserve", "Requested")
// and `expired` is the API's own verdict — so nothing here recomputes a date
// or a status, and nothing constructs a Date.

// The report's two kinds, in the order the page draws them. Keyed on the
// label the report row carries, not the line's `reserve` / `cutting` key.
export const REPORT_KINDS = Object.freeze([
  Object.freeze({ key: 'Reserve', label: 'Reserves' }),
  Object.freeze({ key: 'Cutting', label: 'Cuttings' }),
])

// A line the house has not yet answered with a reference. Blank is the
// platform's own "not yet"; the lines carried over from Dynamics often hold
// the office's placeholder TYPED into the field instead ("TBA", "TBC", "?"),
// and those are the same answer — counting them as numbers would hide half the
// chase list.
const RESERVE_NUMBER_PLACEHOLDER = /^(tba|tbc|tbd|\?+|-+|—)$/i

export function awaitingReserveNumber(row = {}) {
  const text = String(row.reserve_number ?? '').trim()
  return text === '' || RESERVE_NUMBER_PLACEHOLDER.test(text)
}

// What the summary strip counts. "Awaiting reserve #" is the chase list.
export function reportSummary(rows = []) {
  const count = (test) => rows.filter(test).length
  return {
    total: rows.length,
    reserves: count((row) => row.kind === 'Reserve'),
    cuttings: count((row) => row.kind === 'Cutting'),
    awaitingNumber: count(awaitingReserveNumber),
    passed: count((row) => row.expired === true),
  }
}

const REPORT_SEARCH_KEYS = Object.freeze([
  'account_name',
  'contact_name',
  'product_name',
  'product_code',
  'colour',
  'customer_reference',
  'reserve_number',
  'comment',
  'owner_name',
  'range_name',
])

// Narrows the loaded report in the browser: the API serves one house's open
// lines whole (no paging), so there is nothing on a later page to miss.
export function filterReportRows(rows = [], { kind = '', q = '' } = {}) {
  const needle = String(q ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (kind && row.kind !== kind) return false
    if (!needle) return true
    return REPORT_SEARCH_KEYS.some((key) => String(row[key] ?? '').toLowerCase().includes(needle))
  })
}

// Reserves, then cuttings, then anything this build has not been taught (the
// API's label passed through) — never dropped, only never empty.
export function groupReportRows(rows = []) {
  const known = REPORT_KINDS.map(({ key, label }) => ({ key, label, rows: rows.filter((row) => row.kind === key) }))
  const other = [...new Set(rows.map((row) => row.kind).filter((kind) => !REPORT_KINDS.some((k) => k.key === kind)))]
  return [
    ...known,
    ...other.map((kind) => ({ key: String(kind ?? ''), label: String(kind ?? 'Other'), rows: rows.filter((row) => row.kind === kind) })),
  ].filter((group) => group.rows.length > 0)
}

// "16" not "16.00", "4.5" not "4.50" — the pg numeric arrives as text, and the
// trailing zeros are noise on a card. Copies ride along as "× 2".
export function reportQuantity(row = {}) {
  const raw = row.qty == null ? '' : String(row.qty).trim()
  const qty = raw.includes('.') ? raw.replace(/0+$/, '').replace(/\.$/, '') : raw
  const copies = Number(row.multiplier) > 1 ? `× ${row.multiplier}` : ''
  return [qty, copies].filter(Boolean).join(' ') || '—'
}

const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])

// '2026-08-12' → '12 Aug 2026', by reading the text: the API sends dates as
// 'YYYY-MM-DD' strings, and a Date would re-read them in the device's zone.
// Anything else is shown as it came rather than guessed at.
export function reportDateText(value) {
  const text = String(value ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return text || '—'
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${Number(match[3])} ${month} ${match[1]}` : text
}

// The line's range is usually the house itself in capitals ("C & C MILANO" on
// C & C Milano's report) — noise on a page already titled with the house. It
// earns a place only when it says something the title does not.
export function rangeWorthShowing(row = {}, supplier = '') {
  const squash = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const range = squash(row.range_name)
  return range !== '' && range !== squash(supplier)
}
