import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import {
  COMPANIES_PATH,
  PENDING_ACCOUNTS,
  archivePath,
  canDeleteApplication,
  canRename,
  companyFilters,
  contactLine,
  loginActions,
  loginState,
  loginsLine,
  newLoginBody,
  whereLine,
} from './clientCompanies.js'

describe('companyFilters', () => {
  it('sends only the filters that are set, and never an empty string', () => {
    expect(companyFilters()).toEqual({ q: null, customer_type: null, include_archived: null, pending: null })
    expect(buildListQuery(companyFilters())).toBe('')
    expect(buildListQuery(companyFilters({ term: ' zomia ', customerType: 'Trade', showArchived: true, pending: true })))
      .toBe('q=zomia&customer_type=Trade&include_archived=true&pending=true')
  })
})

describe('row cells', () => {
  it('names the primary contact, else counts the book', () => {
    expect(contactLine({ primary_contact_name: 'Ann', contact_count: 3 })).toBe('Ann')
    expect(contactLine({ primary_contact_name: ' ', contact_count: 3 })).toBe('3 on file')
    expect(contactLine({ primary_contact_name: null, contact_count: 0 })).toBe('—')
  })

  it('joins city and country', () => {
    expect(whereLine({ city: 'Auckland', country: 'New Zealand' })).toBe('Auckland, New Zealand')
    expect(whereLine({ city: null, country: ' ' })).toBe('—')
  })

  it('reports the company by its logins — awaiting review first', () => {
    expect(loginsLine({ users: [] })).toEqual({ tone: 'muted', label: 'No login' })
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: true }, { role: 'customer' }] }))
      .toEqual({ tone: 'sage', label: '2 logins · trade' })
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: false }, { role: 'trade', trade_approved: true }] }))
      .toEqual({ tone: 'clay', label: 'Awaiting review' })
    expect(loginsLine({ users: [{ role: 'customer' }] })).toEqual({ tone: 'muted', label: '1 login' })
    // A declined (archived) applicant is not waiting, and not a login either.
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: false, archived_at: '2026-09-01' }] }))
      .toEqual({ tone: 'muted', label: 'No login' })
  })

  it('links the Dynamics record in the Archive', () => {
    expect(archivePath({ legacy_account_guid: 'abc' })).toBe('/archive/accounts?filter=guid:eq:abc')
    expect(archivePath({})).toBeNull()
  })
})

describe('a login on the company', () => {
  it('reports its state with archived winning outright', () => {
    expect(loginState({ role: 'trade', trade_approved: false })).toEqual({ label: 'Awaiting review', tone: 'clay' })
    expect(loginState({ role: 'trade', trade_approved: true })).toEqual({ label: 'Trade approved', tone: 'sage' })
    expect(loginState({ role: 'customer' })).toEqual({ label: 'Customer', tone: 'muted' })
    expect(loginState({ role: 'trade', trade_approved: false, archived_at: 'x' })).toEqual({ label: 'Declined', tone: 'muted' })
    expect(loginState({ role: 'trade', trade_approved: true, archived_at: 'x' })).toEqual({ label: 'Archived', tone: 'muted' })
  })

  it('offers approve and decline to a pending trade login only', () => {
    expect(loginActions({ role: 'trade', trade_approved: false })).toMatchObject({ approve: true, decline: true, archiveLabel: 'Archive', archivePath: 'archive' })
    expect(loginActions({ role: 'trade', trade_approved: true })).toMatchObject({ approve: false, decline: false })
    expect(loginActions({ role: 'customer' })).toMatchObject({ approve: false, decline: false })
    expect(loginActions({ role: 'trade', trade_approved: false, archived_at: 'x' }))
      .toMatchObject({ approve: false, decline: false, archived: true, archiveLabel: 'Restore', archivePath: 'restore' })
  })

  it('unlocks the approval tick off the open draft, so promote + approve is one save', () => {
    expect(loginActions({ role: 'customer' }).canApprove).toBe(false)
    expect(loginActions({ role: 'customer' }, { role: 'trade' }).canApprove).toBe(true)
    expect(loginActions({ role: 'trade' }, { role: 'customer' }).canApprove).toBe(false)
  })

  it('creates a login ON the company', () => {
    expect(newLoginBody('42', { email: 'a@b.c', role: 'trade', name: null }))
      .toEqual({ email: 'a@b.c', role: 'trade', name: null, trade_account_id: 42 })
  })
})

describe('the company record', () => {
  it('renames only a company with no Dynamics GUID', () => {
    expect(canRename({ legacy_account_guid: null })).toBe(true)
    expect(canRename({ legacy_account_guid: 'abc' })).toBe(false)
  })

  it('offers Delete form only once every login is archived or gone', () => {
    expect(canDeleteApplication({ trade_application_id: 1, users: [] })).toBe(true)
    expect(canDeleteApplication({ trade_application_id: 1, users: [{ archived_at: 'x' }] })).toBe(true)
    expect(canDeleteApplication({ trade_application_id: 1, users: [{ archived_at: null }, { archived_at: 'x' }] })).toBe(false)
    expect(canDeleteApplication({ trade_application_id: null, users: [] })).toBe(false)
  })
})

describe('the Accounts tab', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

  it('is routed and leads the Clients section', () => {
    expect(app).toContain(`path="${COMPANIES_PATH}" element={`)
    expect(app).toContain('<ClientCompanies />')
    expect(app).not.toContain(`path="${COMPANIES_PATH}" element={<Navigate`)
  })

  // The Clients and Applicants tabs folded in here; their bookmarks must land
  // on the roster, not fall through the catch-all onto the dashboard.
  it('absorbs the old Clients and Applicants routes', () => {
    expect(app).toContain('<Route path="/clients" element={<Navigate to="/clients/accounts" replace />} />')
    expect(app).toContain('<Route path="/clients/applicants" element={<Navigate to={PENDING_ACCOUNTS} replace />} />')
    expect(app).toContain('<Route path="/users/applicants" element={<Navigate to={PENDING_ACCOUNTS} replace />} />')
    expect(PENDING_ACCOUNTS).toBe('/clients/accounts?pending=true')
    expect(app).not.toContain('ClientAccounts')
    expect(app).not.toContain('TradeApplicants')
  })
})
