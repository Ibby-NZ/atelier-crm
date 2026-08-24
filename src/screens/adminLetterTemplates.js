// The rules behind AdminLetterTemplates, kept out of the .jsx so they test
// without a DOM (the adminSamples.js pattern — no jsdom in this repo).
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
