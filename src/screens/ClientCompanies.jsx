import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import TradeContactsPanel from '../components/TradeContactsPanel.jsx'
import Pagination from '../admin/Pagination.jsx'
import { useAdminList } from '../admin/useAdminList.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiSend } from '../lib/api.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import { ErrorLine, Field, GhostButton, HeaderRow, PanelNote, Row, Select, ToastLine, cellInput, inputStyle, monoText, mutedText, useMutation, useToast } from '../admin/parts.jsx'
import {
  ACCOUNT_FIELDS,
  CUSTOMER_TYPES,
  PAGE_LIMIT,
  TRADE_ACCOUNTS_PATH,
  accountPath,
  archivePath,
  canEditAccount,
  companyFilters,
  contactLine,
  loginsLine,
  whereLine,
} from './clientCompanies.js'

// Accounts — the client roster: every company the office trades with, LIVE
// in `trade_accounts`. The cutover merge (`npm run merge:legacy` in
// atelier-api) carried every Dynamics account and its contacts over, so this
// is where the 860 clients live now; the Clients tab beside it is the portal
// LOGINS (people who sign in), and Applicants the queue that becomes one.
//
//   GET /admin/trade-accounts?q=&customer_type=&include_archived=&page=  → { trade_accounts, meta }
//
// A row expands to the company's details — editable by a DIRECTOR (the API
// 403s backoffice on PATCH /admin/trade-accounts/:id for any detail column;
// `canEditAccount` only decides whether the form is drawn) — and its contact
// book (<TradeContactsPanel>, the same panel the per-record Dynamics screen
// carries). Rules live in ./clientCompanies.js, tested; this file is layout.

