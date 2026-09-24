import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import {
  COMPANIES_PATH,
  NEW_COMPANY_ROUTE,
  NEW_ACCOUNTS_ROUTE,
  PENDING_ACCOUNTS,
  accountMeta,
  accountPath,
  archivePath,
  canDeleteApplication,
  canRename,
  companyFilters,
  companyRoute,
  contactLine,
  loginActions,
  loginState,
  loginsLine,
  newLoginBody,
  whereLine,
  declineBody,
  reviewRights,
  ownerOptions,
  xeroContactUrl,
  xeroNote,
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

  it('reports the company by its logins — awaiting approval first', () => {
    expect(loginsLine({ users: [] })).toEqual({ tone: 'muted', label: 'No login' })
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: true }, { role: 'customer' }] }))
      .toEqual({ tone: 'sage', label: '2 logins · trade' })
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: false }, { role: 'trade', trade_approved: true }] }))
      .toEqual({ tone: 'clay', label: 'Awaiting approval' })
    // Once the approver has approved every pending login, it waits on the accounts desk.
    expect(loginsLine({ users: [{ role: 'trade', trade_approved: false, trade_first_approved_at: 'x' }] }))
      .toEqual({ tone: 'clay', label: 'Awaiting final approval' })
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

describe('a company on its own page', () => {
  it('builds the page and the create page off the roster path, apart from the API read', () => {
    expect(companyRoute(42)).toBe('/clients/accounts/42')
    expect(NEW_COMPANY_ROUTE).toBe('/clients/accounts/new')
    // The page and the read it fetches end in the same id and are still two
    // names — a link is not a fetch.
    expect(accountPath(42)).toBe('/admin/trade-accounts/42')
  })

  it('heads the page with type, account number and where, whichever exist', () => {
    expect(accountMeta({ customer_type: 'Trade', account_number: 'C0042', city: 'Auckland', country: 'New Zealand' }))
      .toBe('Trade · Account C0042 · Auckland, New Zealand')
    expect(accountMeta({ customer_type: ' ', account_number: null, city: null, country: 'Australia' })).toBe('Australia')
    expect(accountMeta({})).toBeNull()
  })
})

