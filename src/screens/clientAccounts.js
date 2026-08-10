// Pure logic for the Clients screen (src/screens/ClientAccounts.jsx).
//
// The repo has no jsdom and no testing-library, so a component cannot be
// rendered in a test. Anything with a rule in it therefore lives here, beside
// the screen, and is tested directly (see ./clientAccounts.test.js).
//
// Two rules, both of which have a wrong answer that fails silently:
//
//   · The filters. GET /admin/users validates its querystring against an enum,
//     so an unexpected `role` is a 400 and an unexpected `segment` is a 400 — a
//     screen that forwarded whatever a select happened to hold would break the
//     whole list rather than one filter. The whitelist below is what keeps the
//     "All" option (empty string) from becoming `role=`; the kit's
//     buildListQuery drops the nulls it leaves behind.
//   · What a row is. `trade_approved` is meaningless on a customer (the column
//     exists on every users row) and archived beats everything, so the order the
//     branches are tested in is the rule, not an implementation detail.

// The two roles that belong to the client side of the roster. Mirrors
// USER_SEGMENTS.clients in the API's src/users/admin-users.js — the staff roles
// (backoffice, director) are administered on /users, not here.
export const CLIENT_ROLES = Object.freeze(['customer', 'trade'])

export const ROLE_LABELS = Object.freeze({
  customer: 'Customer',
  trade: 'Trade',
})

export const roleLabel = (role) => ROLE_LABELS[role] ?? role ?? '—'

/**
 * Filters for GET /admin/users, as useAdminList wants them.
 *
 * `segment=clients` is never optional: it is what makes this screen the client
 * roster rather than a second copy of Users & permissions. A role outside
 * CLIENT_ROLES becomes null rather than being forwarded — "All" is the absence
 * of the param, and an unknown value would be a 400 from the endpoint's enum
 * that kills the whole list.
 *
 * Every unset filter is null and never '': buildListQuery drops null, undefined
 * and the empty string, and `role=` is exactly the value the enum rejects.
 *
 * @param {{ role?: string, term?: string, showArchived?: boolean }} [filters]
 * @returns {{ segment: string, role: string|null, q: string|null,
 *   include_archived: boolean|null }}
 */
export function clientAccountsFilters({ role = '', term = '', showArchived = false } = {}) {
  return {
    segment: 'clients',
    role: CLIENT_ROLES.includes(role) ? role : null,
    q: String(term ?? '').trim() || null,
    include_archived: showArchived || null,
  }
}

/**
 * The state a row reports, as a StatusPill tone + label.
 *
 * Archived is checked first and wins outright: an archived account cannot sign
 * in at all (the API excludes it from every auth path), so reporting it as
 * "Trade approved" would describe a login that does not work. Below that, the
 * distinction that matters commercially is approved trade versus pending trade
 * — an approved trade login is the only one that sees trade pricing AND the
 * trade-only houses on the storefront; a pending one is treated as a customer.
 *
 * A NON-trade row that still carries `trade_approved` is called out rather than
 * drawn as a plain customer. The API now clears the flag whenever a role moves
 * off `trade`, so this can only be a row demoted before that rule existed — but
 * an invisible stale approval is exactly the thing that hands back trade pricing
 * and every trade-only house the moment someone re-roles the account, so it is
 * worth a pill rather than silence.
 *
 * @param {{ role?: string, trade_approved?: boolean, archived_at?: string|null }} user
 * @returns {{ label: string, tone: 'sage'|'clay'|'muted' }}
 */
export function accountState(user = {}) {
  if (user.archived_at) return { label: 'Archived', tone: 'muted' }
  if (user.role === 'trade') {
    return user.trade_approved
      ? { label: 'Trade approved', tone: 'sage' }
      : { label: 'Trade pending', tone: 'clay' }
  }
  if (user.trade_approved) {
    return { label: `${roleLabel(user.role)} · stale trade flag`, tone: 'clay' }
  }
  return { label: roleLabel(user.role), tone: 'muted' }
}

/**
 * Is this row an applicant rather than a client?
 *
 * A trade application creates the login immediately, with `trade_approved`
 * false, so a pending applicant is already in `segment=clients` from the moment
 * they apply. Listing them among the clients would say the office has taken on a
 * firm it has not reviewed — and the Applicants tab beside this one is where the
 * decision is actually made.
 *
 * Archived wins, as it does in `accountState`: an archived row cannot sign in at
 * all, so it is not waiting on anybody.
 *
 * @param {{ role?: string, trade_approved?: boolean, archived_at?: string|null }} user
 * @returns {boolean}
 */
export function isPendingApplicant(user = {}) {
  if (user.archived_at) return false
  return user.role === 'trade' && !user.trade_approved
}

/**
 * Split the roster into the clients this screen lists and a count of the
 * applications still waiting, which the screen shows as a pointer to the
 * Applicants tab rather than hiding entirely.
 *
 * Client-side because the list is unpaged (UNPAGED_LIST_LIMIT): a server param
 * would grow the endpoint's querystring vocabulary for one consumer. Approving
 * an application flips `trade_approved`, which is exactly what moves the account
 * out of `pending` and into `clients` — one account changing state, never two
 * records.
 *
 * @param {ReadonlyArray<object>} rows
 * @returns {{ clients: object[], pendingCount: number }}
 */
export function partitionClients(rows = []) {
  const clients = rows.filter((row) => !isPendingApplicant(row))
  return { clients, pendingCount: rows.length - clients.length }
}

/**
 * Which verbs a row offers. Archiving is reversible, so the pair is exclusive:
 * a live row offers Archive, an archived one offers Restore, and neither ever
 * offers a DELETE (orders reference the account).
 *
 * `canApprove` gates the trade-approval tick to trade rows, and reads the OPEN
 * EDITOR's role when there is one — not the saved role. Keying it on the saved
 * role forced a two-step promotion (save the role, reopen, tick), and the first
 * of those two steps is the one that grants live access, so the account was
 * entitled for the whole gap. Approving in a single PATCH is safe because the
 * API refuses the contradiction from the other side: any patch moving a role off
 * `trade` clears `trade_approved`, whatever else the body says.
 *
 * @param {{ role?: string, archived_at?: string|null }} user
 * @param {{ role?: string }} [draft] the open editor's draft, when one is open
 */
export function rowActions(user = {}, draft = {}) {
  const archived = Boolean(user.archived_at)
  const role = draft.role ?? user.role
  return {
    archived,
    archiveLabel: archived ? 'Restore' : 'Archive',
    archivePath: archived ? 'restore' : 'archive',
    canApprove: role === 'trade',
  }
}
