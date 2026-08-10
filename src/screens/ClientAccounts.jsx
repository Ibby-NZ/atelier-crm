// Trade accounts — the LIVE platform accounts of the people who buy, wired to
// atelier-api's /admin/users with `segment=clients` (role customer or trade).
// Unlike the Clients tab beside it (a read-only Dynamics mirror until cutover)
// this screen writes: staff add an account, fix a name/email/role, tick trade
// approval, and archive or restore.
//
//   GET    /admin/users?segment=clients&role=&q=&include_archived=  → { users }
//   POST   /admin/users                    → { user, temp_password? }   (201)
//   PATCH  /admin/users/:id                → { user }
//   POST   /admin/users/:id/archive|restore → { user }
//   DELETE /admin/users/:id                → { deleted } | 409 { blockers }
//
// Three rules the form respects, all enforced server-side:
//   - **Archive is the removal that keeps the record; Delete is refused the
//     moment there is a record to keep.** Every FK out of `users` is SET NULL or
//     CASCADE and not one is RESTRICT, so a bare delete would report success
//     while anonymising a client's whole order history into guest orders with no
//     address on them. The API probes first and refuses with the counts, which is
//     why the 409 keeps the dialog open and offers Archive instead.
//   - A duplicate email is a 409, detected by the database rather than
//     pre-checked. It lands inline through the API's own sentence.
//   - The API refuses a few self-edits (your own role, archiving yourself) with
//     a 422. Those arrive as inline errors too — the screen does not try to
//     predict them, because the caller identity lives on the server.
//
// Why the roster is split at all: /users (Users & permissions) is the superset
// admin view including staff logins; this screen is the client half, which is
// what the office actually works in day to day. `segment=clients` is the only
// difference in the request.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { UNPAGED_LIST_LIMIT, describeAccount } from './adminLists.js'
import {
  ArchivedTag,
  CheckField,
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'
import {
  CLIENT_ROLES,
  accountState,
  clientAccountsFilters,
  roleLabel,
  rowActions,
} from './clientAccounts.js'

// One declaration per column, read by draftFrom / diffFields / bodyFrom so the
// form cannot format a value one way and parse it another.
//
// `email` is required in BOTH directions: the API's PATCH schema types it as a
// plain string (unlike `name`, which is nullable), because an account with no
// address could never sign in again.
const ACCOUNT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text', required: true },
  { key: 'role', label: 'Role', kind: 'enum', required: true },
  { key: 'trade_approved', label: 'Trade approved', kind: 'bool' },
])

// Create takes no trade_approved: a brand-new trade account starts unapproved,
// exactly as a self-serve application does, and is approved deliberately after.
const CREATE_FIELDS = Object.freeze(ACCOUNT_FIELDS.filter((f) => f.key !== 'trade_approved'))

const NEW_ACCOUNT = Object.freeze({ name: '', email: '', role: 'customer' })

const COLUMNS = '1.5fr 1.4fr 120px 140px 215px'

const dateOnly = (value) => String(value ?? '').slice(0, 10) || '—'

