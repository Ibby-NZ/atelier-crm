// User management — real platform accounts, wired to atelier-api's /admin/users
// (native CRUD, unlike the read-only Dynamics screens). Staff can create logins,
// change a role, approve a trade application, archive (soft-delete) an account,
// and delete one outright when nothing points at it.
//
//   GET    /admin/users?include_archived=  → { users }
//   POST   /admin/users                    → { user, temp_password? }   (201)
//   PATCH  /admin/users/:id                → { user }
//   POST   /admin/users/:id/archive|restore → { user }
//   POST   /admin/users/:id/reset-password → { user, temp_password }
//   DELETE /admin/users/:id                → { deleted } | 409 { blockers } | 403
//
// The API's requireRole('backoffice') is the real gate; it also enforces the
// self-protection rules, surfaced here as inline errors and — for a delete — as
// a refusal inside the dialog.
//
// This is the SUPERSET view: it lists every account of every role, staff
// included, and is the only place a backoffice/director login can be created.
// Clients is the same endpoint narrowed to `segment=clients`
// (customer + trade) for the office's day-to-day work. Deliberately not narrowed
// here to match — staff rely on one screen that shows everything, and a "why
// can't I see Liz" is a worse bug than a longer list. The pointer below says so
// in the UI, in place of the two-tab strip Applicants used to share.
//
// **It is also the only screen where a self-delete can happen**, because it is
// the only one that lists the signed-in staff account at all — segment=clients
// never returns one. The API answers that with 403 (a delete has no body to
// refuse, so the caller is simply not permitted), which reaches the dialog with
// `blockers: []` and `archivable: true`: no count lines, and Archive instead as
// the only way forward.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill, PrimaryButton } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { ToastLine } from '../admin/parts.jsx'
import { UNPAGED_LIST_LIMIT, describeAccount, userListFilters } from './adminLists.js'

const API_ROLES = [
  { value: 'customer', label: 'Customer' },
  { value: 'trade', label: 'Trade' },
  { value: 'backoffice', label: 'Back office' },
  { value: 'director', label: 'Director' },
]
const roleLabel = (r) => API_ROLES.find((x) => x.value === r)?.label ?? r

const sectionLabel = { fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, fontFamily: font.ui }
const panel = { border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }
const inputStyle = { width: '100%', height: 42, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 14, outline: 'none' }
const rowButton = { background: 'none', border: `1px solid ${c.line}`, borderRadius: 4, padding: '7px 12px', cursor: 'pointer', fontFamily: font.ui, fontSize: 12 }

const ROW_COLUMNS = '1fr 150px 150px 300px'

const EMPTY = { name: '', email: '', role: 'customer' }

