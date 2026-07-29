// Pure view model for the Client Account (360) screen. Two branches:
//  · seed (client.account present) → the rich Marlow & Finch values verbatim, so the seed render is
//    pixel-identical to the pre-refactor screen (acceptance test).
//  · generic (created / other seed clients) → zero stats + empty sections, contacts from client.contact.
// Keeping this out of the component keeps the JSX unchanged and makes the branch logic testable.

import { resolveOwner } from '../data/ownership.js'

const ZERO_STATS = [
  { label: 'FY26 sales', value: 'NZ$0.00', key: true },
  { label: 'Lifetime', value: 'NZ$0.00' },
  { label: 'Avg order', value: '—' },
  { label: 'Orders FY26', value: '0' },
]

export function clientViewModel(client, ownership = {}) {
  const account = client && client.account
  if (account) {
    // A manual owner override (decision 4) wins over the seed account's salesperson; otherwise the
    // untouched seed stays on its original rep, so the pixel-identical acceptance render holds.
    const owner = (client && ownership[client.id] && ownership[client.id].owner) || account.salesperson
    return {
      hasAccount: true,
      stats: account.stats,
      // Both contact rows carry the account email/phone — matches the pre-refactor mail/tel links.
      contacts: [
        { initial: account.contact.name[0], name: account.contact.name, role: 'Principal Designer', last: '9 Jun 2026', email: account.contact.email, phone: account.contact.phone },
        { initial: 'T', name: 'Tom Finch', role: 'Studio Manager', last: '21 May 2026', email: account.contact.email, phone: account.contact.phone },
      ],
      timeline: account.timeline,
      byRange: account.byRange,
      samplesOut: account.samplesOut,
      locationPill: 'Ponsonby, Auckland',
      sinceYear: '2019',
      salesperson: owner,
      type: account.type,
    }
  }

  const contact = (client && client.contact) || {}
  const name = String(contact.name || '').trim()
  const city = (client && client.city) || ''
  const region = (client && client.region) || ''
  return {
    hasAccount: false,
    stats: ZERO_STATS,
    contacts: name
      ? [{ initial: name[0].toUpperCase(), name, role: 'Primary contact', last: '—', email: contact.email || '', phone: contact.phone || '' }]
      : [],
    timeline: [],
    byRange: [],
    samplesOut: [],
    locationPill: city ? `${city}, ${region}` : region || '—',
    sinceYear: '2026',
    // Owner from the region matrix (decision 4), overridable per client — replaces the old hardcoded 'Liz'.
    salesperson: resolveOwner(client, ownership),
    type: (client && client.type) || 'Trade',
  }
}
