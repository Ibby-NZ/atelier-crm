import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import Pagination from '../admin/Pagination.jsx'
import { useAdminList } from '../admin/useAdminList.js'
import LinkRow from '../admin/LinkRow.jsx'
import { GhostButton, HeaderRow, Select, cellInput, monoText, mutedText } from '../admin/parts.jsx'
import {
  CUSTOMER_TYPES,
  NEW_COMPANY_ROUTE,
  PAGE_LIMIT,
  TRADE_ACCOUNTS_PATH,
  companyFilters,
  companyRoute,
  contactLine,
  loginsLine,
  whereLine,
} from './clientCompanies.js'

// Accounts — the client roster: every company the office trades with, LIVE
// in `trade_accounts`. The cutover merge (`npm run merge:legacy` in
// atelier-api) carried every Dynamics account and its contacts over, so this
// is where the 860 clients live now.
//
// It is the ONE client record (Sept 2026). The Clients tab (portal logins) and
// the Applicants tab (the review queue) folded into it: a company carries its
// details, its LOGINS (edited in place — name, email, role, trade approval,
// archive, reset link, add one), the trade APPLICATION that raised it, and its
// contact book. A trade application raises its company on submission, so
// `?pending=true` — where the office's alert mail lands — is the queue: every
// company with an unapproved trade login.
//
// One company OPENS ON ITS OWN PAGE (ClientCompany, /clients/accounts/:id) and
// "New account" on another (ClientCompanyNew, /clients/accounts/new) — 23 Sep
// 2026, the client's "every data entry on its own page". Both used to open
// inside this screen: the company under its row, the form above the list. This
// screen is the list, the filters and the search; its rows carry no lifecycle
// verbs because the API offers none on a trade account.
//
//   GET  /admin/trade-accounts?q=&customer_type=&include_archived=&pending=&page=  → { trade_accounts, meta }
//
// Rules live in ./clientCompanies.js, tested; this file is layout.

const COLUMNS = '2fr 0.7fr 0.6fr 1.2fr 1.4fr 1fr 1.1fr 1fr'
const LABELS = ['Company', 'Account #', 'Type', 'Contact', 'Email', 'Phone', 'Where', 'Portal']
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function ClientCompanies() {
  // `?q=` and `?pending=true` seed the filters once on arrival — an order's
  // "open the client" link lands here with the login's email, and the
  // application alert mail lands on the queue (the AdminStock idiom).
  const [searchParams] = useSearchParams()
  const [draft, setDraft] = useState(() => searchParams.get('q') ?? '')
  const [term, setTerm] = useState(() => searchParams.get('q') ?? '')
  const [customerType, setCustomerType] = useState('')
  const [pending, setPending] = useState(() => searchParams.get('pending') === 'true')
  const [showArchived, setShowArchived] = useState(false)

  const list = useAdminList({
    path: TRADE_ACCOUNTS_PATH,
    key: 'trade_accounts',
    limit: PAGE_LIMIT,
    filters: companyFilters({ term, customerType, showArchived, pending }),
  })

  const submit = (event) => { event.preventDefault(); setTerm(draft) }

  return (
    <>
      <PageHeader
        eyebrow="Clients · live"
        title="Accounts"
        subtitle="Every company the office trades with — its details, its portal logins, the trade application it came in on, and its contact book. Approving a login here is what unlocks trade pricing."
        right={
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Company, account #, contact, email, phone" aria-label="Search accounts"
              style={{ ...cellInput, width: 300 }} />
            <GhostButton type="submit">Search</GhostButton>
            <Select value={customerType} onChange={(e) => setCustomerType(e.target.value)} style={{ ...cellInput, width: 'auto' }} aria-label="Type">
              <option value="">All types</option>
              {CUSTOMER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
            <label style={{ ...mutedText, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> Awaiting review
            </label>
            <label style={{ ...mutedText, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
            <Link to={NEW_COMPANY_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">New account</GhostButton>
            </Link>
          </form>
        }
      />
      <SectionTabs tabs={clientsTabs} active="accounts" />

      <div style={{ marginTop: 18, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <HeaderRow columns={COLUMNS} labels={LABELS} />
        {list.status === 'loading' && <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>Loading accounts…</div>}
        {list.status === 'error' && <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{list.error}</div>}
        {list.status === 'ready' && list.rows.length === 0 && (
          <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>
            {pending ? 'Nothing is awaiting review.' : 'No accounts match.'}
          </div>
        )}
        {list.status === 'ready' && list.rows.map((account) => {
          const login = loginsLine(account)
          return (
            // The WHOLE row opens the company (LinkRow): with only the name
            // clickable, the roster read as unclickable. The name stays a
            // Link for the keyboard and for a new tab.
            <LinkRow key={account.id} to={companyRoute(account.id)} columns={COLUMNS} archived={Boolean(account.archived_at)}>
              <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Link to={companyRoute(account.id)} className="ab-link"
                  style={{ fontFamily: font.display, fontSize: 14.5, color: c.ink, textDecoration: 'none' }}>
                  {account.company_name}
                </Link>
                {account.name_is_ambiguous && <span title="Another account shares this name" style={{ marginLeft: 6, color: c.clay }}>●</span>}
              </span>
              <span style={{ ...cell, ...monoText }}>{account.account_number ?? '—'}</span>
              <span style={cell}>{account.customer_type ?? '—'}</span>
              <span style={cell}>{contactLine(account)}</span>
              <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{account.email ?? '—'}</span>
              <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{account.phone ?? '—'}</span>
              <span style={cell}>{whereLine(account)}</span>
              <StatusPill tone={login.tone}>{login.label}</StatusPill>
            </LinkRow>
          )
        })}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={mutedText}>{list.total.toLocaleString('en-NZ')} account{list.total === 1 ? '' : 's'}</span>
        <Pagination page={list.page} totalPages={list.totalPages} total={list.total} unit="accounts" onPage={list.setPage} busy={list.status === 'loading'} />
      </div>
    </>
  )
}
