// Pure logic for the Contacts screens — the list (src/screens/Contacts.jsx),
// one contact's page (Contact.jsx) and the create page (ContactNew.jsx) — the
// whole address book off GET /admin/contacts: every person the office knows,
// filed under a company or not. No jsdom here; rules live here with a test.

import { companyRoute } from './clientCompanies.js'

export const CONTACTS_PATH = '/admin/contacts'
export const CONTACTS_ROUTE = '/clients/contacts'
export const PAGE_LIMIT = 50

/**
 * The CRM page for one contact (23 Sep 2026 — every record on its own page).
 * It ends in the same id as `contactPath`, the API read, and is a separate
 * name on purpose: a link is not a fetch, and moving one should never
 * silently retarget the other.
 */
export const contactRoute = (id) => `${CONTACTS_ROUTE}/${id}`

// Where "Add contact" opens. A static segment, so it outranks /:id.
export const NEW_CONTACT_ROUTE = `${CONTACTS_ROUTE}/new`

// The three states of "filed": null = everyone, true = under a company,
// false = unattached (the ones still to file).
export const FILED_OPTIONS = Object.freeze([
  { value: '', label: 'Everyone' },
  { value: 'true', label: 'Filed under a company' },
  { value: 'false', label: 'Not filed' },
])

/** Filters as useAdminList wants them — null for unset, never ''. */
export function contactFilters({ term = '', filed = '' } = {}) {
  return {
    q: String(term ?? '').trim() || null,
    filed: filed === 'true' ? true : filed === 'false' ? false : null,
  }
}

// One declaration drives the form and the diff (drafts.js). `company_name` is
// the free-text company for an UNFILED contact; a filed one's company is its
// account and the box is not drawn.
export const CONTACT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', required: true },
  { key: 'role', label: 'Role' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company_name', label: 'Company (unfiled)' },
  { key: 'note', label: 'Note' },
])

export const contactPath = (id) => `${CONTACTS_PATH}/${id}`

/** The company cell: the account it is filed under, else the text D365 gave it, marked as unfiled. */
export function companyCell(contact) {
  if (contact.trade_account_id) return { text: contact.company ?? '—', filed: true }
  return { text: contact.company_name ?? '—', filed: false }
}

/**
 * Where a contact's company opens: the page of the account it is filed under.
 * Null for an unfiled contact — its company is text D365 gave it, and there is
 * no record behind the words to open.
 */
export function companyHref(contact = {}) {
  return contact.trade_account_id ? companyRoute(contact.trade_account_id) : null
}

/**
 * The body that files a contact under an account (or unfiles it). Sent on its
 * own, separate from the field diff, because the API clears `company_name`
 * itself when an account is set.
 */
export function fileUnderBody(accountId) {
  return { trade_account_id: accountId == null ? null : Number(accountId) }
}