describe('a login on the company', () => {
  it('reports its state with archived winning outright', () => {
    expect(loginState({ role: 'trade', trade_approved: false })).toEqual({ label: 'Awaiting approval', tone: 'clay' })
    expect(loginState({ role: 'trade', trade_approved: false, trade_first_approved_at: 'x' }))
      .toEqual({ label: 'Awaiting final approval', tone: 'clay' })
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

  // Two steps, each owned by one person (24 Sep 2026).
  it('offers each review step to the person who owns it, and says who the rest wait on', () => {
    const review = { approver_email: 'liz@a.example', accounts_email: 'jenette@a.example' }
    const lizRights = reviewRights(review, { email: 'LIZ@a.example' })
    const jenetteRights = reviewRights(review, { email: 'jenette@a.example' })
    const officeRights = reviewRights(review, { email: 'office@a.example' })
    const fresh = { role: 'trade', trade_approved: false }
    const halfway = { ...fresh, trade_first_approved_at: '2026-09-24' }

    expect(loginActions(fresh, {}, lizRights)).toMatchObject({ approve: true, finalApprove: false, decline: true, waitingOn: null })
    expect(loginActions(fresh, {}, jenetteRights)).toMatchObject({ approve: false, decline: false, waitingOn: 'liz@a.example' })
    expect(loginActions(halfway, {}, jenetteRights)).toMatchObject({ approve: false, finalApprove: true, decline: false, waitingOn: null })
    expect(loginActions(halfway, {}, lizRights)).toMatchObject({ finalApprove: false, decline: true, waitingOn: 'jenette@a.example' })
    expect(loginActions(halfway, {}, officeRights)).toMatchObject({ finalApprove: false, decline: false, waitingOn: 'jenette@a.example' })
    // Nobody configured: anyone takes either step.
    expect(reviewRights(null, { email: 'x@a.example' })).toMatchObject({ approve: true, finalApprove: true })
  })

  it('lets the approval tick revoke only — approving goes through the two steps', () => {
    expect(loginActions({ role: 'trade', trade_approved: false }).canRevoke).toBe(false)
    expect(loginActions({ role: 'customer' }, { role: 'trade' }).canRevoke).toBe(false)
    expect(loginActions({ role: 'trade', trade_approved: true }).canRevoke).toBe(true)
    expect(loginActions({ role: 'trade', trade_approved: true }, { role: 'customer' }).canRevoke).toBe(false)
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
  // on the review queue — the New accounts tab since 24 Sep 2026 — not fall
  // through the catch-all onto the dashboard.
  it('absorbs the old Clients and Applicants routes', () => {
    expect(app).toContain('<Route path="/clients" element={<Navigate to="/clients/accounts" replace />} />')
    expect(app).toContain('<Route path="/clients/applicants" element={<Navigate to={NEW_ACCOUNTS_ROUTE} replace />} />')
    expect(app).toContain('<Route path="/users/applicants" element={<Navigate to={NEW_ACCOUNTS_ROUTE} replace />} />')
    expect(NEW_ACCOUNTS_ROUTE).toBe('/clients/new-accounts')
    expect(routeText(NEW_ACCOUNTS_ROUTE)).toContain('<ClientCompanies queue />')
    expect(routeText(NEW_ACCOUNTS_ROUTE)).toContain('cap={CAPS.ADMIN_USERS}')
    expect(PENDING_ACCOUNTS).toBe('/clients/accounts?pending=true')
    expect(app).not.toContain('ClientAccounts')
    expect(app).not.toContain('TradeApplicants')
  })

  // The route's own text, from its path to the next <Route. No jsdom, so this
  // is how a guard is pinned; indexOf rather than a regex over newlines, which
  // a CRLF checkout would break.
  const routeText = (path) => {
    const start = app.indexOf(`path="${path}"`)
    if (start === -1) return ''
    const end = app.indexOf('<Route', start)
    return app.slice(start, end === -1 ? undefined : end)
  }

  // 23 Sep 2026: one company opens on its own page and "New account" on
  // another. Both wear the roster's director gate — the page edits the same
  // logins, the form raises a company.
  it('routes the company page and the create page behind the roster gate', () => {
    for (const [path, screen] of [
      [COMPANIES_PATH, '<ClientCompanies />'],
      ['/clients/accounts/:id', '<ClientCompany />'],
      [NEW_COMPANY_ROUTE, '<ClientCompanyNew />'],
    ]) {
      const route = routeText(path)
      expect(route).toContain('RequireCap cap={CAPS.ADMIN_USERS}')
      expect(route).toContain(screen)
    }
  })
})

// No jsdom: the three screens are pinned by their source.
describe('the roster, the page and the create page', () => {
  const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
  const LIST = read('ClientCompanies.jsx')
  const PAGE = read('ClientCompany.jsx')
  const CREATE = read('ClientCompanyNew.jsx')

  it('keeps the roster a list: rows link out, nothing expands, nothing writes', () => {
    expect(LIST).toContain('companyRoute(account.id)')
    expect(LIST).toContain('to={NEW_COMPANY_ROUTE}')
    expect(LIST).not.toContain('aria-expanded')
    expect(LIST).not.toContain('CompanyDetail')
    expect(LIST).not.toContain('AccountForm')
    expect(LIST).not.toContain('apiSend')
  })

  // 23 Sep 2026: with only the name a link, the roster read as unclickable.
  // The whole row opens the company now; the name stays a Link (keyboard,
  // new tab), and the row composes LinkRow rather than wiring its own click.
  it('opens the company from anywhere on the row, not only its name', () => {
    expect(LIST).toContain('<LinkRow key={account.id} to={companyRoute(account.id)}')
    expect(LIST).toContain('<Link to={companyRoute(account.id)}')
    expect(LIST).not.toMatch(/<Row[\s>]/)
  })

  // The order page's "Open client account" and the alert mail land here.
  it('still seeds the search and the review queue from the URL', () => {
    expect(LIST).toContain("searchParams.get('q')")
    expect(LIST).toContain("searchParams.get('pending') === 'true'")
  })

  it('reads the one company and reloads it after every verb', () => {
    expect(PAGE).toContain('apiFetch(accountPath(id))')
    expect(PAGE).toContain('useMutation({ reload: load, flash })')
    expect(PAGE).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(PAGE).toContain('<NotFound')
    expect(PAGE).toContain("apiSend('PATCH', accountPath(account.id), patch)")
    // The StrictMode double-mount guard every load effect carries.
    expect(PAGE).toContain('let active = true')
  })

  it('draws what the row expansion drew, in the same order', () => {
    const order = [
      '<AccountForm',
      '<AccountLogins account={account} mutation={mutation} confirmation={confirmation} rights={reviewRights(review, me)} />',
      '<AccountApplication account={account} mutation={mutation} confirmation={confirmation} />',
      '<TradeContactsPanel guid={account.legacy_account_guid} accountId={account.id} />',
      'Dynamics record in Archive',
    ].map((marker) => PAGE.indexOf(marker))
    expect(order.every((index) => index !== -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // The application panel only where one raised the company.
    expect(PAGE).toContain('{account.trade_application_id && (')
    expect(PAGE).toContain('<ConfirmDialog {...confirmation.dialog} />')
  })

  it('shares ONE form between raising a company and correcting it', () => {
    expect(PAGE).toContain("import AccountForm from './AccountForm.jsx'")
    expect(CREATE).toContain("import AccountForm from './AccountForm.jsx'")
  })

  it('lands a new company on its own page, replacing the form in history', () => {
    expect(CREATE).toContain("apiSend('POST', TRADE_ACCOUNTS_PATH, body)")
    expect(CREATE).toContain('navigate(companyRoute(created.id), { replace: true })')
    expect(CREATE).toContain('onCancel={() => navigate(COMPANIES_PATH)}')
  })
})

describe('the review flow (24 Sep 2026)', () => {
  it('refuses a decline with nothing to tell the applicant', () => {
    expect(declineBody('  ')).toHaveProperty('error')
    expect(declineBody(undefined)).toHaveProperty('error')
    expect(declineBody(' No NZBN. ')).toEqual({ body: { reason: 'No NZBN.' } })
  })

  it('offers the staff roster as owners, keeping an owner who has left it', () => {
    const staff = [{ id: 1, label: 'Liz' }, { id: 2, label: 'Jenette' }]
    expect(ownerOptions(staff, { account_owner: null })).toBe(staff)
    expect(ownerOptions(staff, { account_owner: { id: 2, name: 'Jenette', email: 'j@x' } })).toBe(staff)
    expect(ownerOptions(staff, { account_owner: { id: 9, name: null, email: 'gone@x' } }))
      .toEqual([...staff, { id: 9, label: 'gone@x' }])
  })

  it('says what Xero did, and nothing when there was no contact', () => {
    expect(xeroNote(null)).toBeNull()
    expect(xeroNote({ linked: true, xero_contact_id: 'c' })).toBe('Xero updated.')
    expect(xeroNote({ updated: true })).toBe('Xero updated.')
    expect(xeroNote({ linked: false, reason: 'Xero is down.' })).toBe('Xero not updated: Xero is down.')
  })

  it('links the contact in Xero', () => {
    expect(xeroContactUrl('abc-123')).toBe('https://go.xero.com/Contacts/View/abc-123')
  })
})
