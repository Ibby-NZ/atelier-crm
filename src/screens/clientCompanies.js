// Pure logic for the Accounts screen (src/screens/ClientCompanies.jsx) — the
// client roster: every company the office trades with, LIVE in
// `trade_accounts` since the cutover merge carried the Dynamics accounts over.
//
// It is the ONE client record (Sept 2026): the old Clients tab (portal logins)
// and Applicants tab (the review queue) folded into it. A row carries its
// logins, edited in place, and the trade application that raised it, so
// approving an applicant is a verb on the company they applied as. No jsdom
// here, so anything that is a rule lives in this file with a test.

import { TRADE_ACCOUNTS_PATH } from '../admin/tradeAccounts.js'

export { TRADE_ACCOUNTS_PATH }
export const COMPANIES_PATH = '/clients/accounts'
// The review queue: the roster narrowed to companies with an unapproved trade
// login. Where /clients/applicants and the office's alert mail now land.
export const PENDING_ACCOUNTS = `${COMPANIES_PATH}?pending=true`
export const PAGE_LIMIT = 50

// The API's own vocabulary on `customer_type` (it came over from D365 as
// typed). Anything else is forwarded as-is — the API takes free text and an
// unknown value simply matches nothing, so no enum guard is needed here.
export const CUSTOMER_TYPES = Object.freeze(['Trade', 'Retail'])

/**
 * Filters for GET /admin/trade-accounts, as useAdminList wants them: every
 * unset one null (buildListQuery drops null / undefined / ''), never ''.
 *
 * @param {{ term?: string, customerType?: string, showArchived?: boolean, pending?: boolean }} [filters]
 */
export function companyFilters({ term = '', customerType = '', showArchived = false, pending = false } = {}) {
  return {
    q: String(term ?? '').trim() || null,
    customer_type: String(customerType ?? '').trim() || null,
    include_archived: showArchived || null,
    pending: pending || null,
  }
}

/** Who to ring, in one cell: the named primary contact, else the first contact on the book, else nobody. */
export function contactLine(account) {
  const name = account.primary_contact_name?.trim()
  if (name) return name
  return account.contact_count > 0 ? `${account.contact_count} on file` : '—'
}

/** City then country, whichever exist. */
export function whereLine(account) {
  return [account.city, account.country].map((s) => s?.trim()).filter(Boolean).join(', ') || '—'
}

// The two roles a client login can hold. Mirrors USER_SEGMENTS.clients in the
// API's src/users/admin-users.js — staff roles are administered on /users.
export const CLIENT_ROLES = Object.freeze(['customer', 'trade'])
export const ROLE_LABELS = Object.freeze({ customer: 'Customer', trade: 'Trade' })
export const roleLabel = (role) => ROLE_LABELS[role] ?? role ?? '—'

/**
 * Is this login still waiting on the office? A live trade login nobody has
 * approved. Archived wins: declining IS archiving (the only durable "no" a
 * users row carries), so an archived one is not waiting on anybody.
 */
export const isPendingLogin = (user = {}) =>
  !user.archived_at && user.role === 'trade' && !user.trade_approved

/**
 * The state a company row reports off its logins. Awaiting review beats
 * everything live: a pending applicant is the row the office has to act on.
 * Then approved trade (what unlocks trade pricing), then plain logins, then
 * none. Archived logins do not count as logins.
 *
 * @param {{ users?: Array<object> }} account
 * @returns {{ tone: 'sage'|'clay'|'muted', label: string }}
 */
export function loginsLine(account) {
  const users = (account.users ?? []).filter((u) => !u.archived_at)
  if (users.some(isPendingLogin)) return { tone: 'clay', label: 'Awaiting review' }
  if (users.length === 0) return { tone: 'muted', label: 'No login' }
  const plural = users.length === 1 ? '' : 's'
  if (users.some((u) => u.role === 'trade' && u.trade_approved)) {
    return { tone: 'sage', label: `${users.length} login${plural} · trade` }
  }
  return { tone: 'muted', label: `${users.length} login${plural}` }
}

/**
 * The pill one login reports. Archived first and wins outright: an archived
 * login cannot sign in at all, so calling it "Trade approved" would describe
 * a login that does not work. An archived trade login that was never approved
 * is a DECLINED applicant — the only durable "no" the schema can express.
 *
 * @param {{ role?: string, trade_approved?: boolean, archived_at?: string|null }} user
 * @returns {{ label: string, tone: 'sage'|'clay'|'muted' }}
 */
