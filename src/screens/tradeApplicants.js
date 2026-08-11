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
// Both tabs now derive the pending set from the same rule, so the count on
// Clients and the rows here can no longer disagree. They cannot SHARE
// `isPendingApplicant`, and the reason is written out at `isPendingEntry`: the
// account embedded in an application is a partial projection, and a predicate
// reading a column it does not carry fails silently rather than loudly.
//
// A form-less entry carries `form: null`; the screen says so rather than drawing
// an empty version of the paper form.

const time = (value) => {
  const ms = new Date(value ?? '').getTime()
  return Number.isNaN(ms) ? 0 : ms
}

// Newest first, with the key as the tie-break so the order is total: two entries
// created in the same millisecond must not swap places between renders.
const byNewest = (a, b) => time(b.created_at) - time(a.created_at) || a.key.localeCompare(b.key)

/**
 * Does a form-less trade login belong on this queue at all?
 *
 * Pending, or DECLINED — an archived trade login that was never approved is a
 * decline, and dropping it here would make declining look exactly like the bug
 * this screen was built to fix: the row vanishes from the tab it was decided on,
 * with no way to undo it there. `isPendingApplicant` cannot answer this, because
 * archived is precisely what it excludes.
 *
 * An APPROVED account is out either way: live, it is a plain client already on
 * the Clients tab; archived, it is a client the office retired, which is not a
 * decision anybody is waiting on.
 *
 * @param {{ role?: string, trade_approved?: boolean }} user
 * @returns {boolean}
 */
const belongsInQueue = (user = {}) => user.role === 'trade' && !user.trade_approved

/**
 * Merge submitted applications with the trade logins that have none — the ones
 * still pending, and the ones declined (see `belongsInQueue`).
 *
 * An application whose account has been removed (`user: null`) is kept — it is
 * still a business record, and the screen labels it — but it can never be
 * matched to a user, so it can never suppress one.
 *
 * @param {ReadonlyArray<object>} applications rows from GET /admin/trade-applications
 * @param {ReadonlyArray<object>} users rows from
 *   GET /admin/users?segment=clients&role=trade&include_archived=true — the
 *   archived half is what carries the declines, so the filter is NOT optional
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
    .filter((u) => belongsInQueue(u) && !claimed.has(u.id))
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
 * Is this entry still waiting on somebody? An entry whose account is gone or
 * archived is not waiting, whatever the form says.
 *
 * **It deliberately does NOT call `isPendingApplicant`, and that is a fix rather
 * than a duplication.** That predicate tests `role === 'trade'` — correct
 * against a `/admin/users` row, where `trade_approved` means nothing on a
 * customer — but the account embedded in an APPLICATION is a partial projection,
 * and it carried no `role` at all. `undefined === 'trade'` is false and raises
 * nothing, so every submitted application was filed as "not awaiting review":
 * the storefront's applications vanished from the queue while the Clients tab
 * went on counting the same accounts as pending, which is exactly the mismatch
 * the office reported. The API now sends `role` too, but this must not depend on
 * it: an entry is on this queue only because `buildReviewQueue` put it there,
 * and both branches are trade by construction — a `trade_applications` row is
 * only ever written by the trade signup, and the form-less branch filters on the
 * role itself.
 *
 * @param {{user?: object|null}} entry
 * @returns {boolean}
 */
export const isPendingEntry = (entry = {}) =>
  Boolean(entry.user) && !entry.user.archived_at && !entry.user.trade_approved

/**
 * The pill a row reports. Review state comes off the account, never the form:
 * `users.trade_approved` is the single source of truth for approval.
 *
 * **Archived is checked first and then split on the approval flag.** There is no
 * `declined` column — declining IS archiving the login, which is the only
 * durable "no" the schema can express (see the screen's Decline button). But an
 * account that was approved and archived LATER was not declined, and calling it
 * that would misreport a live client the office simply retired. Archived +
 * never approved is a decline; archived + approved is an approved account that
 * has since been archived.
 *
 * @param {{user?: object|null}} entry
 * @returns {{ label: string, tone: 'sage'|'clay'|'muted' }}
 */
export function reviewState(entry = {}) {
  if (!entry.user) return { label: 'Account removed', tone: 'muted' }
  if (entry.user.archived_at) {
    return entry.user.trade_approved
      ? { label: 'Approved · archived', tone: 'muted' }
      : { label: 'Declined', tone: 'muted' }
  }
  if (entry.user.trade_approved) return { label: 'Approved', tone: 'sage' }
  return { label: 'Pending review', tone: 'clay' }
}

/**
 * Which verbs a row offers.
 *
 * Declining archives the login: `archived_at` is the only durable "no" on a
 * users row, and the API excludes an archived account from every auth path, so
 * a declined applicant cannot sign in — where a pending one is merely told the
 * application is awaiting review and could wait for ever. It is reversible, so
 * the pair is exclusive: an archived row offers Restore and nothing else, which
 * puts it back exactly where it was rather than approving it by the back door.
 *
 * An entry whose account has been removed offers nothing — there is no users row
 * left to patch.
 *
 * @param {{user?: object|null}} entry
 * @returns {{ approve: boolean, decline: boolean, unapprove: boolean, restore: boolean }}
 */
export function entryActions(entry = {}) {
  const none = { approve: false, decline: false, unapprove: false, restore: false }
  if (!entry.user) return none
  if (entry.user.archived_at) return { ...none, restore: true }
  if (entry.user.trade_approved) return { ...none, unapprove: true }
  return { ...none, approve: true, decline: true }
}
