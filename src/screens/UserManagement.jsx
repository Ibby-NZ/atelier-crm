// User management — real platform accounts, wired to atelier-api's /admin/users
// (native CRUD, unlike the read-only Dynamics screens). Staff can create logins,
// change a role, approve a trade application, archive (soft-delete) an account,
// and delete one outright when nothing points at it.
//
//   GET    /admin/users?include_archived=  → { users }
//   POST   /admin/users                    → { user, temp_password? }   (201)
//   PATCH  /admin/users/:id                → { user }   (role, trade_approved, name,
//                                                       email, can_view_finance)
//   POST   /admin/users/:id/archive|restore → { user }
//   POST   /admin/users/:id/reset-password → { user, reset_email_sent }   (emails a link)
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

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill, PrimaryButton } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useConfirmation } from '../admin/useConfirmation.js'
import { signInEmailPatch } from './userManagement.js'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { ErrorLine, Field, GhostButton, PanelHead, PanelNote, Select, ToastLine, inputStyle, panel, sectionLabel } from '../admin/parts.jsx'
import { UNPAGED_LIST_LIMIT, describeAccount, userListFilters } from './adminLists.js'

const API_ROLES = [
  { value: 'customer', label: 'Customer' },
  { value: 'trade', label: 'Trade' },
  { value: 'backoffice', label: 'Back office' },
  { value: 'director', label: 'Director' },
]
const roleLabel = (r) => API_ROLES.find((x) => x.value === r)?.label ?? r

// The roles `can_view_finance` means anything on, mirroring FINANCE_ROLES in the
// API's src/users/admin-users.js. Finance visibility is a SECOND permission on
// top of the role, deliberately: `backoffice` covers the showroom as well as the
// accounts desk, so cost, margin and the pricing waterfall fail closed until
// somebody ticks this. The API clears the flag when a role moves off these two,
// which is why the checkbox reads `u.can_view_finance` from the list response
// rather than keeping any truth of its own.
const FINANCE_ROLES = ['backoffice', 'director']

const ROW_COLUMNS = '1fr 150px 150px 300px'

const EMPTY = { name: '', email: '', role: 'customer' }

