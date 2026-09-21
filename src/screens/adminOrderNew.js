// The new-sales-order form's rules. Pure, so what the form will and will not
// send is testable without a DOM (the screen beside it is layout only).
//
// The lines themselves are `buildCreateLines` in ../admin/orderFlow.js — the
// same draft model the detail editor uses, so a line means one thing in both
// places. What is here is the other half: who the order is for.
//
// ONE roster, since the cutover merge (Sept 2026). The form used to ask which
// ROSTER a client came from — Account client / Dynamics client / Walk-in —
// before it asked who they were, and two of the three no longer mean anything:
// `trade_accounts` IS the client list now (860 companies, 835 of them with an
// address), the Dynamics mirror behind the old middle option is the Archive,
// and a client nobody has a record of is one the office adds here and then has
// a record of. So: find the client, or add them.

import { buildCreateLines } from '../admin/orderFlow.js'

export const NEW_ORDER = Object.freeze({
  // The picked client, as `clientFrom` shapes one. Null until one is chosen —
  // an order nobody can be billed for is not a sales order.
  client: null,
  notes: '',
  // Which price list the order is written off. Retail is the column default, so
  // an order keyed without a thought about it reads the same either way.
  price_type: 'retail',
  // Sales attribution (A6 groundwork). The screen defaults it to the signed-in
  // staff member; blank stays unassigned.
  sales_rep_user_id: null,
})

/** The add-a-client form, which is the roster's own create in miniature. */
export const NEW_CLIENT = Object.freeze({
  company_name: '',
  primary_contact_name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  country: '',
})

// Mirrors the API's EMAIL_PATTERN. Fastify's Ajv carries no `email` format, so
// the address is only ever checked by a regex — here, and again on the server.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** A staging cell is text or null; `''` is "nothing said", never a value. */
const text = (value) => (value == null ? '' : String(value).trim())

/**
 * The login an order for this client belongs to, or null.
 *
 * ONLY when the company has exactly one: several logins are several people at
 * the firm, and picking one of them here would put the order in that person's
 * portal and nobody else's on no better grounds than row order. With none (the
 * common case — the merge linked no logins) the order carries the company's
 * contact details instead, which is what every Dynamics client already did.
 *
 * @param {{users?: Array<{id: number}>}} [account]
 * @returns {number|null}
 */
export function clientUserId(account = {}) {
  const users = Array.isArray(account.users) ? account.users : []
  return users.length === 1 ? (users[0]?.id ?? null) : null
}

/**
 * Where a client's cloth goes, from the client's own record, in the shape the
 * API stores on the order (`orders.shipping_address` — the same one the Stripe
 * webhook and a storefront request write).
 *
 * Null unless the record says WHERE: a company name with no street and no city
 * is the absence of an address, and `{}` would print an empty Ship-to block on
 * the packing slip. The API applies the same rule again on the way in.
 *
 * `trade_accounts.address` is ONE text column holding what D365 exported as a
 * composite — up to four lines separated by newlines ("PO Box 802\nWellington
 * \nWellington 6140\nNew Zealand"), which is why it is split here rather than
 * poured into `line1`: the API caps that field at 200 characters and the
 * packing slip prints the fields, not the newlines inside one. The lines that
 * merely repeat the city or the country are dropped, since both have their own
 * field and would otherwise print twice.
 *
 * @param {object} [account] a row from GET /admin/trade-accounts
 * @returns {{name: string|null, line1: string|null, line2: string|null, city: string|null, country: string|null}|null}
 */
export function clientAddress(account = {}) {
  const city = text(account.city) || null
  const country = text(account.country) || null
  const repeats = [city, country].filter(Boolean).map((value) => value.toLowerCase())
  const parts = text(account.address)
    .split('\n')
    .map(text)
    .filter((part) => part && !repeats.includes(part.toLowerCase()))
  if (parts.length === 0 && !city) return null
  return {
    name: text(account.company_name) || null,
    line1: parts[0] ?? null,
    line2: parts.slice(1).join(', ') || null,
    city,
    country,
  }
}

/**
 * A search hit, narrowed to what the order needs: who to bill, how to reach
 * them, which login (if any) it belongs to, and where it ships.
 *
 * @param {object} [account] a row from GET /admin/trade-accounts
 */
