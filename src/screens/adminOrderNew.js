// The new-sales-order form's rules. Pure, so what the form will and will not
// send is testable without a DOM (the screen beside it is layout only).
//
// The lines themselves are `buildCreateLines` in ../admin/orderFlow.js — the
// same draft model the detail editor uses, so a line means one thing in both
// places. What is here is the other half: who the order is for.

import { buildCreateLines } from '../admin/orderFlow.js'

/** The three ways an order is attributed, as the form's toggle sees them. */
export const CLIENT_MODES = Object.freeze([
  { key: 'account', label: 'Account client' },
  { key: 'legacy', label: 'Dynamics client' },
  { key: 'walk_in', label: 'Walk-in / phone' },
])

export const NEW_ORDER = Object.freeze({
  mode: 'account',
  user_id: null,
  user_label: '',
  legacy: null,
  name: '',
  email: '',
  phone: '',
  notes: '',
  // Sales attribution (A6 groundwork). The screen defaults it to the signed-in
  // staff member; blank stays unassigned.
  sales_rep_user_id: null,
})

// Mirrors the API's EMAIL_PATTERN. Fastify's Ajv carries no `email` format, so
// the address is only ever checked by a regex — here, and again on the server.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** A staging cell is text or null; `''` is "nothing said", never a value. */
const text = (value) => (value == null ? '' : String(value).trim())

/**
 * The contact details a Dynamics account gives up, as the form's three inputs.
 *
 * The account NAME is the client — the party the invoice is made out to — while
 * `primary_contact` is a person inside it, so the name is the account's and the
 * person is carried in the reference line below. Both address columns are
 * nullable and either may be the only one filled, hence the fallbacks.
 *
 * @param {object} [account] a row from GET /admin/legacy/accounts
 * @returns {{name: string, email: string, phone: string}}
 */
export function legacyContactFrom(account = {}) {
  return {
    name: text(account.name),
    email: text(account.email) || text(account.primary_contact_email),
    phone: text(account.main_phone) || text(account.other_phone),
  }
}

/** How a Dynamics account reads in the search results and once picked. */
export function legacyLabel(account = {}) {
  return [account.name, account.atelier_account_number, account.address1_city]
    .map(text)
    .filter(Boolean)
    .join(' — ')
}

/**
 * The line that ties the order back to the Dynamics record it was raised for.
 *
 * It goes in `orders.notes` because that is the only place it can go: nothing on
 * `orders` references the staging tables, and nothing should while the D365
 * import re-runs until cutover (a column would be the office's, not the
 * mirror's, so it needs a migration and a decision — see the API's CLAUDE.md on
 * why corrections live beside the staging tables rather than on them).
 *
 * @param {object} [account]
 * @returns {string}
 */
export function legacyReference(account = {}) {
  const number = text(account.atelier_account_number)
  const contact = text(account.primary_contact)
  return [
    `Dynamics client: ${text(account.name) || '(unnamed account)'}`,
    number ? ` (${number})` : '',
    contact ? ` · attn ${contact}` : '',
  ].join('')
}

/**
 * Turn the form into the `POST /admin/orders` body, or name what is missing.
 *
 * The attribution rule is the API's: an account, or a contact's details, and an
 * order with neither is refused — an order nobody can be billed for is not a
 * sales order. It is checked here as well so the message names the field rather
 * than arriving as a 422 about `user_id`.
 *
 * A Dynamics client is the contact form, not a third one: the mirror holds no
 * platform login, so there is no `user_id` to send, and the API's `contact` is
 * exactly the shape its details fit. What the mode adds is the reference line —
 * the office picked a known client, not a stranger, and the order has to say so.
 *
 * @param {object} draft
 * @param {ReadonlyArray<object>} lines
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildOrderBody(draft = NEW_ORDER, lines = []) {
  const parsed = buildCreateLines(lines)
  if (!parsed.ok) return parsed

  const isLegacy = draft.mode === 'legacy'
  if (isLegacy && !draft.legacy) {
    return { ok: false, error: 'Choose the Dynamics client this order is for.' }
  }

  const typed = draft.notes?.trim() ? draft.notes.trim() : null
  const notes = [isLegacy ? legacyReference(draft.legacy) : null, typed]
    .filter(Boolean)
    .join('\n')
  const body = {
    lines: parsed.lines,
    ...(notes ? { notes } : {}),
    ...(draft.sales_rep_user_id != null ? { sales_rep_user_id: draft.sales_rep_user_id } : {}),
  }

  if (draft.mode === 'account') {
    if (draft.user_id == null) {
      return { ok: false, error: 'Choose the client this order is for.' }
    }
    return { ok: true, body: { ...body, user_id: draft.user_id } }
  }

  const name = draft.name?.trim() ?? ''
  const email = draft.email?.trim() ?? ''
  const phone = draft.phone?.trim() ?? ''
  if (name === '' && email === '') {
    return {
      ok: false,
      error: isLegacy
        ? 'That Dynamics client has no name or email on file — type contact details for the order.'
        : 'A walk-in needs at least a name or an email address.',
    }
  }
  if (email !== '' && !EMAIL_RE.test(email)) {
    return { ok: false, error: 'That email address does not look right.' }
  }

  const contact = {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  }
  return { ok: true, body: { ...body, contact } }
}

/**
 * How a client search result reads in the picked-client line. The name is
 * optional on an account, so the email is what always identifies one.
 *
 * @param {{name?: string|null, email?: string}} user
 * @returns {string}
 */
export function clientLabel(user = {}) {
  return user.name ? `${user.name} — ${user.email}` : (user.email ?? '')
}