export default function UserManagement() {
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState(EMPTY)

  // The list, the toast, the mutate-then-reload cycle and the delete flow in
  // one. `archive` is what puts "Archive instead" on a refusal — and here that
  // covers both refusals a staff account can produce: a client with history, and
  // the signed-in user trying to delete themselves.
  const crud = useCrudScreen({
    path: '/admin/users',
    key: 'users',
    limit: UNPAGED_LIST_LIMIT,
    filters: userListFilters(showArchived),
    entity: 'account',
    describe: describeAccount,
    archive: (user) => apiSend('POST', `/admin/users/${user.id}/archive`, {}),
  })
  const users = crud.list.rows
  const { message } = crud.toast
  const { busy, error, setError, run } = crud.mutation

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email.trim()) return setError('An email is required.')
    const ok = await run(
      () =>
        apiSend('POST', '/admin/users', {
          email: form.email.trim(),
          name: form.name.trim() || null,
          role: form.role,
        }),
      (body) =>
        body.temp_password
          ? `${body.user.email} created — temp password ${body.temp_password}.`
          : `${body.user.email} created.`
    )
    if (ok) setForm(EMPTY)
  }

  // A single-field patch. The controls are bound to the row's saved value, so a
  // refusal needs no revert — React re-renders the select from server truth.
  const patch = (user, body, note) =>
    run(() => apiSend('PATCH', `/admin/users/${user.id}`, body), note)

  const archive = (user) => {
    const archived = Boolean(user.archived_at)
    if (!archived && typeof window !== 'undefined' && !window.confirm(`Archive ${user.email}? You can restore it later.`)) return
    run(
      () => apiSend('POST', `/admin/users/${user.id}/${archived ? 'restore' : 'archive'}`, {}),
      archived ? `${user.email} restored.` : `${user.email} archived.`
    )
  }

  // The office's answer to "I can't sign in": the account lands back on the
  // shared temp password, which the toast shows so it can be read out over the
  // phone. There is no self-service password change, so this is the only way a
  // password moves. The API refuses a non-director resetting a director; that
  // refusal lands in `error` like any other.
  const resetPassword = (user) => {
    if (typeof window !== 'undefined' && !window.confirm(`Reset the password for ${user.email} to the temp password?`)) return
    run(
      () => apiSend('POST', `/admin/users/${user.id}/reset-password`, {}),
      (body) => `${user.email} password reset — temp password ${body.temp_password}.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={<>Users &amp; permissions</>}
        subtitle="Create logins, set roles, approve trade accounts, archive or delete accounts. Enforced server-side."
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
        }
      />
      <div style={{ marginTop: 22, padding: '12px 16px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, fontSize: 12.5, color: c.inkSoft, lineHeight: 1.6, maxWidth: 1000 }}>
        Every account, staff included. Customer and trade accounts — and the trade
        applications waiting for review — are worked in{' '}
        <Link to="/clients" className="ab-link" style={{ color: c.accent }}>Clients</Link>.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 28, marginTop: 28, maxWidth: 1000 }}>
        {/* Add a user */}
        <section style={panel}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.line}` }}>
            <span style={sectionLabel}>Add an account</span>
          </div>
          <form onSubmit={submit} style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="r-grid-2">
              <Field label="Name"><input value={form.name} disabled={busy} onChange={set('name')} style={inputStyle} placeholder="e.g. Priya" /></Field>
              <Field label="Email"><input value={form.email} disabled={busy} onChange={set('email')} type="email" style={inputStyle} placeholder="priya@atelier.co.nz" /></Field>
              <Field label="Role">
                <select value={form.role} disabled={busy} onChange={set('role')} style={inputStyle}>
                  {API_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
            </div>
            {error && <div role="alert" style={{ marginTop: 14, fontSize: 12.5, color: c.clay, fontFamily: font.ui }}>{error}</div>}
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <PrimaryButton type="submit">Add account</PrimaryButton>
              <span style={{ fontSize: 11.5, color: c.muted }}>Created with a temp password; the person changes it on first sign-in.</span>
            </div>
          </form>
        </section>

        {/* The roster */}
        <section style={panel}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={sectionLabel}>Accounts</span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{crud.list.total} shown</span>
          </div>

          {crud.list.status === 'loading' && <div style={{ padding: '16px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading accounts…</div>}
          {crud.list.status === 'error' && <div role="alert" style={{ padding: '16px 20px', fontSize: 12.5, color: c.clay }}>{crud.list.error}</div>}

          {crud.list.status === 'ready' && users.map((u) => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: ROW_COLUMNS, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}`, opacity: u.archived_at ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 14, color: c.inkSoft }}>{(u.name || u.email)[0].toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                    {u.name || '—'}
                    {u.archived_at && <span style={{ fontWeight: 500, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.clay, marginLeft: 7 }}>Archived</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: c.muted, fontFamily: font.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                </div>
              </div>

              <div>
                <select value={u.role} disabled={busy} onChange={(e) => patch(u, { role: e.target.value }, `${u.email} is now ${roleLabel(e.target.value)}.`)} style={{ ...inputStyle, height: 36, fontSize: 13 }} aria-label={`Role for ${u.email}`}>
                  {API_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                {u.role === 'trade' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: c.inkSoft, cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(u.trade_approved)} disabled={busy} onChange={(e) => patch(u, { trade_approved: e.target.checked }, `${u.email} trade ${e.target.checked ? 'approved' : 'unapproved'}.`)} /> Trade approved
                  </label>
                ) : (
                  <StatusPill tone="muted">{u.trade_approved ? 'Trade ✓' : '—'}</StatusPill>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" disabled={busy} onClick={() => resetPassword(u)} className="ab-t"
                  style={{ ...rowButton, color: c.ink }}>
                  Reset password
                </button>
                {/* Archive is neutral now that a permanent verb sits beside it. */}
                <button type="button" disabled={busy} onClick={() => archive(u)} className="ab-t"
                  style={{ ...rowButton, color: c.ink }}>
                  {u.archived_at ? 'Restore' : 'Archive'}
                </button>
                <button type="button" disabled={busy} onClick={() => crud.remove.ask(u)} className="ab-t"
                  style={{ ...rowButton, color: c.clay }}>
                  Delete
                </button>
              </div>
            </div>
          ))}

          {crud.list.status === 'ready' && users.length === 0 && (
            <div style={{ padding: '16px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No accounts yet.</div>
          )}
        </section>

        <Pagination
          page={crud.list.page}
          totalPages={crud.list.totalPages}
          total={crud.list.total}
          unit="accounts"
          onPage={crud.list.setPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={message} />
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginBottom: 7 }}>{label}</span>
      {children}
    </label>
  )
}