export function loginState(user = {}) {
  if (user.archived_at) {
    return user.role === 'trade' && !user.trade_approved
      ? { label: 'Declined', tone: 'muted' }
      : { label: 'Archived', tone: 'muted' }
  }
  if (user.role === 'trade') {
    return user.trade_approved
      ? { label: 'Trade approved', tone: 'sage' }
      : { label: 'Awaiting review', tone: 'clay' }
  }
  return { label: roleLabel(user.role), tone: 'muted' }
}

/**
 * Which verbs a login offers. Archive/restore is one exclusive pair (it is
 * reversible). Approve and decline are offered to a pending trade login only;
 * the approval tick in the editor reads the OPEN DRAFT's role, so a promotion
 * to trade and its approval save as ONE patch — the API refuses the
 * contradiction from its side (a role moving off trade clears the flag).
 *
 * @param {{ role?: string, trade_approved?: boolean, archived_at?: string|null }} user
 * @param {{ role?: string }} [draft] the open editor's draft, when one is open
 */
export function loginActions(user = {}, draft = {}) {
  const archived = Boolean(user.archived_at)
  const pending = isPendingLogin(user)
  return {
    archived,
    archiveLabel: archived ? 'Restore' : 'Archive',
    archivePath: archived ? 'restore' : 'archive',
    approve: pending,
    decline: pending,
    canApprove: (draft.role ?? user.role) === 'trade',
  }
}

/**
 * One declaration per login field, read by draftFrom / diffFields / bodyFrom so
 * the editor cannot format a value one way and parse it another. `email` is
 * required in BOTH directions: an account with no address could never sign in.
 */
export const LOGIN_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text', required: true },
  { key: 'phone', label: 'Phone', kind: 'text' },
  { key: 'role', label: 'Role', kind: 'enum', required: true },
  { key: 'trade_approved', label: 'Trade approved', kind: 'bool' },
])

// Create takes no trade_approved (a new trade login starts unapproved, exactly
// as an application does) and no phone (the create route takes none).
export const NEW_LOGIN_FIELDS = Object.freeze(LOGIN_FIELDS.filter((f) => !['trade_approved', 'phone'].includes(f.key)))
export const NEW_LOGIN = Object.freeze({ name: '', email: '', role: 'trade' })

/** The body that creates a login ON this company (POST /admin/users). */
export const newLoginBody = (accountId, values) => ({ ...values, trade_account_id: Number(accountId) })

/** The Dynamics record behind a row, in the Archive. */
export function archivePath(account) {
  return account.legacy_account_guid ? `/archive/accounts?filter=guid:eq:${account.legacy_account_guid}` : null
}

// The company details (PATCH /admin/trade-accounts/:id, any CRM login since
// 22 Sep 2026). Declared once for drafts.js so a
// value cannot be formatted one way and parsed another. The company NAME leads
// and is editable ONLY on a row with no Dynamics GUID — on a linked row it is
// what the client portal matches invoice history on, and the API 422s a
// rename; `canRename` is what greys the box.
export const ACCOUNT_FIELDS = Object.freeze([
  { key: 'company_name', label: 'Company', required: true },
  { key: 'account_number', label: 'Account #' },
  { key: 'customer_type', label: 'Type' },
  { key: 'primary_contact_name', label: 'Primary contact' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'payment_terms', label: 'Payment terms' },
  { key: 'xero_contact_id', label: 'Xero contact' },
  { key: 'account_manager_name', label: 'Account manager' },
])

// What a NEW company takes (POST /admin/trade-accounts): the name and the
// details the office took down; no Xero id or manager yet.
export const NEW_ACCOUNT_FIELDS = Object.freeze(
  ACCOUNT_FIELDS.filter((f) => !['xero_contact_id', 'account_manager_name'].includes(f.key))
)

export const canRename = (account) => !account.legacy_account_guid

/**
 * Delete form is offered only once every login on the company is archived or
 * gone: a live login's form is the thing under review, or an approved client's
 * business record. The API refuses to delete a login while a form points at
 * it, so this is how a declined applicant's email is ever freed.
 */
export const canDeleteApplication = (account = {}) =>
  Boolean(account.trade_application_id) && (account.users ?? []).every((u) => u.archived_at)

export const accountPath = (id) => `${TRADE_ACCOUNTS_PATH}/${id}`
export const loginPath = (userId) => `/admin/users/${userId}`
export const unlinkPath = (accountId, userId) => `${accountPath(accountId)}/users/${userId}`
export const applicationPath = (id) => `/admin/trade-applications/${id}`
