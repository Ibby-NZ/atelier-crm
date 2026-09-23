// The cutover merge, driven from the browser.
//
// Why this exists: `npm run merge:legacy` is what promotes the Dynamics staging
// tables (what the Archive shows) into the LIVE tables the working sections
// read — Clients, Contacts, Stock, Reserves. On the deployed API it runs only
// inside the deploy script, so a bundle loaded through <LegacyImportPanel>
// AFTER the last deploy sits in the Archive and nowhere else until someone
// deploys again — and if that run fails, nobody sees why. POST
// /admin/legacy/merge is the same merge behind an authenticated request, and
// this module turns its summary into the sentences the panel shows.
//
// Pure: no React, no fetch, so it unit-tests without a DOM.

export const MERGE_PATH = '/admin/legacy/merge'

// What the merge moves and what it deliberately does not, in the office's
// words. Kept here (not in the .jsx) so the test pins the vocabulary.
export const MOVES = Object.freeze([
  'Accounts → Clients (every Dynamics client becomes a live trade account)',
  'Contacts → Contacts (filed under their company where the name is one client\'s)',
  'Reserves + cuttings → Reserves (one docket per customer per day)',
  'Stock items → Catalogue + Stock (a colourway per item, on-hand quantity onto its stock row, and a blank product category filled where Atelier has reviewed the item type)',
])

export const STAYS = Object.freeze([
  'Sales orders, sales invoices, purchase orders and purchase invoices — Dynamics exported headers only, no lines, so they stay in the Archive.',
])

const n = (value) => Number(value ?? 0).toLocaleString('en-NZ')

/**
 * The summary the API returns from POST /admin/legacy/merge (the same shape
 * `npm run merge:legacy` prints), as one line per table for the panel.
 *
 * @param {object} summary  the `summary` from the response body
 * @returns {string[]}
 */
export const summariseMerge = (summary) => {
  if (!summary || typeof summary !== 'object') return []
  const { accounts = {}, contacts = {}, reserves = {}, housesRaised = [], catalogue = {}, stock = {} } = summary
  const lines = [
    `Accounts — ${n(accounts.created)} trade account(s) created; the rest refreshed in place (${n(accounts.unnamed)} unnamed skipped).`,
    `Contacts — ${n(contacts.created)} created; ${n(contacts.filed)} filed under an account, ${n(contacts.unfiled)} unfiled (company not a client), ${n(contacts.no_company)} with no company.`,
    `Reserves — ${n(reserves.lines)} line(s) in ${n(reserves.dockets)} docket(s)${reserves.declined?.length ? `; ${n(reserves.declined.length)} declined (no customer or no product)` : ''}.`,
  ]
  if (housesRaised.length) lines.push(`Houses — raised ${n(housesRaised.length)}: ${housesRaised.join(', ')}.`)
  lines.push(
    `Catalogue — ${n(catalogue.items)} stock item(s) → ${n(catalogue.colourways)} colourway(s) across ${n(catalogue.products)} product(s); ${n(catalogue.inventoryCreated)} stock row(s) created, ${n(catalogue.conflicts)} conflict(s), ${n(catalogue.noHouse)} item(s) name no range.`
  )
  if (catalogue.unknownBrands?.length) {
    lines.push(`Houses not in the catalogue (items skipped) — ${catalogue.unknownBrands.map((b) => `${b.brand}: ${n(b.rows)}`).join('; ')}.`)
  }
  lines.push(`Stock — ${n(stock.matched)} item(s) matched a colourway; ${n(stock.stocked)} quantity(ies) set, ${n(stock.priced)} product price(s) filled.`)
  // Only from an API that fills categories; an older one sends no `categories`
  // and gets no line, rather than a line of zeros that reads as "none needed".
  const { categories } = summary
  if (categories && typeof categories === 'object') {
    const leftBlank = [
      categories.split ? `${n(categories.split)} split between categories` : '',
      categories.missing ? `${n(categories.missing)} naming a deleted category` : '',
    ].filter(Boolean)
    lines.push(
      `Categories — ${n(categories.filled)} product category(ies) filled from ${n(categories.reviewed)} reviewed stock item(s); `
      + `${n(categories.kept)} already set differently in the CRM (kept)`
      + (leftBlank.length ? `; left blank: ${leftBlank.join(', ')}` : '')
      + (categories.unplaced ? `; ${n(categories.unplaced)} item(s) on no product` : '')
      + '.'
    )
  }
  return lines
}

/**
 * Did the merge land anything at all? A run over an empty staging table is
 * legal and reports zeros everywhere; the panel says so plainly instead of
 * announcing success over nothing.
 */
export const mergedNothing = (summary) => {
  if (!summary || typeof summary !== 'object') return true
  const counts = [
    summary.accounts?.created,
    summary.contacts?.created,
    summary.reserves?.lines,
    summary.catalogue?.colourways,
    summary.stock?.stocked,
    summary.stock?.priced,
    summary.categories?.filled,
  ]
  return counts.every((count) => !Number(count ?? 0))
}

/**
 * Runs the merge through the injected `send` and hands back the summary.
 * `send` is `(path, body) => Promise<{ summary }>`; the panel passes apiSend.
 *
 * @param {{ send: (path: string, body: object) => Promise<{ summary: object }>, createHouses?: boolean }} options
 */
export const runMerge = async ({ send, createHouses = true }) => {
  const body = await send(MERGE_PATH, { create_houses: createHouses })
  return body?.summary ?? null
}
