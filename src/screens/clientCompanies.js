// Pure logic for the Accounts screens — the roster (src/screens/ClientCompanies.jsx),
// one company's page (ClientCompany.jsx) and the create page
// (ClientCompanyNew.jsx): every company the office trades with, LIVE in
// `trade_accounts` since the cutover merge carried the Dynamics accounts over.
//
// It is the ONE client record (Sept 2026): the old Clients tab (portal logins)
// and Applicants tab (the review queue) folded into it. A company carries its
// logins, edited in place on its page, and the trade application that raised
// it, so approving an applicant is a verb on the company they applied as. No
// jsdom here, so anything that is a rule lives in this file with a test.

import { TRADE_ACCOUNTS_PATH } from '../admin/tradeAccounts.js'

export { TRADE_ACCOUNTS_PATH }
export const COMPANIES_PATH = '/clients/accounts'
// The review queue: the roster narrowed to companies with an unapproved trade
// login. The Applicants tab inside Accounts (a sidebar "New accounts" item
// from 24 Sep 2026 until 28 Sep 2026) is this queue on its own route, and
// where /clients/applicants and the old ?pending=true links land.
export const PENDING_ACCOUNTS = `${COMPANIES_PATH}?pending=true`
export const NEW_ACCOUNTS_ROUTE = '/clients/new-accounts'
export const PAGE_LIMIT = 50

/**
 * The CRM page for one company (23 Sep 2026 — every record on its own page).
 * It ends in the same id as `accountPath`, the API read it fetches, and is a
 * separate name on purpose: a link is not a fetch, and moving one should
 * never silently retarget the other.
 */
export const companyRoute = (id) => `${COMPANIES_PATH}/${id}`

// Where "New account" opens. A static segment, so React Router ranks it above
// /clients/accounts/:id whatever the declaration order.
export const NEW_COMPANY_ROUTE = `${COMPANIES_PATH}/new`

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

/**
 * The line under the company's name on its page: type, account number, where —
 * the row's identifying cells, whichever exist. Null when none do, so the
 * header draws no empty subtitle.
 */
export function accountMeta(account = {}) {
  const number = account.account_number?.trim()
  const where = whereLine(account)
  return [account.customer_type?.trim(), number ? `Account ${number}` : null, where === '—' ? null : where]
    .filter(Boolean)
    .join(' · ') || null
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

// Approval is two steps (24 Sep 2026): the approver (Liz) approves or declines,
// then the accounts desk (Jenette) gives the final approval — the one that
// unlocks trade pricing, emails the client and adds the company to Xero. A
// pending login the approver has approved carries `trade_first_approved_at`.
const firstApproved = (user = {}) => Boolean(user.trade_first_approved_at)

const PENDING_STATES = Object.freeze({
  approval: { label: 'Awaiting approval', tone: 'clay' },
  final: { label: 'Awaiting final approval', tone: 'clay' },
})

const sameEmail = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Which review steps the signed-in login may take, from the account read's
 * `trade_review` ({ approver_email, accounts_email }; null = anyone). The API
 * enforces the same rule — this only decides which buttons to draw.
 *
 * @param {{ approver_email?: string|null, accounts_email?: string|null }|null} review
 * @param {{ email?: string }|null} me the CRM user
 */
export function reviewRights(review, me) {
  const approverEmail = review?.approver_email ?? null
  const accountsEmail = review?.accounts_email ?? null
  return {
    approve: !approverEmail || sameEmail(approverEmail, me?.email),
    finalApprove: !accountsEmail || sameEmail(accountsEmail, me?.email),
    approverEmail,
    accountsEmail,
  }
}

const ANYONE = Object.freeze({ approve: true, finalApprove: true, approverEmail: null, accountsEmail: null })

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
  const pending = users.filter(isPendingLogin)
  if (pending.length > 0) {
    return pending.every(firstApproved) ? { ...PENDING_STATES.final } : { ...PENDING_STATES.approval }
  }
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
    if (user.trade_approved) return { label: 'Trade approved', tone: 'sage' }
    return firstApproved(user) ? { ...PENDING_STATES.final } : { ...PENDING_STATES.approval }
  }
  return { label: roleLabel(user.role), tone: 'muted' }
}

