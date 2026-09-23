// The rules behind AdminLetterTemplates (the list of emails) and
// AdminLetterTemplate (one email's page, where it is edited), kept out of the
// .jsx so they test without a DOM (the adminSamples.js pattern — no jsdom in
// this repo).
//
// The screen edits the SET letters: `GET /admin/email-templates` lists every
// letter the API can send — an edited one comes back as its stored text, an
// unedited one as the code template rendered with its own `{{ placeholders }}`
// still visible, so the editor always opens on real text rather than an empty
// box. Three decisions matter:
//
//   - **A letter is replaced WHOLE (PUT), subject and body together.** The API
//     requires both, because a row overriding half a letter would leave the
//     other half coming from code with nothing on screen to say which half is
//     which. So the save is never a diff — there is no PATCH to build.
//   - **Revert is DELETE, and "there was nothing to revert" is a 404 that means
//     success.** Deleting the row falls the letter back to the code template,
//     which is always there — a revert can never delete a letter, only an
//     override. The 404 ("already the set letter") is therefore a friendly
//     no-op, not an error line: the screen flashes it and moves on.
//   - **`{{ placeholders }}` are text, not code.** They fill per-recipient at
//     send time and an UNKNOWN one renders BLANK rather than erroring — the gap
//     shows up in the compose preview a staffer reads before sending, which is
//     the one failure mode compose-before-send already catches. The screen says
//     this in words and lists each letter's placeholders so nobody has to guess
//     the vocabulary.

export const TEMPLATES_PATH = '/admin/email-templates'

/** `/admin/email-templates/sample_loan_reminder`. One place, escaped. */
export const templatePath = (name) => `${TEMPLATES_PATH}/${encodeURIComponent(name ?? '')}`

// ---- one email on its own page (23 Sep 2026) --------------------------------
//
// "For any kind of data entry … they will open in their own individual page
// instead of a tabbed drop down" (the client). An email used to open its editor
// under its row on the list; it opens on a page of its own now.

/**
 * The CRM's list of the emails, and the page one email opens on. Keyed by the
 * template's NAME, because that is how the API addresses one — there is no id,
 * and `:name` is an enum of the names the code can render. Separate from
 * templatePath even though both end in the name: a link is not a fetch, and
 * moving one should never silently retarget the other.
 */
export const LETTERS_ROUTE = '/admin/letters'
export const templateRoute = (name) => `${LETTERS_ROUTE}/${encodeURIComponent(name ?? '')}`

/**
 * One email out of the list read. The API has no by-name GET — the list IS the
 * read, a couple of dozen rows with every letter's text in it — so the page
 * reads the list and picks. null when the name is not one the API sends (a
 * mistyped link, or a name a redeploy retired), which the page draws as not
 * found rather than as an empty editor.
 *
 * @param {Array<{name: string}>} rows `email_templates` from GET /admin/email-templates
 * @param {string} name the route's `:name`
 * @returns {object|null}
 */
export function findTemplate(rows, name) {
  if (!Array.isArray(rows) || typeof name !== 'string' || name === '') return null
  return rows.find((row) => row?.name === name) ?? null
}

// Mirrors the store's PLACEHOLDER regex (src/email/template-store.js): `{{
// field }}` with or without the spaces, and deliberately not an expression
// language — a letter is text.
const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

/**
 * Every distinct placeholder the given texts mention, in order of first
 * appearance — what the letter's card lists as its vocabulary.
 *
 * @param {...string} texts usually the subject then the body
 * @returns {string[]}
 */
export function placeholdersIn(...texts) {
  const found = []
  for (const text of texts) {
    for (const match of String(text ?? '').matchAll(PLACEHOLDER)) {
      const name = match[1].toLowerCase()
      if (!found.includes(name)) found.push(name)
    }
  }
  return found
}

/**
 * A letter's name for a person: 'sample_loan_reminder' → 'Sample loan
 * reminder'. The stored name is the identifier and never edited.
 */