export function clientFrom(account = {}) {
  return {
    id: account.id,
    name: text(account.company_name),
    account_number: text(account.account_number),
    contact_name: text(account.primary_contact_name),
    email: text(account.email),
    phone: text(account.phone),
    city: text(account.city),
    user_id: clientUserId(account),
    address: clientAddress(account),
  }
}

/** How a client reads in the search results and once picked. */
export function clientLine(client = {}) {
  return [client.name, client.account_number, client.city]
    .map(text)
    .filter(Boolean)
    .join(' — ')
}

/**
 * The line that names the client company on the order itself.
 *
 * It goes in `orders.notes` because that is where it can go: `orders.user_id`
 * is a LOGIN, and most clients have none, so without this an order raised for
 * a company reads as a walk-in with the same name. (A `trade_account_id` on
 * `orders` is the real answer and is a migration, a backfill and a decision
 * about every historical order — not something to take in passing.)
 *
 * @param {object} [client] as `clientFrom` shapes one
 * @returns {string}
 */
export function clientReference(client = {}) {
  const number = text(client.account_number)
  const contact = text(client.contact_name)
  return [
    `Client: ${text(client.name) || '(unnamed client)'}`,
    number ? ` (${number})` : '',
    contact ? ` · attn ${contact}` : '',
  ].join('')
}

/**
 * Turn the form into the `POST /admin/orders` body, or name what is missing.
 *
 * The attribution rule is the API's: an account, or a contact's details, and an
 * order with neither is refused. A picked client is one or the other depending
 * on whether the company has a single login (`clientUserId`), so the form only
 * ever has to answer one question — which client — and this decides the rest.
 *
 * The delivery address rides along whenever the client's record holds one. The
 * office does not retype it: it is the client's own address, and an order for a
 * client with nothing on file simply carries none.
 *
 * @param {object} draft
 * @param {ReadonlyArray<object>} lines
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildOrderBody(draft = NEW_ORDER, lines = []) {
  const parsed = buildCreateLines(lines)
  if (!parsed.ok) return parsed

  const client = draft.client
  if (!client) {
    return { ok: false, error: 'Choose the client this order is for.' }
  }

  const typed = draft.notes?.trim() ? draft.notes.trim() : null
  const notes = [clientReference(client), typed].filter(Boolean).join('\n')
  const body = {
    lines: parsed.lines,
    price_type: draft.price_type ?? 'retail',
    ...(notes ? { notes } : {}),
    ...(draft.sales_rep_user_id != null ? { sales_rep_user_id: draft.sales_rep_user_id } : {}),
    ...(client.address ? { shipping_address: client.address } : {}),
  }

  if (client.user_id != null) {
    return { ok: true, body: { ...body, user_id: client.user_id } }
  }

  const name = text(client.name)
  const email = text(client.email)
  const phone = text(client.phone)
  if (name === '' && email === '') {
    return {
      ok: false,
      error: 'That client has no name or email on file — add one on the Accounts screen first.',
    }
  }
  if (email !== '' && !EMAIL_RE.test(email)) {
    return { ok: false, error: 'That client’s email address does not look right.' }
  }

  const contact = {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  }
  return { ok: true, body: { ...body, contact } }
}

/**
 * Turn the add-a-client form into the `POST /admin/trade-accounts` body, or
 * name what is missing. The company name is all the API requires; everything
 * else is what the office happened to take down over the phone, and a blank
 * field is left out rather than sent as `''`.
 *
 * @param {object} [form] as NEW_CLIENT shapes one
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildClientBody(form = NEW_CLIENT) {
  const company = text(form.company_name)
  if (company === '') {
    return { ok: false, error: 'A new client needs a company name.' }
  }
  const email = text(form.email)
  if (email !== '' && !EMAIL_RE.test(email)) {
    return { ok: false, error: 'That email address does not look right.' }
  }
  const optional = ['primary_contact_name', 'phone', 'address', 'city', 'country']
  const body = { company_name: company, ...(email ? { email } : {}) }
  for (const key of optional) {
    const value = text(form[key])
    if (value) body[key] = value
  }
  return { ok: true, body }
}

/**
 * How a client search result reads in the picked-client line. The name is
 * optional on an account, so the email is what always identifies one.
 *
 * Still used by the reserves docket form, which finds PORTAL LOGINS.
 *
 * @param {{name?: string|null, email?: string}} user
 * @returns {string}
 */
export function clientLabel(user = {}) {
  return user.name ? `${user.name} — ${user.email}` : (user.email ?? '')
}
