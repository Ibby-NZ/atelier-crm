// The rules behind AdminShowrooms, kept out of the .jsx so they can be tested.
// This repo has no jsdom, so a component cannot be rendered — the house pattern
// is a plain .js beside the screen (see adminSuppliers.js) holding everything
// that is a decision rather than a layout.
//
// A showroom is where samples stand and where sample orders are sent. It is a
// plain address book — name, address, city, three contact fields, notes — and
// deliberately says nothing about what is IN it: that is `samples.showroom_id`
// and `sample_orders.showroom_id`, both pointing this way.
//
// Two decisions worth naming, because getting either wrong is not cosmetic:
//   - **Archive is the verb that almost always works.**
//     `sample_orders.showroom_id` is NOT NULL and RESTRICT, so a showroom that
//     has ever been sent an order can never be hard-deleted; and `samples`
//     blocks it too. The kit is therefore given an `archive` action so a blocked
//     delete can offer "Archive instead" rather than leaving staff to un-home
//     every sample first — which would destroy where they stood.
//   - **"Archive instead" is NOT the row's Archive/Restore toggle.** It is
//     offered on a REFUSED delete, so pointing it at the toggle would answer the
//     refusal by restoring an already-archived row. Two functions, not one with
//     a flag — the same split adminCatalogue.js draws.

export const SHOWROOMS_PATH = '/admin/showrooms'

// The endpoint returns the whole list with a meta envelope and pages at 200; the
// office has a handful of showrooms, so one page is the whole table in practice.
export const SHOWROOM_LIST_LIMIT = 50

/** `/admin/showrooms/12`. One place, so a typo is a failing test not a 404. */
export const showroomPath = (id) => `${SHOWROOMS_PATH}/${id}`

/**
 * The CRM page for one showroom (23 Sep 2026 — every record opens on its own
 * page). It reads the same as the API path today, and is a separate name on
 * purpose: a link is not a fetch, and moving one should never silently
 * retarget the other.
 */
export const showroomRoute = (id) => `${SHOWROOMS_PATH}/${id}`

/**
 * The new-showroom page — it used to be a form that dropped down above the
 * list. The router ranks `/new` above `/:id`, so it is never read as an id.
 */
export const NEW_SHOWROOM_ROUTE = `${SHOWROOMS_PATH}/new`

/**
 * Which lifecycle verb a row offers. An archived showroom offers `restore`; a
 * live one offers `archive`. Both are POSTs to the same path shape.
 *
 * @param {{ archived_at?: string|null }} showroom
 * @returns {'archive'|'restore'}
 */
export const archiveVerb = (showroom) => (showroom?.archived_at ? 'restore' : 'archive')

/** The endpoint the row's toggle posts to. */
export const archiveTogglePath = (showroom) =>
  `${showroomPath(showroom?.id)}/${archiveVerb(showroom)}`

/**
 * The endpoint "Archive instead" posts to — ALWAYS archive. A refused delete is
 * a request to make the row go away; restoring it would do the opposite.
 */
export const archiveInsteadPath = (showroom) => `${showroomPath(showroom?.id)}/archive`

// Mirrors SHOWROOM_UPDATE_COLUMNS in atelier-api's src/samples/showrooms.js —
// the frozen whitelist a PATCH may write. A key declared here and missing there
// is stripped by Ajv's removeAdditional before the handler sees it, so it would
// silently save nothing.
//
// `name` IS editable, unlike a slug: nothing addresses a showroom by it (both
// child tables point at the id), so a typo taken down over the phone is a
// correction rather than a new showroom. It is required in both directions
// because the column is NOT NULL and unique.
export const SHOWROOM_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'address', label: 'Address', kind: 'text' },
  { key: 'city', label: 'City', kind: 'text' },
  { key: 'contact_name', label: 'Contact', kind: 'text' },
  { key: 'contact_email', label: 'Contact email', kind: 'text' },
  { key: 'contact_phone', label: 'Contact phone', kind: 'text' },
  { key: 'notes', label: 'Notes', kind: 'text' },
])

export const NEW_SHOWROOM = Object.freeze({
  name: '',
  address: '',
  city: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  notes: '',
})

/**
 * The list filters, in the shape buildListQuery expects. `include_archived` is
 * passed as `flag || null` so it VANISHES when off rather than serialising as
 * `include_archived=false` — the documented way a boolean filter opts out.
 *
 * @param {{ term?: string, showArchived?: boolean }} [state]
 * @returns {{ q: string, include_archived: true|null }}
 */
export function showroomFilters({ term = '', showArchived = false } = {}) {
  return { q: term, include_archived: showArchived || null }
}

/**
 * The row's name in the confirm dialog. A showroom name is unique across the
 * whole table, so it identifies a row on its own — unlike a collection, whose
 * slug is unique only within its house.
 *
 * @param {{ name?: string }} showroom
 * @returns {string|undefined}
 */
export function describeShowroom(showroom) {
  const name = typeof showroom?.name === 'string' ? showroom.name.trim() : ''
  return name === '' ? undefined : name
}

/** One line of address-book identity for the row's second line. */
export function showroomMeta(showroom = {}) {
  const parts = [showroom.city, showroom.contact_name, showroom.contact_phone]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No address or contact on file'
}

/**
 * What the detail read says is standing in a showroom, phrased for a person.
 *
 * This is the only advance warning the screen has that Delete will be refused —
 * the CRUD kit forbids a pre-flight "can I delete this" GET, because it races
 * the delete and the API's 409 is already authoritative. The counts come from
 * `GET /admin/showrooms/:id` and count ARCHIVED rows too, exactly as the delete
 * probes do, so what a staff member reads here cannot be contradicted by the
 * refusal a moment later.
 *
 * @param {{ sample_count?: number, sample_order_count?: number }|null} detail
 * @returns {{ text: string, blocked: boolean }}
 */
export function holdsSummary(detail) {
  const samples = Number(detail?.sample_count ?? 0)
  const orders = Number(detail?.sample_order_count ?? 0)
  const parts = []
  if (samples > 0) parts.push(`${samples} sample${samples === 1 ? '' : 's'}`)
  if (orders > 0) parts.push(`${orders} sample order${orders === 1 ? '' : 's'}`)
  if (parts.length === 0) {
    return { text: 'Nothing stands here — this showroom can be deleted outright.', blocked: false }
  }
  return {
    text: `${parts.join(' · ')} point at this showroom, so Delete will be refused. Archive it instead.`,
    blocked: true,
  }
}
