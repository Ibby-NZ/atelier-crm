// The new-sales-order form's rules. Pure, so what the form will and will not
// send is testable without a DOM (the screen beside it is layout only).
//
// The lines themselves are `buildCreateLines` in ../admin/orderFlow.js — the
// same draft model the detail editor uses, so a line means one thing in both
// places. What is here is the other half: who the order is for.

import { buildCreateLines } from '../admin/orderFlow.js'

/** The two ways an order is attributed, as the form's toggle sees them. */
export const CLIENT_MODES = Object.freeze([
  { key: 'account', label: 'Account client' },
  { key: 'walk_in', label: 'Walk-in / phone' },
])

export const NEW_ORDER = Object.freeze({
  mode: 'account',
  user_id: null,
  user_label: '',
  name: '',
  email: '',
  phone: '',
  notes: '',
})

// Mirrors the API's EMAIL_PATTERN. Fastify's Ajv carries no `email` format, so
// the address is only ever checked by a regex — here, and again on the server.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Turn the form into the `POST /admin/orders` body, or name what is missing.
 *
 * The attribution rule is the API's: an account, or a walk-in's details, and an
 * order with neither is refused — an order nobody can be billed for is not a
 * sales order. It is checked here as well so the message names the field rather
 * than arriving as a 422 about `user_id`.
 *
 * @param {object} draft
 * @param {ReadonlyArray<object>} lines
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildOrderBody(draft = NEW_ORDER, lines = []) {
  const parsed = buildCreateLines(lines)
  if (!parsed.ok) return parsed

  const notes = draft.notes?.trim() ? draft.notes.trim() : null
  const body = { lines: parsed.lines, ...(notes ? { notes } : {}) }

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
    return { ok: false, error: 'A walk-in needs at least a name or an email address.' }
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
