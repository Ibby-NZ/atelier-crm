// New account — raising a company on its own page (23 Sep 2026, the client's
// "every data entry on its own page"). It used to drop down above the roster
// on /clients/accounts, where the form and the list fought for the same screen.
//
//   POST /admin/trade-accounts { company_name, …details } → { trade_account } (201)
//
// This is the API's hand-raised branch: a company that is in no Dynamics
// export (the other branch, a `legacy_account_guid`, is the contact book's
// "Enable contacts" link and never starts here). It takes the name and the
// details the office took down — no Xero id or account manager yet
// (NEW_ACCOUNT_FIELDS) — and grants no login anything; logins are added on the
// company's page once it exists.
//
// The form is <AccountForm>, the same component the company's page edits
// with, so raising and correcting cannot drift. On a 201 the office lands on
// the new company's page — replacing this one in history, so Back does not
// reopen an empty form that reads as "it did not save".

import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { ErrorLine, PanelHead, ToastLine, panel, useMutation, useToast } from '../admin/parts.jsx'
import AccountForm from './AccountForm.jsx'
import { COMPANIES_PATH, TRADE_ACCOUNTS_PATH, companyRoute } from './clientCompanies.js'

export default function ClientCompanyNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this screen, so nothing to reload: a lone useMutation is the
  // kit's shape for a form that only writes.
  const { busy, error, run } = useMutation({ flash })

  const create = async (body) => {
    let created = null
    const ok = await run(async () => {
      created = (await apiSend('POST', TRADE_ACCOUNTS_PATH, body)).trade_account
    }, `${body.company_name} added.`)
    if (ok && created) navigate(companyRoute(created.id), { replace: true })
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={
          <>
            <Link to={COMPANIES_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Back to accounts
            </Link>
            {' · live'}
          </>
        }
        title="New account"
        subtitle="A company raised by hand — one that is in no Dynamics export. Portal logins and contacts are added on its page once it exists."
      />
      {error && <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>}

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="The company" />
        <div style={{ padding: '20px 20px 26px' }}>
          <AccountForm
            account={{}}
            busy={busy}
            submitLabel="Add account"
            onCancel={() => navigate(COMPANIES_PATH)}
            onSave={create}
          />
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
