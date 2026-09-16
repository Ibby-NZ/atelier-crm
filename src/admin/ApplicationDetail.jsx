// The submitted trade application, laid out as the paper form's sections. One
// renderer for the two places the office reads it: the Applicants queue (while
// the account is under review) and the client's own row on Clients (after —
// 16 Sep 2026: "trade customers should have ALL of their details that were
// inputted in the trade form visible to admin"). A third rendering of these
// rows is the thing to look for.

import { c } from '../theme.js'
import { sectionLabel } from './parts.jsx'

const BUSINESS_TYPE_LABELS = {
  limited_liability_company: 'Limited Liability Company',
  sole_trader: 'Sole Trader',
  partnership: 'Partnership',
}
const yesNo = (v) => (v ? 'Yes' : 'No')
const dash = (v) => (v && String(v).trim() ? v : '—')

// Display layout mirroring the paper form's sections.
export const FORM_SECTIONS = [
  {
    title: 'Customer details',
    rows: [
      ['Business name', (a) => dash(a.business_name)],
      ['Registered name (if different)', (a) => dash(a.registered_name)],
      ['Postal address', (a) => dash(a.postal_address)],
      ['Delivery address', (a) => dash(a.delivery_address)],
      ['Landline phone', (a) => dash(a.landline_phone)],
      ['Mobile phone', (a) => dash(a.mobile_phone)],
    ],
  },
  {
    title: 'Accounts contact',
    rows: [
      ['Contact name', (a) => dash(a.accounts_contact_name)],
      ['Contact person', (a) => dash(a.accounts_contact_person)],
      ['Email', (a) => dash(a.accounts_email)],
    ],
  },
  {
    title: 'Design contact',
    rows: [
      ['Contact name', (a) => dash(a.design_contact_name)],
      ['Email', (a) => dash(a.design_contact_email)],
      ['Phone', (a) => dash(a.design_contact_phone)],
      ['Design qualifications', (a) => dash(a.design_qualifications)],
    ],
  },
  {
    title: 'Communication preferences',
    rows: [
      ['Mailchimp notifications', (a) => yesNo(a.mailchimp_opt_in)],
      ['Primary contact email', (a) => dash(a.primary_contact_email)],
      ['Would like to visit the showrooms', (a) => yesNo(a.wants_showroom_visit)],
      ['Would like an account manager to call', (a) => yesNo(a.wants_account_manager)],
    ],
  },
  {
    title: 'Trading account details',
    rows: [
      ['NZBN', (a) => dash(a.nzbn)],
      ['Type of business', (a) => BUSINESS_TYPE_LABELS[a.business_type] ?? dash(a.business_type)],
      ['Registered office address', (a) => dash(a.registered_office_address)],
      ['Directors / proprietors — names & addresses', (a) => dash(a.directors_names_addresses)],
      ['Directors / proprietors — dates of birth', (a) => dash(a.directors_dates_of_birth)],
      ['Cash account acceptable', (a) => yesNo(a.cash_account_acceptable)],
    ],
  },
  {
    title: 'Trade reference',
    rows: [['Name / contact person / phone', (a) => dash(a.trade_reference)]],
  },
  {
    title: 'Consent',
    rows: [
      ['Terms of Trade accepted', (a) => yesNo(a.terms_accepted)],
      ['The customer (full business & contact name)', (a) => dash(a.customer_full_name)],
      ['Name of signatory', (a) => dash(a.signatory_name)],
      ['Position / title', (a) => dash(a.signatory_position)],
      ['Signature', (a) => dash(a.signature)],
    ],
  },
]

/** Every section of one submitted form. `form` is the API's application row. */
export default function ApplicationDetail({ form }) {
  if (!form) return null
  return (
    <div>
      {FORM_SECTIONS.map((section) => (
        <div key={section.title} style={{ marginTop: 18 }}>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>{section.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }} className="r-grid-2">
            {section.rows.map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, color: c.ink, whiteSpace: 'pre-wrap' }}>{value(form)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
