// The trade-company contact book's pure half — paths, field declarations and
// body builders for TradeContactsPanel.jsx, tested in ./tradeContacts.test.js
// (no jsdom here, the house split).
//
// A CONTACT IS NOT A LOGIN. `trade_account_users` is portal access; this book
// is the several named people at a client company ("Zomia is Jenny, Viv,
// Haike"), kept by staff, no password anywhere. The API answers every contact
// write with the fresh trade account, so the panel redraws off one shape.

import { TRADE_ACCOUNTS_PATH } from './tradeAccounts.js'

/** The bridge from a mirror screen's D365 GUID to the company row. */
export const byGuidPath = (guid) => `${TRADE_ACCOUNTS_PATH}/by-guid/${guid}`

export const contactsPath = (accountId) => `${TRADE_ACCOUNTS_PATH}/${accountId}/contacts`
export const contactPath = (accountId, contactId) => `${contactsPath(accountId)}/${contactId}`

// Mirrors the API's CONTACT_COLUMNS whitelist — a key absent there is stripped
// by Ajv's removeAdditional and would silently save nothing.
export const CONTACT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'role', label: 'Role', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'phone', label: 'Phone', kind: 'text' },
  { key: 'note', label: 'Note', kind: 'text' },
])

export const NEW_CONTACT = Object.freeze({ name: '', role: '', email: '', phone: '', note: '' })

const fold = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The POST body. Blanks fold to null (the API does the same — a stored ''
 * is an absence every IS NULL read misses); a nameless contact is refused
 * here with the field named rather than round-tripping to a 400.
 *
 * @param {object} draft
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildContactBody(draft = NEW_CONTACT) {
  const name = fold(draft.name)
  if (!name) return { ok: false, error: 'A contact needs a name.' }
  return {
    ok: true,
    body: {
      name,
      role: fold(draft.role),
      email: fold(draft.email),
      phone: fold(draft.phone),
      note: fold(draft.note),
    },
  }
}

/**
 * A Dynamics person (`d365_people` off the trade account) as an add-form
 * draft — the click that turns "retype Jenny, Viv, Haike" into "press Add".
 * Draft values are strings, never null (controlled inputs).
 *
 * @param {{ full_name?: string, job_title?: string, email?: string,
 *           mobile_phone?: string, business_phone?: string }} person
 * @returns {object} a NEW_CONTACT-shaped draft
 */
export function personPrefill(person = {}) {
  return {
    name: person.full_name ?? '',
    role: person.job_title ?? '',
    email: person.email ?? '',
    phone: person.mobile_phone ?? person.business_phone ?? '',
    note: '',
  }
}
