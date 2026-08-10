import { describe, it, expect } from 'vitest'
import { buildListQuery } from '../admin/list.js'
import {
  CLIENT_ROLES,
  accountState,
  clientAccountsFilters,
  isPendingApplicant,
  partitionClients,
  roleLabel,
  rowActions,
} from './clientAccounts.js'

// The filters go through the kit's serialiser, so every assertion below is made
// on the querystring the API actually receives.
const query = (filters) => buildListQuery(clientAccountsFilters(filters))

describe('clientAccountsFilters', () => {
  it('always scopes to the client segment', () => {
    expect(query()).toBe('segment=clients')
    expect(query({})).toBe('segment=clients')
  })

  it('forwards a client role and drops anything else', () => {
    expect(query({ role: 'trade' })).toBe('segment=clients&role=trade')
    expect(query({ role: 'customer' })).toBe('segment=clients&role=customer')
    // 'All' is the absence of the param, not role=.
    expect(query({ role: '' })).toBe('segment=clients')
    // A staff role would list nothing under segment=clients, and an invented one
    // is a 400 from the endpoint's enum — neither is forwarded.
    expect(query({ role: 'director' })).toBe('segment=clients')
    expect(query({ role: 'nonsense' })).toBe('segment=clients')
  })

  // buildListQuery drops null and '' alike, so the null matters only in that it
  // is what the helper must return — an unset filter is never the empty string
  // by the time it reaches the hook.
  it('leaves an unset filter as null rather than an empty string', () => {
    expect(clientAccountsFilters()).toEqual({
      segment: 'clients',
      role: null,
      q: null,
      include_archived: null,
    })
  })

  it('trims the search term and ignores a blank one', () => {
    expect(query({ term: '  priya  ' })).toBe('segment=clients&q=priya')
    expect(query({ term: '   ' })).toBe('segment=clients')
    expect(query({ term: undefined })).toBe('segment=clients')
  })

  it('escapes a term rather than breaking the querystring', () => {
    expect(query({ term: 'a&b=c' })).toBe('segment=clients&q=a%26b%3Dc')
  })

  it('adds include_archived only when asked', () => {
    expect(query({ showArchived: true })).toBe('segment=clients&include_archived=true')
    expect(query({ showArchived: false })).toBe('segment=clients')
  })

  it('combines every filter', () => {
    expect(query({ role: 'trade', term: 'finch', showArchived: true })).toBe(
      'segment=clients&role=trade&q=finch&include_archived=true'
    )
  })

  it('knows only the two client roles', () => {
    expect(CLIENT_ROLES).toEqual(['customer', 'trade'])
  })
})

describe('accountState', () => {
  it('reports archived first, whatever the role says', () => {
    expect(accountState({ role: 'trade', trade_approved: true, archived_at: '2026-08-01T00:00:00Z' }))
      .toEqual({ label: 'Archived', tone: 'muted' })
    expect(accountState({ role: 'customer', archived_at: '2026-08-01T00:00:00Z' }))
      .toEqual({ label: 'Archived', tone: 'muted' })
  })

  it('separates approved trade from pending trade', () => {
    expect(accountState({ role: 'trade', trade_approved: true }))
      .toEqual({ label: 'Trade approved', tone: 'sage' })
    expect(accountState({ role: 'trade', trade_approved: false }))
      .toEqual({ label: 'Trade pending', tone: 'clay' })
    expect(accountState({ role: 'trade' }))
      .toEqual({ label: 'Trade pending', tone: 'clay' })
  })

  // The API clears trade_approved whenever a role moves off trade, so this can
  // only be a row demoted before that rule existed. It must not draw as a plain
  // customer: an invisible stale approval hands back trade pricing and every
  // trade-only house the moment someone re-roles the account.
  it('calls out a stale trade flag on a non-trade row', () => {
    expect(accountState({ role: 'customer', trade_approved: true }))
      .toEqual({ label: 'Customer · stale trade flag', tone: 'clay' })
  })

  it('degrades rather than throwing on an unknown row', () => {
    expect(accountState()).toEqual({ label: '—', tone: 'muted' })
    expect(accountState({ role: 'director' })).toEqual({ label: 'director', tone: 'muted' })
  })
})

