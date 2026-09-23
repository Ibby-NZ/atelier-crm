// Add contact — a new person on their own page (23 Sep 2026, the client's
// "every data entry on its own page"). The form used to drop down above the
// address book on /clients/contacts.
//
//   POST /admin/contacts { name, role, email, phone, company_name, note } → { contact } (201)
//
// A person is added unfiled, with the company as text, exactly as the drop-down
// did it; filing them under an account is the picker on their page, which
// sends `trade_account_id` on its own because the API clears the text company
// itself. The form is <ContactForm>, the one the contact's page edits with.
//
// On a 201 the office lands on the new contact's page — replacing this one in
// history, so Back does not reopen an empty form that reads as "it did not
// save" — and files them from there.

import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { ErrorLine, PanelHead, ToastLine, panel, useMutation, useToast } from '../admin/parts.jsx'
import ContactForm from './ContactForm.jsx'
import { CONTACTS_PATH, CONTACTS_ROUTE, contactRoute } from './contacts.js'

export default function ContactNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this screen, so nothing to reload: a lone useMutation is the
  // kit's shape for a form that only writes.
  const { busy, error, run } = useMutation({ flash })

  const create = async (values) => {
    let created = null
    const ok = await run(async () => {
      created = (await apiSend('POST', CONTACTS_PATH, values)).contact
    }, `${values.name} added.`)
    if (ok && created) navigate(contactRoute(created.id), { replace: true })
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={
          <>
            <Link to={CONTACTS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Back to contacts
            </Link>
            {' · live'}
          </>
        }
        title="Add contact"
        subtitle="A person the office knows. They are added unfiled; file them under their company's account on their page."
      />
      {error && <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>}

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="The person" />
        <div style={{ padding: '20px 20px 26px' }}>
          <ContactForm
            record={{}}
            busy={busy}
            submitLabel="Add contact"
            onCancel={() => navigate(CONTACTS_ROUTE)}
            onSave={create}
          />
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
