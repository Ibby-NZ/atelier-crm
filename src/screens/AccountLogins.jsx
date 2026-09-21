import { useState } from 'react'
import { c, font } from '../theme.js'
import { StatusPill } from '../components/ui.jsx'
import CustomerOrders from '../admin/CustomerOrders.jsx'
import { apiDelete, apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { ArchivedTag, CheckField, ErrorLine, Field, GhostButton, Select, inputStyle, monoText, mutedText } from '../admin/parts.jsx'
import {
  CLIENT_ROLES,
  LOGIN_FIELDS,
  NEW_LOGIN,
  NEW_LOGIN_FIELDS,
  loginActions,
  loginPath,
  loginState,
  newLoginBody,
  roleLabel,
  unlinkPath,
} from './clientCompanies.js'

// The portal logins on one company — what the Clients tab used to list on its
// own (Sept 2026). A login is a person who can sign in; a company has none, one
// or several (the application collects a design contact and an accounts
// contact). Everything the old tab did is a verb here, on the company row:
//
//   PATCH  /admin/users/:id                    → { user }   name, email, phone, role, trade_approved
//   POST   /admin/users/:id/archive|restore    → { user }   decline IS archive — the only durable "no"
//   POST   /admin/users/:id/reset-password     → { reset_email_sent }   no body: the person is mailed a link
//   POST   /admin/users { …, trade_account_id } → { user, temp_password? }   a login ON this company
//   DELETE /admin/trade-accounts/:id/users/:userId                          the grant only; the login survives
//
// Three rules the form respects, all enforced server-side: a duplicate email is
// a 409 that lands inline; the API refuses a few self-edits (your own role) with
// a 422 that lands inline too; and a patch moving a role off `trade` clears
// `trade_approved` whatever else the body says. Rules live in
// ./clientCompanies.js, tested; this file is layout.

const dateOnly = (value) => String(value ?? '').slice(0, 10) || '—'

export default function AccountLogins({ account, mutation, confirmation }) {
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  // The temp password is shown ONCE, by the API, in the create response, and it
  // stays until dismissed — a toast is the wrong lifetime for a credential
  // someone has to write down.
  const [created, setCreated] = useState(null)
  const { busy, run } = mutation
  const users = account.users ?? []

  const decide = (user, verb) => {
    if (verb === 'approve') {
      return run(() => apiSend('PATCH', loginPath(user.id), { trade_approved: true }), `${user.email} approved for trade.`)
    }
    if (verb === 'decline') {
      return confirmation.ask({
        title: `Decline ${user.email}?`,
        body: 'The login is archived: they can no longer sign in, the application and any history stay intact, and you can restore it here.',
        confirmLabel: 'Decline',
      }).then((ok) => ok && run(() => apiSend('POST', `${loginPath(user.id)}/archive`, {}), `${user.email} declined.`))
    }
    if (verb === 'archive' || verb === 'restore') {
      return run(() => apiSend('POST', `${loginPath(user.id)}/${verb}`, {}), `${user.email} ${verb}d.`)
    }
    if (verb === 'reset') {
      return confirmation.ask({
        title: `Email ${user.email} a reset link?`,
        body: 'They choose a new password from the link. Nothing changes until they use it.',
        confirmLabel: 'Send link',
      }).then((ok) => ok && run(() => apiSend('POST', `${loginPath(user.id)}/reset-password`, {}), `Reset link sent to ${user.email}.`))
    }
    if (verb === 'unlink') {
      return confirmation.ask({
        title: `Take ${user.email} off ${account.company_name}?`,
        body: 'The login keeps working; it just no longer belongs to this company, so it sees none of its history.',
        confirmLabel: 'Unlink',
      }).then((ok) => ok && run(() => apiDelete(unlinkPath(account.id, user.id)), `${user.email} unlinked.`))
    }
    return null
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>Portal logins</span>
        <GhostButton disabled={busy} onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : 'Add login'}</GhostButton>
      </div>

      {created && (
        <div style={{ padding: '12px 14px', marginBottom: 10, border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper }}>
          <div style={{ fontSize: 13, color: c.ink }}>
            {created.email} created.
            {created.tempPassword ? ' Give them this temporary password — it is not shown again:' : ' They sign in with the password you set.'}
          </div>
          {created.tempPassword && <div style={{ marginTop: 6, fontFamily: font.mono, fontSize: 14, color: c.accent }}>{created.tempPassword}</div>}
          <div style={{ marginTop: 10 }}><GhostButton onClick={() => setCreated(null)}>Done</GhostButton></div>
        </div>
      )}

      {adding && (
        <NewLoginForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={async (values) => {
            let response = null
            const ok = await run(async () => { response = await apiSend('POST', '/admin/users', newLoginBody(account.id, values)) })
            if (!ok) return
            setAdding(false)
            setCreated({ email: response.user.email, tempPassword: response.temp_password ?? null })
          }}
        />
      )}

      {users.length === 0 && !adding && (
        <div style={{ ...mutedText, fontStyle: 'italic' }}>No portal login on this company yet.</div>
      )}

      {users.map((user) => {
        const open = openId === user.id
        const state = loginState(user)
        const actions = loginActions(user)
        return (
          <div key={user.id} style={{ borderTop: `1px solid ${c.line}`, padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>{user.name || '—'}{actions.archived && <ArchivedTag />}</span>
                <span style={{ ...monoText, display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}{user.phone ? ` · ${user.phone}` : ''}</span>
                <span style={{ ...mutedText, display: 'block', fontSize: 11.5 }}>{roleLabel(user.role)} · added {dateOnly(user.created_at)}</span>
              </span>
              <StatusPill tone={state.tone}>{state.label}</StatusPill>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {actions.approve && <GhostButton tone="accent" disabled={busy} onClick={() => decide(user, 'approve')}>Approve</GhostButton>}
                {actions.decline && <GhostButton disabled={busy} onClick={() => decide(user, 'decline')}>Decline</GhostButton>}
                <GhostButton disabled={busy} aria-expanded={open} onClick={() => setOpenId(open ? null : user.id)}>{open ? 'Close' : 'Edit'}</GhostButton>
                {!actions.decline && <GhostButton disabled={busy} onClick={() => decide(user, actions.archivePath)}>{actions.archiveLabel}</GhostButton>}
                {!actions.archived && <GhostButton disabled={busy} onClick={() => decide(user, 'reset')}>Email reset link</GhostButton>}
                <GhostButton disabled={busy} onClick={() => decide(user, 'unlink')}>Unlink</GhostButton>
              </span>
            </div>
            {open && (
              <div style={{ marginTop: 12 }}>
                <LoginEditor
                  user={user}
                  busy={busy}
                  onSave={async (patch) => {
                    const ok = await run(() => apiSend('PATCH', loginPath(user.id), patch), `${user.email} saved.`)
                    if (ok) setOpenId(null)
                  }}
                />
                {/* Their orders, whichever door they came in by — including any
                    placed as a guest under this email before they had a login. */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: c.ink, marginBottom: 8 }}>Order history</div>
                  <CustomerOrders email={user.email} limit={8} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

// Edit sends only the changed keys (diffFields). The approval tick reads the
// DRAFT's role, so promoting to trade and approving is one save.
function LoginEditor({ user, busy, onSave }) {
  const [draft, setDraft] = useState(() => draftFrom(user, LOGIN_FIELDS))
  const [error, setError] = useState('')
  const set = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const { canApprove } = loginActions(user, draft)

  const submit = (event) => {
    event.preventDefault()
    const result = diffFields(user, draft, LOGIN_FIELDS)
    if (result.error) return setError(result.error)
    if (Object.keys(result.patch).length === 0) return setError('Nothing has changed.')
    setError('')
    onSave(result.patch)
  }

  return (
    <form onSubmit={submit} style={{ padding: '14px 16px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <Field label="Name"><input value={draft.name ?? ''} disabled={busy} onChange={set('name')} style={inputStyle} /></Field>
        <Field label="Email" hint="What they sign in with."><input value={draft.email ?? ''} type="email" disabled={busy} onChange={set('email')} style={inputStyle} /></Field>
        <Field label="Phone"><input value={draft.phone ?? ''} type="tel" disabled={busy} onChange={set('phone')} style={inputStyle} /></Field>
        <Field label="Role">
          <Select value={draft.role ?? ''} disabled={busy} onChange={set('role')} style={inputStyle} aria-label={`Role for ${user.email}`}>
            {CLIENT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <CheckField
          label="Trade approved — sees trade pricing and the represented houses"
          checked={Boolean(draft.trade_approved)}
          disabled={busy || !canApprove}
          onChange={(e) => setDraft((d) => ({ ...d, trade_approved: e.target.checked }))}
        />
        <GhostButton type="submit" tone="accent" disabled={busy}>Save login</GhostButton>
      </div>
      {!canApprove && <div style={{ ...mutedText, fontSize: 11.5, marginTop: 8 }}>Trade approval applies to trade logins. Set the role to Trade and this unlocks — role and approval save together.</div>}
      {error && <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>}
    </form>
  )
}

function NewLoginForm({ busy, onCancel, onSave }) {
  const [draft, setDraft] = useState(NEW_LOGIN)
  const [error, setError] = useState('')
  const set = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  const submit = (event) => {
    event.preventDefault()
    const result = bodyFrom(draft, NEW_LOGIN_FIELDS)
    if (result.error) return setError(result.error)
    setError('')
    onSave(result.body)
  }

  return (
    <form onSubmit={submit} style={{ padding: '14px 16px', marginBottom: 10, border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <Field label="Name"><input value={draft.name} disabled={busy} onChange={set('name')} style={inputStyle} /></Field>
        <Field label="Email" hint="What they sign in with. Stored lower-case."><input value={draft.email} type="email" disabled={busy} onChange={set('email')} style={inputStyle} /></Field>
        <Field label="Role" hint="A trade login still needs approving before trade pricing shows.">
          <Select value={draft.role} disabled={busy} onChange={set('role')} style={inputStyle}>
            {CLIENT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </Select>
        </Field>
      </div>
      {error && <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <GhostButton type="submit" tone="accent" disabled={busy}>Add login</GhostButton>
        <GhostButton onClick={onCancel} disabled={busy}>Cancel</GhostButton>
        <span style={{ ...mutedText, fontSize: 11.5 }}>Created with a temporary password; the person changes it on first sign-in.</span>
      </div>
    </form>
  )
}
