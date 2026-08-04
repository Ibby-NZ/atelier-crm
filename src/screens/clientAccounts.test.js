import { describe, it, expect } from 'vitest'
import {
  CLIENT_ROLES,
  accountState,
  clientAccountsQuery,
  roleLabel,
  rowActions,
} from './clientAccounts.js'

describe('clientAccountsQuery', () => {
  it('always scopes to the client segment', () => {
    expect(clientAccountsQuery()).toBe('segment=clients')
    expect(clientAccountsQuery({})).toBe('segment=clients')
  })

  it('forwards a client role and drops anything else', () => {
    expect(clientAccountsQuery({ role: 'trade' })).toBe('segment=clients&role=trade')
    expect(clientAccountsQuery({ role: 'customer' })).toBe('segment=clients&role=customer')
    // 'All' is the absence of the param, not role=.
    expect(clientAccountsQuery({ role: '' })).toBe('segment=clients')
    // A staff role would list nothing under segment=clients, and an invented one
    // is a 400 from the endpoint's enum — neither is forwarded.
    expect(clientAccountsQuery({ role: 'director' })).toBe('segment=clients')
    expect(clientAccountsQuery({ role: 'nonsense' })).toBe('segment=clients')
  })

  it('trims the search term and ignores a blank one', () => {
    expect(clientAccountsQuery({ term: '  priya  ' })).toBe('segment=clients&q=priya')
    expect(clientAccountsQuery({ term: '   ' })).toBe('segment=clients')
    expect(clientAccountsQuery({ term: undefined })).toBe('segment=clients')
  })

  it('escapes a term rather than breaking the querystring', () => {
    expect(clientAccountsQuery({ term: 'a&b=c' })).toBe('segment=clients&q=a%26b%3Dc')
  })

  it('adds include_archived only when asked', () => {
    expect(clientAccountsQuery({ showArchived: true })).toBe('segment=clients&include_archived=true')
    expect(clientAccountsQuery({ showArchived: false })).toBe('segment=clients')
  })

  it('combines every filter', () => {
    expect(clientAccountsQuery({ role: 'trade', term: 'finch', showArchived: true })).toBe(
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
