import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import TradeContactsPanel from '../components/TradeContactsPanel.jsx'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useAdminList } from '../admin/useAdminList.js'
import { useConfirmation } from '../admin/useConfirmation.js'
import { apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { ErrorLine, Field, GhostButton, HeaderRow, Row, Select, ToastLine, cellInput, inputStyle, monoText, mutedText, useMutation, useToast } from '../admin/parts.jsx'
import AccountLogins from './AccountLogins.jsx'
import AccountApplication from './AccountApplication.jsx'
import {
  ACCOUNT_FIELDS,
  CUSTOMER_TYPES,
  NEW_ACCOUNT_FIELDS,
  PAGE_LIMIT,
  TRADE_ACCOUNTS_PATH,
  accountPath,
  archivePath,
  canRename,
  companyFilters,
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
// the Applicants tab (the review queue) folded into it: a row expands to the
// company's details, its LOGINS (edited in place — name, email, role, trade
// approval, archive, reset link, add one), the trade APPLICATION that raised
// it, and its contact book. A trade application raises its company on
// submission, so `?pending=true` — where the office's alert mail lands — is
// the queue: every company with an unapproved trade login.
//
//   GET  /admin/trade-accounts?q=&customer_type=&include_archived=&pending=&page=  → { trade_accounts, meta }
//   POST /admin/trade-accounts { company_name, …details }                          → { trade_account }
//
// Every detail is editable by any CRM login (the director gate on the detail
// PATCH went on 22 Sep 2026). Rules live in ./clientCompanies.js, tested; this
// file is layout.

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
  const [open, setOpen] = useState(null) // account id
  const [adding, setAdding] = useState(false)
  const confirmation = useConfirmation()

  const list = useAdminList({
    path: TRADE_ACCOUNTS_PATH,
    key: 'trade_accounts',
    limit: PAGE_LIMIT,
    filters: companyFilters({ term, customerType, showArchived, pending }),
  })
  const toast = useToast()
  const mutation = useMutation({ reload: list.reload, flash: toast.flash })

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
            <GhostButton tone="accent" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : 'New account'}</GhostButton>
          </form>
        }
      />
      <SectionTabs tabs={clientsTabs} active="accounts" />
      {mutation.error && <ErrorLine style={{ marginTop: 14 }}>{mutation.error}</ErrorLine>}
      <ToastLine message={toast.message} />

      {adding && (
        <AccountForm
          account={{}}
          busy={mutation.busy}
          submitLabel="Add account"
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            const ok = await mutation.run(() => apiSend('POST', TRADE_ACCOUNTS_PATH, body), `${body.company_name} added.`)
            if (ok) setAdding(false)
          }}
        />
      )}

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
          const expanded = open === account.id
          return (
            <div key={account.id}>
              <Row columns={COLUMNS} archived={Boolean(account.archived_at)} style={{ cursor: 'pointer', background: expanded ? c.surface : undefined }}>
                <button type="button" onClick={() => setOpen(expanded ? null : account.id)} className="ab-t" aria-expanded={expanded}
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
              {expanded && (
                <CompanyDetail
                  account={account}
                  mutation={mutation}
                  confirmation={confirmation}
                  onSave={(patch) => mutation.run(() => apiSend('PATCH', accountPath(account.id), patch), `${account.company_name} saved.`)}
                />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={mutedText}>{list.total.toLocaleString('en-NZ')} account{list.total === 1 ? '' : 's'}</span>
        <Pagination page={list.page} totalPages={list.totalPages} total={list.total} unit="accounts" onPage={list.setPage} busy={list.status === 'loading'} />
      </div>
      <ConfirmDialog {...confirmation.dialog} />
    </>
  )
}

function CompanyDetail({ account, mutation, confirmation, onSave }) {
  const archive = archivePath(account)
  return (
    <div style={{ padding: '14px 20px 20px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
      <AccountForm account={account} busy={mutation.busy} submitLabel="Save details" onSave={onSave} />
      <div style={{ marginTop: 18 }}>
        <AccountLogins account={account} mutation={mutation} confirmation={confirmation} />
      </div>
      {account.trade_application_id && (
        <div style={{ marginTop: 18 }}>
          <AccountApplication account={account} mutation={mutation} confirmation={confirmation} />
        </div>
      )}
      <div style={{ marginTop: 18 }}>
        <TradeContactsPanel guid={account.legacy_account_guid} accountId={account.id} />
      </div>
      {archive && (
        <div style={{ marginTop: 12 }}>
          <Link to={archive} style={{ fontSize: 12, color: c.muted }}>Dynamics record in Archive →</Link>
        </div>
      )}
    </div>
  )
}

// One form for add and edit. Edit sends only the changed keys (diffFields);
// add sends every field (bodyFrom). The record is flattened first because the
// API nests the account manager. The company name is greyed on a Dynamics row
// — see `canRename`.
function AccountForm({ account, busy, submitLabel, onCancel, onSave }) {
  const creating = !account.id
  const fields = creating ? NEW_ACCOUNT_FIELDS : ACCOUNT_FIELDS
  const record = { ...account, account_manager_name: account.account_manager?.name ?? null }
  const [draft, setDraft] = useState(() => draftFrom(record, fields))
  const [error, setError] = useState('')
  const set = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const rename = creating || canRename(account)

  const submit = (event) => {
    event.preventDefault()
    const result = creating ? bodyFrom(draft, fields) : diffFields(record, draft, fields)
    if (result.error) return setError(result.error)
    const payload = result.patch ?? result.body
    if (Object.keys(payload).length === 0) return setError('Nothing has changed.')
    setError('')
    onSave(payload)
  }

  return (
    <form onSubmit={submit} style={creating ? { marginTop: 14, padding: '18px 20px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper } : undefined}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {fields.map((field) => (
          <Field key={field.key} label={field.label} style={field.key === 'address' ? { gridColumn: 'span 2' } : undefined}
            hint={field.key === 'company_name' && !rename ? 'Matched to Dynamics invoice history — not renamed here.' : undefined}>
            {field.key === 'address'
              ? <textarea value={draft[field.key] ?? ''} onChange={set(field.key)} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} />
              : field.key === 'customer_type'
                ? <Select value={draft[field.key] ?? ''} onChange={set(field.key)}><option value="">—</option>{CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
                : <input value={draft[field.key] ?? ''} onChange={set(field.key)} style={inputStyle} disabled={field.key === 'company_name' && !rename} />}
          </Field>
        ))}
      </div>
      {error && <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <GhostButton type="submit" tone="accent" disabled={busy}>{submitLabel}</GhostButton>
        {onCancel && <GhostButton onClick={onCancel} disabled={busy}>Cancel</GhostButton>}
      </div>
    </form>
  )
}
