// User management — real platform accounts, wired to atelier-api's /admin/users
// (native CRUD, unlike the read-only Dynamics screens). Staff can create logins,
// change a role, approve a trade application, and archive (soft-delete) an
// account. The API's requireRole('backoffice') is the real gate; it also enforces
// the self-protection rules (you can't change your own role or archive yourself),
// surfaced here as inline errors.

import { useState, useRef, useEffect, useCallback } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill, Toast, PrimaryButton } from '../components/ui.jsx'
import { SectionTabs, usersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend, ApiError } from '../lib/api.js'

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

const EMPTY = { name: '', email: '', role: 'customer' }

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const tRef = useRef()

  const flash = (msg) => {
    setToast(msg)
    clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(null), 3600)
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const body = await apiFetch(`/admin/users${showArchived ? '?include_archived=true' : ''}`)
      setUsers(body.users ?? [])
      setStatus('ready')
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load users.')
      setStatus('error')
    }
  }, [showArchived])

  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email.trim()) return setError('An email is required.')
    try {
      const body = await apiSend('POST', '/admin/users', {
        email: form.email.trim(),
        name: form.name.trim() || null,
        role: form.role,
      })
      setForm(EMPTY)
      flash(
        body.temp_password
          ? `${body.user.email} created — temp password ${body.temp_password}.`
          : `${body.user.email} created.`
      )
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account.')
    }
  }

  // Patch a single field, reconciling the returned row into the list.
  const patch = async (u, body, note) => {
    setError('')
    try {
      const res = await apiSend('PATCH', `/admin/users/${u.id}`, body)
      setUsers((list) => list.map((x) => (x.id === u.id ? res.user : x)))
      if (note) flash(note)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That change could not be saved.')
      load() // revert the control to server truth
    }
  }

  const archive = async (u) => {
    const archived = Boolean(u.archived_at)
    if (!archived && typeof window !== 'undefined' && !window.confirm(`Archive ${u.email}? You can restore it later.`)) return
    setError('')
    try {
      const res = await apiSend('POST', `/admin/users/${u.id}/${archived ? 'restore' : 'archive'}`, {})
      flash(archived ? `${res.user.email} restored.` : `${res.user.email} archived.`)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That change could not be saved.')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={<>Users &amp; permissions</>}
        subtitle="Create logins, set roles, approve trade accounts and archive accounts. Enforced server-side."
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
        }
      />
      <SectionTabs tabs={usersTabs} active="accounts" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 28, marginTop: 28, maxWidth: 1000 }}>
        {/* Add a user */}
        <section style={panel}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.line}` }}>
            <span style={sectionLabel}>Add an account</span>
          </div>
          <form onSubmit={submit} style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="r-grid-2">
              <Field label="Name"><input value={form.name} onChange={set('name')} style={inputStyle} placeholder="e.g. Priya" /></Field>
              <Field label="Email"><input value={form.email} onChange={set('email')} type="email" style={inputStyle} placeholder="priya@ateliertextiles.co.nz" /></Field>
              <Field label="Role">
                <select value={form.role} onChange={set('role')} style={inputStyle}>
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
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{users.length} shown</span>
          </div>

          {status === 'loading' && <div style={{ padding: '16px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading accounts…</div>}
          {status === 'error' && <div role="alert" style={{ padding: '16px 20px', fontSize: 12.5, color: c.clay }}>{loadError}</div>}

          {status === 'ready' && users.map((u) => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 120px', gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}`, opacity: u.archived_at ? 0.55 : 1 }}>
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
                <select value={u.role} onChange={(e) => patch(u, { role: e.target.value }, `${u.email} is now ${roleLabel(e.target.value)}.`)} style={{ ...inputStyle, height: 36, fontSize: 13 }} aria-label={`Role for ${u.email}`}>
                  {API_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                {u.role === 'trade' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: c.inkSoft, cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(u.trade_approved)} onChange={(e) => patch(u, { trade_approved: e.target.checked }, `${u.email} trade ${e.target.checked ? 'approved' : 'unapproved'}.`)} /> Trade approved
                  </label>
                ) : (
                  <StatusPill tone="muted">{u.trade_approved ? 'Trade ✓' : '—'}</StatusPill>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <button type="button" onClick={() => archive(u)} className="ab-t"
                  style={{ background: 'none', border: `1px solid ${c.line}`, borderRadius: 4, padding: '7px 12px', cursor: 'pointer', fontFamily: font.ui, fontSize: 12, color: u.archived_at ? c.ink : c.clay }}>
                  {u.archived_at ? 'Restore' : 'Archive'}
                </button>
              </div>
            </div>
          ))}

          {status === 'ready' && users.length === 0 && (
            <div style={{ padding: '16px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No accounts yet.</div>
          )}
        </section>
      </div>

      {toast && (
        <Toast>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.sage }} />
          {toast}
        </Toast>
      )}
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
