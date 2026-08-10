// Pure logic for the Applicants screen (src/screens/TradeApplicants.jsx).
//
// **The review queue is pending TRADE ACCOUNTS, not submitted forms.** It used
// to be `GET /admin/trade-applications` alone, and that left a hole big enough
// to lose an account in: a trade login created in the back office
// (`POST /admin/users` with role `trade`) has no `trade_applications` row, so it
// never appeared here — while the Clients tab beside it held the same row back
// as "awaiting review" (partitionClients). The account existed, was counted, and
// was listed nowhere, so nobody could approve, edit or archive it. From the
// office's side that reads as "creating a trade account does nothing".
//
// Both tabs now derive the pending set from the same predicate — this module
// reuses `isPendingApplicant` rather than restating it — so the count on Clients
// and the rows here can no longer disagree.
//
// A form-less entry carries `form: null`; the screen says so rather than drawing
// an empty version of the paper form.

import { isPendingApplicant } from './clientAccounts.js'

const time = (value) => {
  const ms = new Date(value ?? '').getTime()
  return Number.isNaN(ms) ? 0 : ms
}

// Newest first, with the key as the tie-break so the order is total: two entries
// created in the same millisecond must not swap places between renders.
const byNewest = (a, b) => time(b.created_at) - time(a.created_at) || a.key.localeCompare(b.key)

/**
 * Merge submitted applications with the pending trade logins that have none.
 *
 * An application whose account has been removed (`user: null`) is kept — it is
 * still a business record, and the screen labels it — but it can never be
 * matched to a user, so it can never suppress one.
 *
 * An APPROVED account with no form is deliberately not included: it is a plain
 * client, already listed on the Clients tab, and nobody is waiting on it.
 *
 * @param {ReadonlyArray<object>} applications rows from GET /admin/trade-applications
 * @param {ReadonlyArray<object>} users rows from GET /admin/users?segment=clients&role=trade
 * @returns {Array<{key: string, form: object|null, user: object|null,
 *   business_name: string, created_at: string}>}
 */
export function buildReviewQueue(applications = [], users = []) {
  const claimed = new Set(applications.map((a) => a.user?.id).filter((id) => id != null))

  const submitted = applications.map((a) => ({
    key: `application-${a.id}`,
    form: a,
    user: a.user ?? null,
    business_name: a.business_name,
    created_at: a.created_at,
  }))

  const backOffice = users
    .filter((u) => isPendingApplicant(u) && !claimed.has(u.id))
    .map((u) => ({
      key: `user-${u.id}`,
      form: null,
      user: u,
      business_name: u.name || u.email,
      created_at: u.created_at,
    }))

  return [...submitted, ...backOffice].sort(byNewest)
}

/**
 * Is this entry still waiting on somebody? Mirrors `isPendingApplicant`, applied
 * to the joined account — an entry whose account is gone or archived is not
 * waiting, whatever the form says.
 *
 * @param {{user?: object|null}} entry
 * @returns {boolean}
 */
export const isPendingEntry = (entry = {}) =>
  Boolean(entry.user) && isPendingApplicant(entry.user)

/**
 * The pill a row reports. Review state comes off the account, never the form:
 * `users.trade_approved` is the single source of truth for approval.
 *
 * @param {{user?: object|null}} entry
 * @returns {{ label: string, tone: 'sage'|'clay'|'muted' }}
 */
export function reviewState(entry = {}) {
  if (!entry.user) return { label: 'Account removed', tone: 'muted' }
  if (entry.user.archived_at) return { label: 'Account archived', tone: 'muted' }
  if (entry.user.trade_approved) return { label: 'Approved', tone: 'sage' }
  return { label: 'Pending review', tone: 'clay' }
}
