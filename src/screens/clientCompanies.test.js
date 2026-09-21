import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import {
  COMPANIES_PATH,
  archivePath,
  companyFilters,
  contactLine,
  loginsLine,
  whereLine,
} from './clientCompanies.js'

describe('companyFilters', () => {
  it('sends only the filters that are set, and never an empty string', () => {
    expect(companyFilters()).toEqual({ q: null, customer_type: null, include_archived: null })
    expect(buildListQuery(companyFilters())).toBe('')
    expect(buildListQuery(companyFilters({ term: ' zomia ', customerType: 'Trade', showArchived: true })))
      .toBe('q=zomia&customer_type=Trade&include_archived=true')
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

  it('reports logins by whether any is approved trade', () => {
    expect(loginsLine({ users: [] })).toEqual({ tone: 'muted', label: 'No login' })
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: true }, { role: 'customer' }] }))
      .toEqual({ tone: 'sage', label: '2 logins · trade' })
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: false }] }))
      .toEqual({ tone: 'clay', label: '1 login · not approved' })
  })

  it('links the Dynamics record in the Archive', () => {
    expect(archivePath({ legacy_account_guid: 'abc' })).toBe('/archive/accounts?filter=guid:eq:abc')
    expect(archivePath({})).toBeNull()
  })
})

describe('the Accounts tab', () => {
  it('is routed and leads the Clients section', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    expect(app).toContain(`path="${COMPANIES_PATH}" element={`)
    expect(app).toContain('<ClientCompanies />')
    expect(app).not.toContain(`path="${COMPANIES_PATH}" element={<Navigate`)
  })
})