/**
 * Which verbs a login offers. Archive/restore is one exclusive pair (it is
 * reversible). A pending trade login offers the step it is at to the person
 * who owns that step (`rights`, from reviewRights): the approver's Approve and
 * Decline, then the accounts desk's Final approval; anyone else sees who it is
 * `waitingOn`. The editor's approval tick only REVOKES now — approving goes
 * through the two steps — so it is live on an approved trade login alone.
 *
 * @param {{ role?: string, trade_approved?: boolean, archived_at?: string|null, trade_first_approved_at?: string|null }} user
 * @param {{ role?: string }} [draft] the open editor's draft, when one is open
 * @param {ReturnType<typeof reviewRights>} [rights]
 */
export function loginActions(user = {}, draft = {}, rights = ANYONE) {
  const archived = Boolean(user.archived_at)
  const pending = isPendingLogin(user)
  const stageTwo = pending && firstApproved(user)
  const mine = stageTwo ? rights.finalApprove : rights.approve
  return {
    archived,
    archiveLabel: archived ? 'Restore' : 'Archive',
    archivePath: archived ? 'restore' : 'archive',
    approve: pending && !stageTwo && rights.approve,
    finalApprove: stageTwo && rights.finalApprove,
    decline: pending && rights.approve,
    pending,
    waitingOn: pending && !mine ? (stageTwo ? rights.accountsEmail : rights.approverEmail) : null,
    canRevoke: Boolean(user.trade_approved) && (draft.role ?? user.role) === 'trade',
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
  // The staff login who owns the client, picked from the staff roster (24 Sep
  // 2026) — and the account manager the client portal shows ("they should be
  // the same thing"). It replaced the free-text Account manager box; the API
  // still shows that old text to the client while nobody is picked.
  { key: 'account_owner_id', label: 'Account owner', kind: 'ref' },
])

// What a NEW company takes (POST /admin/trade-accounts): the name and the
// details the office took down; no Xero id, manager or owner yet.
export const NEW_ACCOUNT_FIELDS = Object.freeze(
  ACCOUNT_FIELDS.filter((f) => !['xero_contact_id', 'account_owner_id'].includes(f.key))
)

/**
 * The owner dropdown's options: the staff roster, plus the current owner when
 * they have left it (archived), so the select can still show who it is.
 *
 * @param {Array<{id: number, label: string}>} staff staffOptions() of the roster
 * @param {{ account_owner?: { id: number, name?: string|null, email: string }|null }} account
 */
export function ownerOptions(staff = [], account = {}) {
  const owner = account.account_owner
  if (!owner || staff.some((option) => option.id === owner.id)) return staff
  return [...staff, { id: owner.id, label: owner.name || owner.email }]
}

/** The contact in Xero's own UI. */
export const xeroContactUrl = (contactId) =>
  `https://go.xero.com/Contacts/View/${encodeURIComponent(contactId)}`

/**
 * One sentence on what Xero did after an approve / cancel / restore, for the
 * toast; null when there is nothing to say (no contact to touch).
 *
 * @param {null|{ linked?: boolean, updated?: boolean, reason?: string }} [result]
 */
export function xeroNote(result) {
  if (!result) return null
  if (result.linked || result.updated) return 'Xero updated.'
  return `Xero not updated: ${result.reason}`
}

/**
 * The decline form's body: the reason is what the applicant is emailed, so it
 * must say something.
 *
 * @returns {{ body: { reason: string } } | { error: string }}
 */
export function declineBody(reason) {
  const text = String(reason ?? '').trim()
  return text ? { body: { reason: text } } : { error: 'Give the applicant a reason — it is emailed to them.' }
}

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