export default function ClientAccounts() {
  const [role, setRole] = useState('') // '' = all
  const [term, setTerm] = useState('') // committed search term
  const [draftTerm, setDraftTerm] = useState('') // input value
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [accountDraft, setAccountDraft] = useState({})
  const [newAccount, setNewAccount] = useState(NEW_ACCOUNT)
  const [showNewAccount, setShowNewAccount] = useState(false)
  // The temp password is shown ONCE, by the API, in the create response. A toast
  // clears itself after a few seconds, which is exactly the wrong lifetime for a
  // credential someone has to write down — so it gets its own notice that stays
  // until it is dismissed.
  const [created, setCreated] = useState(null)

  // The list, the toast, the mutate-then-reload cycle and the delete flow in
  // one. Reload rather than reconcile locally: the API owns created_at, the
  // lower-cased email and the archived flag. `archive` is what puts "Archive
  // instead" on a refusal — and for a client account that refusal is the common
  // case, because orders, trade applications and enquiries all block.
  const crud = useCrudScreen({
    path: '/admin/users',
    key: 'users',
    limit: UNPAGED_LIST_LIMIT,
    filters: clientAccountsFilters({ role, term, showArchived }),
    entity: 'account',
    describe: describeAccount,
    archive: (user) => apiSend('POST', `/admin/users/${user.id}/archive`, {}),
  })
  const users = crud.list.rows
  const { message, flash } = crud.toast
  const { busy, error, setError, run } = crud.mutation

  // Keep the open editor's draft in step with a reloaded row, so a saved value
  // is not immediately overwritten by a stale draft on the next keystroke.
  useEffect(() => {
    if (openId == null) return
    const user = users.find((u) => u.id === openId)
    if (!user) {
      setOpenId(null)
      return
    }
    setAccountDraft(draftFrom(user, ACCOUNT_FIELDS))
  }, [openId, users])

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const toggle = (user) => {
    setError('')
    setOpenId((current) => (current === user.id ? null : user.id))
  }

  const createAccount = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newAccount, CREATE_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(async () => {
      const res = await apiSend('POST', '/admin/users', built.body)
      setCreated({ email: res.user.email, tempPassword: res.temp_password ?? null })
      return res
    }, (res) => `${res.user.email} created.`)
    if (ok) {
      setNewAccount(NEW_ACCOUNT)
      setShowNewAccount(false)
    }
  }

  const saveAccount = (user) => {
    const diff = diffFields(user, accountDraft, ACCOUNT_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    run(() => apiSend('PATCH', `/admin/users/${user.id}`, diff.patch), 'Account saved.')
  }

  // Archiving is reversible, so it asks once and offers Restore afterwards
  // rather than warning about permanence it does not have.
  const archiveAccount = (user) => {
    const { archived, archivePath } = rowActions(user)
    if (
      !archived &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Archive ${user.email}? They can no longer sign in, their orders stay intact, and you can restore the account later.`
      )
    ) {
      return
    }
    run(
      () => apiSend('POST', `/admin/users/${user.id}/${archivePath}`, {}),
      archived ? `${user.email} restored.` : `${user.email} archived.`
    )
  }

  const setNew = (key) => (event) => setNewAccount((n) => ({ ...n, [key]: event.target.value }))
  const setDraft = (key) => (event) => setAccountDraft((d) => ({ ...d, [key]: event.target.value }))

  return (
    <div>
      <PageHeader
        eyebrow="Clients · live"
        title={<>Trade accounts</>}
        subtitle="The platform's own customer and trade logins — who can sign in to the website, and who sees trade pricing. Approving trade here is the same switch the Applicants tab flips."
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{' '}
            Show archived
          </label>
        }
      />
      <SectionTabs tabs={clientsTabs} active="accounts" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30, maxWidth: 1080 }}>
        <section style={panel}>
          <PanelHead
            label="Add an account"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNewAccount((open) => !open)
                  setError('')
                }}
              >
                {showNewAccount ? 'Cancel' : 'New account'}
              </GhostButton>
            }
          />

          {/* Shown once, and only once: the API returns the temp password in the
              create response and never again. It stays until dismissed. */}
          {created && (
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.line}`, background: c.surface }}>
              <div style={{ fontSize: 13, color: c.ink }}>
                {created.email} created.
                {created.tempPassword ? ' Give them this temporary password — it is not shown again:' : ' They sign in with the password you set.'}
              </div>
              {created.tempPassword && (
                <div style={{ marginTop: 8, fontFamily: font.mono, fontSize: 14, color: c.accent }}>
                  {created.tempPassword}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <GhostButton onClick={() => setCreated(null)}>Done</GhostButton>
              </div>
            </div>
          )}

          {showNewAccount && (
            <form onSubmit={createAccount} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="r-grid-2">
                <Field label="Name">
                  <input
                    value={newAccount.name}
                    disabled={busy}
                    onChange={setNew('name')}
                    style={inputStyle}
                    placeholder="e.g. Marlow and Finch Interiors"
                  />
                </Field>
                <Field label="Email" hint="What they sign in with. Stored lower-case.">
                  <input
                    value={newAccount.email}
                    type="email"
                    disabled={busy}
                    onChange={setNew('email')}
                    style={inputStyle}
                    placeholder="studio@marlowfinch.co.nz"
                  />
                </Field>
                <Field label="Role" hint="Trade accounts still need approving before trade pricing shows.">
                  <select value={newAccount.role} disabled={busy} onChange={setNew('role')} style={inputStyle}>
                    {CLIENT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Add account
                </GhostButton>
                <span style={{ ...mutedText, fontSize: 11.5 }}>
                  Created with a temporary password; the person changes it on first sign-in.
                </span>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Client accounts"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {crud.list.total} shown
              </span>
            }
          />

          <form
            onSubmit={search}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}
          >
            <input
              value={draftTerm}
              onChange={(e) => setDraftTerm(e.target.value)}
              placeholder="Name or email"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 240 }}
              aria-label="Search client accounts"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Filter by role"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 'auto' }}
            >
              <option value="">All roles</option>
              {CLIENT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <GhostButton type="submit" disabled={busy}>
              Search
            </GhostButton>
          </form>

          {!showNewAccount && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
          {crud.list.status === 'loading' && <PanelNote>Loading client accounts…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && users.length === 0 && (
            <PanelNote>No client accounts match those filters.</PanelNote>
          )}

          {crud.list.status === 'ready' && users.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['Account', 'Email', 'Role', 'State', '']}
              />
              {users.map((user) => {
                const open = openId === user.id
                const state = accountState(user)
                // The open editor's draft decides whether the approval tick is
                // live, so a promotion + approval is ONE save. See rowActions.
                const { archived, archiveLabel, canApprove } = rowActions(
                  user,
                  open ? accountDraft : {}
                )
                return (
                  <div key={user.id}>
                    <Row columns={COLUMNS} archived={archived}>
                      <button
                        type="button"
                        onClick={() => toggle(user)}
                        aria-expanded={open}
                        className="ab-t"
                        style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                          {user.name || '—'}
                          {archived && <ArchivedTag />}
                        </span>
                        <span style={{ display: 'block', ...mutedText, fontSize: 11.5, marginTop: 2 }}>
                          Added {dateOnly(user.created_at)}
                        </span>
                      </button>
                      <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.email}
                      </span>
                      <span style={mutedText}>{roleLabel(user.role)}</span>
                      <span>
                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                      </span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <GhostButton disabled={busy} onClick={() => toggle(user)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
                        {/* Neutral, not danger: with a real Delete beside it,
                            drawing the reversible verb red would say the two
                            are equally grave. */}
                        <GhostButton disabled={busy} onClick={() => archiveAccount(user)}>
                          {archiveLabel}
                        </GhostButton>
                        <GhostButton
                          disabled={busy}
                          tone="danger"
                          onClick={() => crud.remove.ask(user)}
                        >
                          Delete
                        </GhostButton>
                      </span>
                    </Row>

                    {open && (
                      <div style={{ padding: '20px 20px 24px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="r-grid-2">
                          <Field label="Name">
                            <input
                              value={accountDraft.name ?? ''}
                              disabled={busy}
                              onChange={setDraft('name')}
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Email" hint="Changing it changes what they sign in with.">
                            <input
                              value={accountDraft.email ?? ''}
                              type="email"
                              disabled={busy}
                              onChange={setDraft('email')}
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Role">
                            <select
                              value={accountDraft.role ?? ''}
                              disabled={busy}
                              onChange={setDraft('role')}
                              style={inputStyle}
                              aria-label={`Role for ${user.email}`}
                            >
                              {/* Only the two client roles: promoting someone to
                                  staff is a Users & permissions decision, and
                                  segment=clients means no staff row is ever
                                  listed here to promote by accident. */}
                              {CLIENT_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {roleLabel(r)}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          <CheckField
                            label="Trade approved — sees trade pricing and the represented houses"
                            checked={accountDraft.trade_approved}
                            disabled={busy || !canApprove}
                            onChange={(e) =>
                              setAccountDraft((d) => ({ ...d, trade_approved: e.target.checked }))
                            }
                          />
                          <GhostButton tone="accent" disabled={busy} onClick={() => saveAccount(user)}>
                            Save account
                          </GhostButton>
                        </div>
                        {!canApprove && (
                          <div style={{ ...mutedText, fontSize: 11.5, marginTop: 10 }}>
                            Trade approval applies to trade accounts. Set the role to Trade above
                            and this unlocks — role and approval save together.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
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
