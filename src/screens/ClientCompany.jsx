// One company on its own page (23 Sep 2026, client asked: "for any kind of
// data entry … they will open in their own individual page instead of a tabbed
// drop down"). This block used to open INSIDE the row on /clients/accounts, and
// the details form, the logins, the thirty-field application and the contact
// book under it pushed the rest of the roster off the screen. The same move the
// sales order and the supplier made: the list is the list, the company is the
// desk.
//
//   GET   /admin/trade-accounts/:id   → { trade_account, trade_review }  the row's
//                                        shape plus contacts, d365_people and
//                                        coverage; trade_review names who takes
//                                        each approval step
//   PATCH /admin/trade-accounts/:id   → { trade_account }
//   POST  /admin/trade-accounts/:id/archive|restore → { trade_account, xero_contact }
//         the client cancelled: company, logins and Xero contact archived
//   POST  /admin/trade-accounts/:id/xero-contact    → { trade_account }  Add to Xero
//   GET   /admin/users?segment=staff  → the account-owner dropdown
//
// The detail read carries everything the expansion read off the list row —
// `users[]` in the full editable shape (phone, archived_at, created_at),
// `trade_application_id`, `legacy_account_guid`, the nested account manager —
// so the page needs no second source. It is also the mutation's reload: a
// login approved, declined, unlinked or added, an application form deleted, a
// detail saved, all re-read this one company rather than a page of fifty.
//
// What it holds, in the order the expansion had it: the details (an EDITOR for
// every CRM login — the director gate on the detail PATCH went on 22 Sep 2026 —
// with the company NAME greyed on a Dynamics-linked row because the API 422s
// that rename, `canRename`), the portal logins (<AccountLogins>, edited in
// place — they are sub-records and keep their small inline editors here), the
// trade application that raised it when there is one, the contact book (the
// same <TradeContactsPanel> /clients/:id carries), and the Dynamics record in
// the Archive.
//
// Rules live in ./clientCompanies.js, tested; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import TradeContactsPanel from '../components/TradeContactsPanel.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useConfirmation } from '../admin/useConfirmation.js'
import { apiFetch, apiSend, safeFetch } from '../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  ArchivedTag,
  ErrorLine,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  messageOf,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import AccountForm from './AccountForm.jsx'
import AccountLogins from './AccountLogins.jsx'
import AccountApplication from './AccountApplication.jsx'
import { staffOptions } from './adminOrders.js'
import {
  COMPANIES_PATH,
  accountMeta,
  accountPath,
  archivePath,
  loginsLine,
  ownerOptions,
  reviewRights,
  xeroContactUrl,
  xeroNote,
} from './clientCompanies.js'

export default function ClientCompany() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()
  const confirmation = useConfirmation()

  const [account, setAccount] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [staff, setStaff] = useState([])
  const [review, setReview] = useState(null)
  const { user: me } = useAuth()

  // The account-owner dropdown; a failed read just leaves it with nobody to pick.
  useEffect(() => {
    let active = true
    safeFetch('/admin/users?segment=staff&limit=100').then(({ data }) => {
      if (active && data) setStaff(staffOptions(data.users ?? []))
    })
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(async () => {
    const body = await apiFetch(accountPath(id))
    setAccount(body.trade_account ?? null)
    setReview(body.trade_review ?? null)
    return body.trade_account ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for the list reload.
  // AccountLogins and AccountApplication take it as a prop, exactly as they did
  // inside the row, so every verb they own reloads this company.
  const mutation = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this account.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  const backLink = (
    <>
      <Link to={COMPANIES_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to accounts
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Account not found"
        backTo={COMPANIES_PATH}
        backLabel="Back to accounts"
        message="That account could not be found — the link may be out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Account" />
        <PanelNote>Loading account…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Account" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!account) return null

  const login = loginsLine(account)
  const archive = archivePath(account)
  const save = (patch) =>
    mutation.run(() => apiSend('PATCH', accountPath(account.id), patch), `${account.company_name} saved.`)
  const addToXero = () =>
    mutation.run(() => apiSend('POST', `${accountPath(account.id)}/xero-contact`, {}), `${account.company_name} added to Xero.`)
  const withXero = (message) => (body) => [message, xeroNote(body?.xero_contact)].filter(Boolean).join(' ')
  const cancelAccount = async () => {
    const ok = await confirmation.ask({
      title: `Cancel ${account.company_name}'s account?`,
      body: 'The account and every login on it are archived — nobody there can sign in or see trade pricing — and its Xero contact is archived too. Restore brings the account back; logins are restored one by one.',
      confirmLabel: 'Archive account',
      confirmTone: 'danger',
    })
    if (ok) mutation.run(() => apiSend('POST', `${accountPath(account.id)}/archive`, {}), withXero(`${account.company_name} archived.`))
  }
  const restoreAccount = () =>
    mutation.run(() => apiSend('POST', `${accountPath(account.id)}/restore`, {}), withXero(`${account.company_name} restored.`))

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {account.company_name}
            {account.name_is_ambiguous && <span title="Another account shares this name" style={{ marginLeft: 8, color: c.clay }}>●</span>}
            {account.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={accountMeta(account)}
        right={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusPill tone={login.tone}>{login.label}</StatusPill>
            {account.archived_at
              ? <GhostButton disabled={mutation.busy} onClick={restoreAccount}>Restore account</GhostButton>
              : <GhostButton tone="danger" disabled={mutation.busy} onClick={cancelAccount}>Cancel account</GhostButton>}
          </span>
        }
      />
      {/* One error line for every verb on the page — the details, the logins
          and the application all share the mutation, as they did in the row. */}
      {mutation.error && <ErrorLine style={{ marginTop: 14 }}>{mutation.error}</ErrorLine>}

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Account" />
        <div style={{ padding: '20px 20px 26px' }}>
          {/* Keyed on updated_at so a saved detail re-seeds the form from server
              truth (the API trims and lower-cases the email). A login verb does
              not touch the company row, so typing here survives one. */}
          <AccountForm
            key={account.updated_at ?? account.id}
            account={account}
            owners={ownerOptions(staff, account)}
            busy={mutation.busy}
            submitLabel="Save details"
            onSave={save}
          />
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, color: c.inkSoft }}>
            {account.xero_contact_id
              ? <a href={xeroContactUrl(account.xero_contact_id)} target="_blank" rel="noreferrer" className="ab-link" style={{ color: c.ink }}>Open the Xero contact →</a>
              : <>
                  <span>Not in Xero yet.</span>
                  {!account.archived_at && <GhostButton disabled={mutation.busy} onClick={addToXero}>Add to Xero</GhostButton>}
                </>}
          </div>
          <div style={{ marginTop: 24 }}>
            <AccountLogins account={account} mutation={mutation} confirmation={confirmation} rights={reviewRights(review, me)} />
          </div>
          {account.trade_application_id && (
            <div style={{ marginTop: 24 }}>
              <AccountApplication account={account} mutation={mutation} confirmation={confirmation} />
            </div>
          )}
          <div style={{ marginTop: 24 }}>
            <TradeContactsPanel guid={account.legacy_account_guid} accountId={account.id} />
          </div>
          {archive && (
            <div style={{ marginTop: 18 }}>
              <Link to={archive} style={{ fontSize: 12, color: c.muted }}>Dynamics record in Archive →</Link>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={toast} />
    </div>
  )
}