export function templateLabel(name) {
  const text = typeof name === 'string' ? name.trim() : ''
  if (text === '') return '—'
  const words = text.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Whether a letter is overridden, worded for the list. `source` is the API's
 * own statement — 'database' is a stored override, 'code' the set letter — and
 * nothing here infers it from the text.
 *
 * @param {{ source?: string }} template
 * @returns {{ text: string, edited: boolean }}
 */
export function sourceBadge(template = {}) {
  return template.source === 'database'
    ? { text: 'Edited', edited: true }
    : { text: 'Set letter', edited: false }
}

/** The updated_at day for an edited row, sliced — never a Date, never the clock. */
export function updatedText(template = {}) {
  const value = template.updated_at
  return typeof value === 'string' && value.length >= 10 ? `edited ${value.slice(0, 10)}` : ''
}

/**
 * The PUT body, or the reason there is none. Both halves are required — the
 * API refuses a half-override — and both travel VERBATIM once non-blank: the
 * text in the boxes is the letter, whitespace and all.
 *
 * @param {{ subject?: string, body?: string }} draft
 * @returns {{ body: { subject: string, body: string } }|{ error: string }}
 */
export function putBody(draft = {}) {
  const subject = typeof draft.subject === 'string' ? draft.subject : ''
  const body = typeof draft.body === 'string' ? draft.body : ''
  if (subject.trim() === '') {
    return { error: 'The subject is blank. A letter needs both halves — revert instead if you want the set letter back.' }
  }
  if (body.trim() === '') {
    return { error: 'The letter is blank. A letter needs both halves — revert instead if you want the set letter back.' }
  }
  return { body: { subject, body } }
}

/**
 * Is this the revert's "already the set letter" 404? That answer means there
 * was no override to remove — a no-op, not a failure — and the screen flashes
 * it instead of painting an error. Anything else reads through messageOf.
 *
 * @param {{ status?: number }|unknown} error
 * @returns {boolean}
 */
export const isNoOverride = (error) => error?.status === 404

/** The draft the editor opens with: the letter exactly as the list shows it. */
export function templateDraft(template = {}) {
  return {
    subject: typeof template.subject === 'string' ? template.subject : '',
    body: typeof template.body === 'string' ? template.body : '',
  }
}

// ---- what each email is FOR (16 Sep 2026: "specify function") --------------
//
// The API names a template by its trigger; the office needs to know when it
// goes and to whom. One sentence each, keyed on the API's own names; a name
// this build has not been taught falls back to a generic line rather than
// blank, so a new template on a newer API is still listed and editable.
const EMAIL_DESCRIPTIONS = Object.freeze({
  request_received: 'To the client the moment a quote request or backorder request is submitted on the website.',
  backoffice_new_request: 'To the back office when a website request arrives — the prompt to price it.',
  checkout_receipt: 'To the client after a card checkout: the receipt for what was paid.',
  order_confirmed: 'To the client when the office confirms their order against a Xero invoice.',
  order_invoiced: 'To the client when the invoice is raised in Xero for their order.',
  payment_received: 'To the client when their order is marked paid.',
  shipped: 'To the client when their order ships, with the tracking link if one was entered.',
  sample_loan_reminder: 'To whoever holds a sample that is due back — the chase from the Samples register.',
  trade_application_approved: 'To an applicant when their trade account is approved.',
  contact_received: 'To a visitor who sends the website contact form (including a sample request from a product page).',
  password_reset: 'To a person who asks for a password reset link, or has one sent to them by the office.',
  backoffice_new_contact: 'To the back office when the website contact form is sent.',
  backoffice_invoice_copy_request: 'To the back office when a trade client asks for a copy of an invoice.',
  invoice_copy_requested: 'To the trade client confirming their invoice-copy request was received.',
  backoffice_new_trade_application: 'To the back office when a trade account application is submitted.',
  sample_request_received: 'To the shopper the moment a sample request is sent from the website.',
  backoffice_new_sample_request: 'To the back office when a website sample request arrives — the prompt to send the cuttings.',
})

/**
 * One sentence on when the email goes and to whom.
 *
 * @param {string} name
 * @returns {string}
 */
export function templateDescription(name) {
  return EMAIL_DESCRIPTIONS[name] ?? 'An automatic email the platform sends.'
}

/**
 * Who receives it: the back office (the API's `backoffice_` prefix) or the
 * client. The screen groups the list by this so the office finds a client-
 * facing email without reading fifteen names.
 *
 * @param {string} name
 * @returns {'backoffice'|'client'}
 */
export function templateAudience(name) {
  return typeof name === 'string' && name.startsWith('backoffice_') ? 'backoffice' : 'client'
}

export const AUDIENCE_GROUPS = Object.freeze([
  { key: 'client', label: 'To clients' },
  { key: 'backoffice', label: 'To the back office' },
])

/**
 * The rows grouped for the screen, client-facing first, each group in the
 * API's own order.
 *
 * @param {Array<{name: string}>} rows
 * @returns {Array<{key: string, label: string, rows: Array}>}
 */
export function groupTemplates(rows = []) {
  return AUDIENCE_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => templateAudience(row?.name) === group.key),
  })).filter((group) => group.rows.length > 0)
}
