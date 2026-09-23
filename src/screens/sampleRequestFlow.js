// Pure rules for the sample requests queue (AdminSampleRequests.jsx) — the
// storefront's sample enquiry cart, landed (16 Sep 2026). No jsdom here, so
// every rule the screen draws from lives in this module and is tested in
// sampleRequestFlow.test.js; the .jsx is layout and effects.
//
// The lifecycle mirrors atelier-api's src/samples/sample-request-states.js,
// the sampleFlow.js arrangement: the API is the authority and answers a wrong
// move with a 409; the mirror is so staff are never shown a door that is locked.

export const SAMPLE_REQUESTS_PATH = '/admin/sample-requests'
export const SAMPLE_REQUEST_LIST_LIMIT = 25

export const sampleRequestPath = (id) => `${SAMPLE_REQUESTS_PATH}/${id}`
// The CRM page for one request (23 Sep 2026 — every record opens on its own
// page). The same string as the API path today, and a separate name on
// purpose: a link is not a fetch, and moving one should never silently
// retarget the other.
export const sampleRequestRoute = (id) => `${SAMPLE_REQUESTS_PATH}/${id}`
export const transitionPath = (row) => `${sampleRequestPath(row?.id)}/transition`
export const archiveVerb = (row) => (row?.archived_at ? 'restore' : 'archive')
export const archiveTogglePath = (row) => `${sampleRequestPath(row?.id)}/${archiveVerb(row)}`
// "Archive instead" is offered on a REFUSED delete: always the archive verb,
// never the row's toggle (which would restore an archived row in answer to a
// request to remove it).
export const archiveInsteadPath = (row) => `${sampleRequestPath(row?.id)}/archive`

export const SAMPLE_REQUEST_STATUSES = Object.freeze(['pending', 'sent', 'declined'])

export const ALLOWED_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['sent', 'declined']),
  sent: Object.freeze([]),
  declined: Object.freeze([]),
})

export const STATUS_STAMPS = Object.freeze({
  sent: 'sent_at',
  declined: 'declined_at',
})

export const DELETABLE_SAMPLE_REQUEST_STATUSES = Object.freeze(['pending', 'declined'])
export const isDeletableStatus = (status) => DELETABLE_SAMPLE_REQUEST_STATUSES.includes(status)

export const STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  sent: 'Sent',
  declined: 'Declined',
})
export const statusLabel = (status) => STATUS_LABELS[status] ?? status ?? '—'

export const STATUS_TONE = Object.freeze({
  pending: 'accent',
  sent: 'sage',
  declined: 'clay',
})
export const statusTone = (status) => STATUS_TONE[status] ?? 'muted'

const MOVE_LABELS = Object.freeze({
  sent: 'Mark sent',
  declined: 'Decline',
})

/** The moves the row may take, as buttons. Archived rows get none. */
export function availableMoves(row) {
  if (!row || row.archived_at) return []
  return (ALLOWED_TRANSITIONS[row.status] ?? []).map((target) => ({
    key: target,
    label: MOVE_LABELS[target] ?? `Move to "${target}"`,
    tone: target === 'declined' ? 'danger' : 'accent',
  }))
}

/** The date part of an API timestamp — a slice, never a Date in this browser. */
export const stampDate = (value) => (typeof value === 'string' ? value.slice(0, 10) : '')

/** When the row last moved, for the "Moved" column. */
export function movedLine(row = {}) {
  if (row.status === 'sent' && row.sent_at) return `Sent ${stampDate(row.sent_at)}`
  if (row.status === 'declined' && row.declined_at) return `Declined ${stampDate(row.declined_at)}`
  return `Received ${stampDate(row.created_at)}`
}

/**
 * The list query. buildListQuery drops null/undefined/'', so an "All" select
 * forwarded as '' would become `status=` and a 400 that kills the whole list —
 * every filter here is passed as `value || null`.
 */
export function sampleRequestFilters({ term, status, showArchived } = {}) {
  return {
    q: (term ?? '').trim() || null,
    status: status || null,
    include_archived: showArchived ? 'true' : null,
  }
}

/** Who asked: the account's name, then the typed contact, then the email. */
export function requesterLabel(row = {}) {
  return row.account_name || row.contact_name || row.contact_email || '—'
}

/** One line per colourway for the collapsed row: "Atlas — Flax" … */
export function linesSummary(row = {}) {
  const lines = Array.isArray(row.lines) ? row.lines : []
  if (lines.length === 0) return 'No colourways'
  const names = lines.slice(0, 3).map((line) =>
    [line.product_name || line.sku, line.colourway_name].filter(Boolean).join(' — ')
  )
  const more = lines.length > 3 ? ` +${lines.length - 3} more` : ''
  return `${names.join(' · ')}${more}`
}

export function lineCountLabel(row = {}) {
  const n = Array.isArray(row.lines) ? row.lines.length : 0
  return n === 1 ? '1 cutting' : `${n} cuttings`
}

/** Names the row to a person in the delete dialog: the request number. */
export function describeSampleRequest(row) {
  return row?.request_number ?? null
}