describe('roleLabel', () => {
  it('names the two client roles and passes anything else through', () => {
    expect(roleLabel('customer')).toBe('Customer')
    expect(roleLabel('trade')).toBe('Trade')
    expect(roleLabel('backoffice')).toBe('backoffice')
    expect(roleLabel(null)).toBe('—')
  })
})

describe('rowActions', () => {
  it('offers Archive on a live row and Restore on an archived one', () => {
    expect(rowActions({ role: 'customer' })).toEqual({
      archived: false,
      archiveLabel: 'Archive',
      archivePath: 'archive',
      canApprove: false,
    })
    expect(rowActions({ role: 'trade', archived_at: '2026-08-01T00:00:00Z' })).toEqual({
      archived: true,
      archiveLabel: 'Restore',
      archivePath: 'restore',
      canApprove: true,
    })
  })

  it('offers trade approval only on a trade row', () => {
    expect(rowActions({ role: 'trade' }).canApprove).toBe(true)
    expect(rowActions({ role: 'customer' }).canApprove).toBe(false)
    expect(rowActions().canApprove).toBe(false)
  })

  // Promotion and approval have to be one save. Keying the tick on the SAVED
  // role forced role-first-then-tick, and the first of those two saves is the
  // one that grants live access.
  it('lets the open draft decide, so a promotion approves in one save', () => {
    expect(rowActions({ role: 'customer' }, { role: 'trade' }).canApprove).toBe(true)
    expect(rowActions({ role: 'trade' }, { role: 'customer' }).canApprove).toBe(false)
    // No draft (row closed) falls back to the saved role.
    expect(rowActions({ role: 'trade' }, {}).canApprove).toBe(true)
  })
})

// The Clients tab lists clients; the Applicants tab beside it lists the people
// still waiting on a decision. A trade application creates its login straight
// away, so without this split a firm nobody has reviewed appears in the client
// roster the moment it applies.
describe('partitionClients', () => {
  const APPROVED = { id: 1, role: 'trade', trade_approved: true }
  const PENDING = { id: 2, role: 'trade', trade_approved: false }
  const CUSTOMER = { id: 3, role: 'customer', trade_approved: false }
  const ARCHIVED_PENDING = { id: 4, role: 'trade', trade_approved: false, archived_at: '2026-08-01' }

  it('holds back a pending trade application and counts it', () => {
    expect(partitionClients([APPROVED, PENDING, CUSTOMER])).toEqual({
      clients: [APPROVED, CUSTOMER],
      pendingCount: 1,
    })
  })

  // This IS the "an approved applicant becomes a client" behaviour: nothing is
  // moved between lists, the flag simply changes what the row is.
  it('lists an application the moment it is approved', () => {
    expect(partitionClients([{ ...PENDING, trade_approved: true }]).clients).toHaveLength(1)
  })

  // An archived account cannot sign in at all, so it is not waiting on anybody —
  // and it must stay visible under "Show archived" rather than vanishing into a
  // tab that reviews live applications.
  it('treats an archived pending row as a client, not an applicant', () => {
    expect(partitionClients([ARCHIVED_PENDING])).toEqual({
      clients: [ARCHIVED_PENDING],
      pendingCount: 0,
    })
  })

  it('never withholds a customer, whatever its stale flags', () => {
    expect(partitionClients([{ ...CUSTOMER, trade_approved: true }]).pendingCount).toBe(0)
  })

  it('handles an empty roster', () => {
    expect(partitionClients([])).toEqual({ clients: [], pendingCount: 0 })
    expect(partitionClients()).toEqual({ clients: [], pendingCount: 0 })
  })

  it('agrees with isPendingApplicant row by row', () => {
    for (const row of [APPROVED, PENDING, CUSTOMER, ARCHIVED_PENDING]) {
      expect(partitionClients([row]).pendingCount).toBe(isPendingApplicant(row) ? 1 : 0)
    }
  })
})