const COLUMNS = '2fr 0.7fr 0.6fr 1.2fr 1.4fr 1fr 1.1fr 1fr'
const LABELS = ['Company', 'Account #', 'Type', 'Contact', 'Email', 'Phone', 'Where', 'Portal']
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function ClientCompanies() {
  const [draft, setDraft] = useState('')
  const [term, setTerm] = useState('')
  const [customerType, setCustomerType] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [open, setOpen] = useState(null) // account id
  const editable = canEditAccount(useAuth().user?.apiRole)

  const list = useAdminList({
    path: TRADE_ACCOUNTS_PATH,
    key: 'trade_accounts',
    limit: PAGE_LIMIT,
    filters: companyFilters({ term, customerType, showArchived }),
  })
  const toast = useToast()
  const mutation = useMutation({ reload: list.reload, flash: toast.flash })

  const submit = (event) => { event.preventDefault(); setTerm(draft) }

  return (
    <>
      <PageHeader
        eyebrow="Clients · live"
        title="Accounts"
        subtitle="Every company the office trades with, with its contact book. Carried over from Dynamics at cutover; a login on the Clients tab is linked to one of these."
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
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
          </form>
        }
      />
      <SectionTabs tabs={clientsTabs} active="accounts" />
      {mutation.error && <ErrorLine style={{ marginTop: 14 }}>{mutation.error}</ErrorLine>}
      <ToastLine message={toast.message} />

      <div style={{ marginTop: 18, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <HeaderRow columns={COLUMNS} labels={LABELS} />
        {list.status === 'loading' && <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>Loading accounts…</div>}
        {list.status === 'error' && <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{list.error}</div>}
        {list.status === 'ready' && list.rows.length === 0 && <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>No accounts match.</div>}
        {list.status === 'ready' && list.rows.map((account) => {
          const login = loginsLine(account)
          const expanded = open === account.id
          return (
            <div key={account.id}>
              <Row columns={COLUMNS} archived={Boolean(account.archived_at)} style={{ cursor: 'pointer', background: expanded ? c.surface : undefined }}>
                <button type="button" onClick={() => setOpen(expanded ? null : account.id)} className="ab-t"
                  style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: font.display, fontSize: 14.5, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {account.company_name}
                  {account.name_is_ambiguous && <span title="Another account shares this name" style={{ marginLeft: 6, color: c.clay }}>●</span>}
                </button>
                <span style={{ ...cell, ...monoText }}>{account.account_number ?? '—'}</span>
                <span style={cell}>{account.customer_type ?? '—'}</span>
                <span style={cell}>{contactLine(account)}</span>
                <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{account.email ?? '—'}</span>
                <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{account.phone ?? '—'}</span>
                <span style={cell}>{whereLine(account)}</span>
                <StatusPill tone={login.tone}>{login.label}</StatusPill>
              </Row>
              {expanded && <CompanyDetail account={account} editable={editable} busy={mutation.busy} onSave={(patch) => mutation.run(() => apiSend('PATCH', accountPath(account.id), patch), `${account.company_name} saved.`)} />}
            </div>
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

function CompanyDetail({ account, editable, busy, onSave }) {
  const archive = archivePath(account)
  return (
    <div style={{ padding: '14px 20px 20px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
      {editable
        ? <AccountForm account={account} busy={busy} onSave={onSave} />
        : <AccountFacts account={account} />}
      <div style={{ marginTop: 18 }}>
        <TradeContactsPanel guid={account.legacy_account_guid} />
      </div>
      {archive && (
        <div style={{ marginTop: 12 }}>
          <Link to={archive} style={{ fontSize: 12, color: c.muted }}>Dynamics record in the Archive →</Link>
        </div>
      )}
    </div>
  )
}

// The read-only view a backoffice login gets.
function AccountFacts({ account }) {
  const facts = ACCOUNT_FIELDS
    .map((field) => [field.label, field.key === 'account_manager_name' ? account.account_manager?.name : account[field.key]])
    .filter(([, value]) => value)
  const logins = (account.users ?? []).map((u) => u.email).join(', ')
  return (
    <>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', fontSize: 12.5 }}>
        {facts.map(([label, value]) => <FactPair key={label} label={label} value={value} />)}
        {logins && <FactPair label="Logins" value={logins} />}
      </dl>
      <PanelNote>Editing a client's details is for a director.</PanelNote>
    </>
  )
}

// The director's editor. The record is flattened first because the API nests
// the account manager; the diff sends only what changed, blanks as null.
function AccountForm({ account, busy, onSave }) {
  const record = { ...account, account_manager_name: account.account_manager?.name ?? null }
  const [draft, setDraft] = useState(() => draftFrom(record, ACCOUNT_FIELDS))
  const [error, setError] = useState('')
  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    const result = diffFields(record, draft, ACCOUNT_FIELDS)
    if (result.error) return setError(result.error)
    if (Object.keys(result.patch).length === 0) return setError('Nothing has changed.')
    setError('')
    onSave(result.patch)
  }
  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {ACCOUNT_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} style={field.key === 'address' ? { gridColumn: 'span 2' } : undefined}>
            {field.key === 'address'
              ? <textarea value={draft[field.key] ?? ''} onChange={set(field.key)} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} />
              : field.key === 'customer_type'
                ? <Select value={draft[field.key] ?? ''} onChange={set(field.key)}><option value="">—</option>{CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
                : <input value={draft[field.key] ?? ''} onChange={set(field.key)} style={inputStyle} />}
          </Field>
        ))}
      </div>
      {(account.users ?? []).length > 0 && <div style={{ ...mutedText, marginTop: 10 }}>Logins: {account.users.map((u) => u.email).join(', ')}</div>}
      {error && <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <GhostButton type="submit" tone="accent" disabled={busy}>Save details</GhostButton>
      </div>
    </form>
  )
}

function FactPair({ label, value }) {
  return (
    <>
      <dt style={{ color: c.muted }}>{label}</dt>
      <dd style={{ margin: 0, color: c.ink, whiteSpace: 'pre-line' }}>{value}</dd>
    </>
  )
}
