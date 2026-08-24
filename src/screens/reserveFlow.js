// Rules for the LIVE reserves & cuttings screens (AdminReserves,
// AdminReserveNew, AdminReserveReport) — the replacement for the D365
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

// The list screen feeds both dockets and lines through ONE delete dialog; a
// line always carries request_id (NOT NULL in the schema) and a docket never
// does, so that key is the discriminator — no marker fields.
export const isLineRow = (row = {}) => row.request_id != null

export function deleteTargetPath(row = {}) {
  return isLineRow(row) ? linePath(row.id) : reservePath(row.id)
}

export function describeDeleteTarget(row = {}) {
  return isLineRow(row) ? describeLine(row) : describeReserve(row)
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

// The office lives on Dynamics until cutover, so the Dynamics roster is the
// default account source; platform accounts and a typed name stay available.
// Same three-way shape as AdminOrderNew, with `manual` in place of walk-in.
export const ACCOUNT_MODES = Object.freeze([
  { key: 'legacy', label: 'Dynamics client' },
  { key: 'account', label: 'Account client' },
  { key: 'manual', label: 'Typed name' },
])

export const NEW_DOCKET = Object.freeze({
  mode: 'legacy',
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

// The open-editor-follows-the-list rule needs to find a line across the whole
// page of dockets — after a reload, a deleted or filtered-out line must close
// its editor rather than let the next save 404.
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