export default function UserManagement() {
  const confirmation = useConfirmation()
  const [emailEdit, setEmailEdit] = useState(null)
  const [errorOwner, setErrorOwner] = useState('create')
  const emailTriggers = useRef(new Map())
  const editingUserId = useRef(null)
  const roster = useRef(null)
  useEffect(() => {
    // Reloads replace the row buttons. Resolve the current button by account id
    // after the editor closes rather than retaining a detached DOM element.
    if (!emailEdit && editingUserId.current !== null) {
      const trigger = emailTriggers.current.get(editingUserId.current)
      const target = trigger || roster.current
      target?.focus()
      editingUserId.current = null
    }
  }, [emailEdit?.user.id])
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [createdCredential, setCreatedCredential] = useState(null)

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
    setErrorOwner('create')
    setError('')
    if (!form.email.trim()) return setError('An email is required.')
    const ok = await run(
      async () => {
        const body = await apiSend('POST', '/admin/users', {
          email: form.email.trim(),
          name: form.name.trim() || null,
          role: form.role,
        })
        setCreatedCredential(body.temp_password
          ? { email: body.user.email, password: body.temp_password }
          : null)
        return body
      },
      (body) => `${body.user.email} created.`
    )
    if (ok) setForm(EMPTY)
  }

  // A single-field patch. The controls are bound to the row's saved value, so a
  // refusal needs no revert — React re-renders the select from server truth.
  const patch = (user, body, note, owner = 'account') => {
    setErrorOwner(owner)
    return run(() => apiSend('PATCH', `/admin/users/${user.id}`, body), note)
  }

  const archive = async (user) => {
    const archived = Boolean(user.archived_at)
    if (!archived && !await confirmation.ask({
      title: `Archive ${user.email}?`,
      body: `Archive ${user.email}? You can restore it later.`,
      confirmLabel: 'Archive',
    })) return
    setErrorOwner('account')
    run(
      () => apiSend('POST', `/admin/users/${user.id}/${archived ? 'restore' : 'archive'}`, {}),
      archived ? `${user.email} restored.` : `${user.email} archived.`
    )
  }

  // The sign-in address is editable on purpose: a typo taken down over the phone
  // otherwise leaves an account nobody can reach. The API lower-cases it and
  // answers a collision with the same 409 create does; both land in `error`.
  const changeEmail = (user) => {
    editingUserId.current = user.id
    setErrorOwner('email')
    setError('')
    setEmailEdit({ user, email: user.email })
  }
  const cancelEmail = () => {
    if (busy) return
    setEmailEdit(null)
    setError('')
  }
  const saveEmail = async (event) => {
    event.preventDefault()
    const body = signInEmailPatch(emailEdit.user.email, emailEdit.email)
    if (!body) return cancelEmail()
    const ok = await patch(emailEdit.user, body, `${emailEdit.user.email} now signs in as ${body.email}.`, 'email')
    if (ok) {
      setEmailEdit(null)
    }
  }

  // The office's answer to "I can't sign in": the API emails the account
  // holder a single-use link and they choose their own password — nobody in
  // the office sees a credential, and nothing changes until the link is used.
  // (It used to land the account on the shared temp password and show it in
  // this toast.) The API refuses a non-director resetting a director, and an
  // archived account; both land in `error` like any other refusal.
  const resetPassword = async (user) => {
    if (!await confirmation.ask({
      title: 'Email reset link?',
      body: `Email ${user.email} a link to reset their password?`,
      confirmLabel: 'Email reset link',
    })) return
    setErrorOwner('account')
    run(
      () => apiSend('POST', `/admin/users/${user.id}/reset-password`, {}),
      `A reset link has been emailed to ${user.email}. It works once and expires in an hour.`
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

      {createdCredential && (
        <section aria-label="New account credentials" style={{ ...panel, padding: 20, marginTop: 20, maxWidth: 1000, background: c.surface }}>
          <div style={sectionLabel}>Account created</div>
          <p style={{ fontSize: 13, color: c.inkSoft }}>Temporary password for {createdCredential.email}. Record it before dismissing this notice; it is only returned once.</p>
          <div style={{ fontFamily: font.mono, fontSize: 14, color: c.ink, overflowWrap: 'anywhere' }}>{createdCredential.password}</div>
          <GhostButton onClick={() => setCreatedCredential(null)} style={{ marginTop: 12 }}>Dismiss</GhostButton>
        </section>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 28, marginTop: 28, maxWidth: 1000 }}>
        {/* Add a user */}
        <section style={panel}>
          <PanelHead label="Add an account" />
          <form onSubmit={submit} style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="r-grid-2">
              <Field label="Name"><input value={form.name} disabled={busy} onChange={set('name')} style={inputStyle} placeholder="e.g. Priya" /></Field>
              <Field label="Email"><input value={form.email} disabled={busy} onChange={set('email')} type="email" style={inputStyle} placeholder="priya@atelier.co.nz" /></Field>
              <Field label="Role">
                <Select value={form.role} disabled={busy} onChange={set('role')} style={inputStyle}>
                  {API_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
            </div>
            {errorOwner === 'create' && <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>}
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <PrimaryButton type="submit" disabled={busy}>Add account</PrimaryButton>
              <span style={{ fontSize: 11.5, color: c.muted }}>Created with a temp password; the person changes it on first sign-in.</span>
            </div>
          </form>
        </section>

        {/* The roster */}
        <section ref={roster} tabIndex={-1} aria-label="Accounts" style={panel}>
          <PanelHead label="Accounts" right={<span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{crud.list.total} shown</span>} />
          {errorOwner === 'account' && <ErrorLine style={{ padding: error ? '12px 20px' : undefined }}>{error}</ErrorLine>}

          {crud.list.status === 'loading' && <div style={{ padding: '16px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading accounts…</div>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}

          {crud.list.status === 'ready' && users.map((u) => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: ROW_COLUMNS, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}`, opacity: u.archived_at ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 14, color: c.inkSoft }}>{(u.name || u.email)[0].toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                    {u.name || '—'}
                    {u.archived_at && <span style={{ fontWeight: 500, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.clay, marginLeft: 7 }}>Archived</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, color: c.muted, fontFamily: font.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
                    <button type="button" disabled={busy} ref={(node) => {
                      if (node) emailTriggers.current.set(u.id, node)
                      else emailTriggers.current.delete(u.id)
                    }} onClick={() => changeEmail(u)} className="ab-t" aria-label={`Change sign-in email for ${u.email}`}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: font.ui, fontSize: 11, color: c.inkSoft, textDecoration: 'underline', flex: 'none' }}>
                      change
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <Select value={u.role} disabled={busy} onChange={(e) => patch(u, { role: e.target.value }, `${u.email} is now ${roleLabel(e.target.value)}.`)} style={{ ...inputStyle, height: 36, fontSize: 13 }} aria-label={`Role for ${u.email}`}>
                  {API_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </div>

              <div>
                {u.role === 'trade' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: c.inkSoft, cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(u.trade_approved)} disabled={busy} onChange={(e) => patch(u, { trade_approved: e.target.checked }, `${u.email} trade ${e.target.checked ? 'approved' : 'unapproved'}.`)} /> Trade approved
                  </label>
                ) : FINANCE_ROLES.includes(u.role) ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: c.inkSoft, cursor: 'pointer' }}
                    title="Lets this login see cost, margin and the pricing waterfall. Off unless granted.">
                    <input type="checkbox" checked={Boolean(u.can_view_finance)} disabled={busy} onChange={(e) => patch(u, { can_view_finance: e.target.checked }, `${u.email} ${e.target.checked ? 'can' : 'cannot'} see finance data.`)} /> Finance visibility
                  </label>
                ) : (
                  <StatusPill tone="muted">{u.trade_approved ? 'Trade ✓' : '—'}</StatusPill>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <GhostButton disabled={busy} onClick={() => resetPassword(u)}>Email reset link</GhostButton>
                {/* Archive is neutral now that a permanent verb sits beside it. */}
                <GhostButton disabled={busy} onClick={() => archive(u)}>{u.archived_at ? 'Restore' : 'Archive'}</GhostButton>
                <GhostButton disabled={busy} onClick={() => crud.remove.ask(u)} tone="danger">Delete</GhostButton>
              </div>
              {emailEdit?.user.id === u.id && (
                <form onSubmit={saveEmail} onKeyDown={(event) => {
                  if (event.key === 'Escape') { event.preventDefault(); cancelEmail() }
                }} style={{ gridColumn: '1 / -1', padding: 16, background: c.surface, borderLeft: `1px solid ${c.accent}` }}>
                  <Field label={`New sign-in email for ${emailEdit.user.name || emailEdit.user.email}`}>
                    <input autoFocus required type="email" autoComplete="off" value={emailEdit.email}
                      disabled={busy} onChange={(event) => setEmailEdit(edit => ({ ...edit, email: event.target.value }))}
                      style={inputStyle} />
                  </Field>
                  {errorOwner === 'email' && <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <GhostButton type="submit" disabled={busy}>Save email</GhostButton>
                    <GhostButton disabled={busy} onClick={cancelEmail}>Cancel</GhostButton>
                  </div>
                </form>
              )}
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
      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
