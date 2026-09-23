// One contact on its own page (23 Sep 2026, client asked: "for any kind of
// data entry … they will open in their own individual page instead of a tabbed
// drop down"). The editor used to open INSIDE the row on /clients/contacts,
// between one person and the next, in a list of 2,662.
//
//   GET   /admin/contacts/:id   → { contact }   the list row's shape
//   PATCH /admin/contacts/:id   → { contact }   fields, or trade_account_id to file / unfile
//
// The detail read is the list row's projection exactly (the account's name as
// `company`, D365's text as `company_name`, the account number), so nothing
// the row editor read is missing here. It is also the mutation's reload:
// filing a contact under an account changes which company box the form draws,
// and re-reading is what makes that true.
//
// What it holds, in the order the row had it: "Filed under" (the same
// <TradeAccountPicker> the sample register uses, sending `{ trade_account_id }`
// on its own — `fileUnderBody` — because the API clears the text company
// itself), then the form (<ContactForm>, shared with the create page). A filed
// contact's company in the header opens its account's page.
//
// Delete stays on the list: it is the kit's flow, bound to a list it can
// reload, and a contact that is gone has no page to stay on.
//
// Rules live in ./contacts.js, tested; this file is layout.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import TradeAccountPicker from '../admin/TradeAccountPicker.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import {
  ErrorLine,
  PanelHead,
  PanelNote,
  ToastLine,
  messageOf,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import ContactForm from './ContactForm.jsx'
import { CONTACTS_ROUTE, companyCell, companyHref, contactPath, fileUnderBody } from './contacts.js'

export default function Contact() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [contact, setContact] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    const body = await apiFetch(contactPath(id))
    setContact(body.contact ?? null)
    return body.contact ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for the list reload.
  const { busy, error, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this contact.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  const backLink = (
    <>
      <Link to={CONTACTS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to contacts
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Contact not found"
        backTo={CONTACTS_ROUTE}
        backLabel="Back to contacts"
        message="That contact could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Contact" />
        <PanelNote>Loading contact…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Contact" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!contact) return null

  const company = companyCell(contact)
  const href = companyHref(contact)
  const file = (accountId) =>
    run(
      () => apiSend('PATCH', contactPath(contact.id), fileUnderBody(accountId)),
      accountId == null ? `${contact.name} unfiled.` : `${contact.name} filed.`
    )
  const save = (patch) => run(() => apiSend('PATCH', contactPath(contact.id), patch), `${contact.name} saved.`)

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={contact.name}
        subtitle={
          <>
            {contact.role && <>{contact.role} · </>}
            {href
              ? <Link to={href} className="ab-link" style={{ color: c.accent, textDecoration: 'none' }}>{company.text}</Link>
              : company.text}
          </>
        }
        right={!company.filed && <StatusPill tone="clay">not filed</StatusPill>}
      />
      {error && <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>}

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Contact" />
        <div style={{ padding: '6px 20px 26px' }}>
          <FileUnder contact={contact} busy={busy} onFile={file} />
          {/* Keyed on updated_at so every reload re-seeds the form from server
              truth — filing drops the free-text company box, and the API folds
              blanks and trims. */}
          <ContactForm key={contact.updated_at ?? contact.id} record={contact} busy={busy} submitLabel="Save" onSave={save} />
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// Which company this person belongs to. The picker is the same one the sample
// register uses. Clearing it unfiles them; the body carries no company text,
// so the API leaves none behind (it only keeps what an unfile sends).
function FileUnder({ contact, busy, onFile }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '14px 0' }}>
      <div style={{ flex: '1 1 320px' }}>
        <TradeAccountPicker
          label="Filed under"
          value={contact.trade_account_id ? { id: contact.trade_account_id, name: contact.company } : null}
          disabled={busy}
          onPick={(option) => onFile(option.id)}
          onClear={() => onFile(null)}
        />
      </div>
    </div>
  )
}
