// The trade-account picker's pure half — shared by the register's and the
// scanner's check-out forms and by the outstanding-loans filter, so all three
// spell the search the same way and none of them quotes the endpoint itself.
//
// The endpoint is `GET /admin/trade-accounts?q=&limit=` (the linked D365
// accounts, `q` matching the snapshotted company name). It answers
// `{ trade_accounts, meta }` where each account carries `company_name` and its
// linked logins. Picking one puts only the ID on the wire: a loan's
// `holder_name` stays the snapshot typed at the counter — the link is the
// CURRENT state of a business relationship, and plenty of borrowers (an
// architect, a stylist, Atelier's own staff) are no trade client at all, which
// is why the picker is always optional and never a required field.

import { buildListQuery, listPath } from './list.js'

export const TRADE_ACCOUNTS_PATH = '/admin/trade-accounts'

// Eight hits, like the order desk's client search: a picker is for narrowing,
// and a ninth hit means the term needs another letter, not a longer list.
export const TRADE_ACCOUNT_SEARCH_LIMIT = 8

/**
 * The search read. An empty term is allowed and lists the newest links —
 * useful when the roster is still small — because the endpoint treats an
 * absent `q` as "no filter" and buildListQuery drops the empty string.
 *
 * @param {string} [term]
 * @returns {string}
 */
export function tradeAccountSearchPath(term = '') {
  return listPath(
    TRADE_ACCOUNTS_PATH,
    buildListQuery({ q: term, limit: TRADE_ACCOUNT_SEARCH_LIMIT })
  )
}

/**
 * One search hit, narrowed to what the picker shows and what a selection
 * carries: the id (the only thing sent to the API), the snapshotted company
 * name, and the first linked login's email as a hint of who the reminder
 * suggestion will go to. No linked login is normal — the grant is unlinked by
 * back office as a matter of course — so `email` is null, never ''.
 *
 * @param {{ id?: number, company_name?: string, users?: Array<{email?: string}> }} account
 * @returns {{ id: number|undefined, name: string, email: string|null }}
 */
export function accountOption(account = {}) {
  const first = Array.isArray(account.users) ? account.users[0] : null
  return {
    id: account.id,
    name: typeof account.company_name === 'string' ? account.company_name : '',
    email: first && typeof first.email === 'string' && first.email !== '' ? first.email : null,
  }
}
