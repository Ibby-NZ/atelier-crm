// Pure logic for the Accounts screen (src/screens/ClientCompanies.jsx) — the
// client roster: every company the office trades with, LIVE in
// `trade_accounts` since the cutover merge carried the Dynamics accounts over.
// No jsdom here, so anything that is a rule lives in this file with a test.

import { TRADE_ACCOUNTS_PATH } from '../admin/tradeAccounts.js'

export { TRADE_ACCOUNTS_PATH }
export const COMPANIES_PATH = '/clients/accounts'
export const PAGE_LIMIT = 50

// The API's own vocabulary on `customer_type` (it came over from D365 as
// typed). Anything else is forwarded as-is — the API takes free text and an
// unknown value simply matches nothing, so no enum guard is needed here.
export const CUSTOMER_TYPES = Object.freeze(['Trade', 'Retail'])

/**
 * Filters for GET /admin/trade-accounts, as useAdminList wants them: every
 * unset one null (buildListQuery drops null / undefined / ''), never ''.
 *
 * @param {{ term?: string, customerType?: string, showArchived?: boolean }} [filters]
 */
export function companyFilters({ term = '', customerType = '', showArchived = false } = {}) {
  return {
    q: String(term ?? '').trim() || null,
    customer_type: String(customerType ?? '').trim() || null,
    include_archived: showArchived || null,
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
 * The login state a company row reports: how many portal logins it has and
 * whether any is an approved trade login — that is what unlocks trade pricing.
 */
export function loginsLine(account) {
  const users = account.users ?? []
  if (users.length === 0) return { tone: 'muted', label: 'No login' }
  const approved = users.filter((u) => u.role === 'trade' && u.trade_approved).length
  if (approved > 0) return { tone: 'sage', label: `${users.length} login${users.length === 1 ? '' : 's'} · trade` }
  return { tone: 'clay', label: `${users.length} login${users.length === 1 ? '' : 's'} · not approved` }
}

/** The Dynamics record behind a row, in the Archive. */
export function archivePath(account) {
  return account.legacy_account_guid ? `/archive/accounts?filter=guid:eq:${account.legacy_account_guid}` : null
}

// The company details a DIRECTOR edits (PATCH /admin/trade-accounts/:id,
// which 403s backoffice for any of these). Declared once for drafts.js so a
// value cannot be formatted one way and parsed another; the company NAME is
// deliberately absent — it is what the client portal matches invoice history
// on, and renaming it here would silently empty that history.
export const ACCOUNT_FIELDS = Object.freeze([
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

export const accountPath = (id) => `${TRADE_ACCOUNTS_PATH}/${id}`

/** Only a director may save the details; backoffice sees them read-only. */
export const canEditAccount = (apiRole) => apiRole === 'director'
