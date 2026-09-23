import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {TEMPLATES_PATH,
  LETTERS_ROUTE,
  findTemplate,
  isNoOverride,
  placeholdersIn,
  putBody,
  sourceBadge,
  templateDraft,
  templateLabel,
  templatePath,
  templateRoute,
  updatedText, templateDescription, templateAudience, groupTemplates } from './adminLetterTemplates.js'

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
// Emails is two screens since 23 Sep 2026 (the client asked for every
// data-entry form on a page of its own): the list, and one email's page, where
// the editor went. Each rule below reads the file its line lives in now;
// SCREEN_SOURCE is the two together, for the rules that must hold on both.
const LIST_SOURCE = read('AdminLetterTemplates.jsx')
const PAGE_SOURCE = read('AdminLetterTemplate.jsx')
const SCREEN_SOURCE = `${LIST_SOURCE}\n${PAGE_SOURCE}`
const APP_SOURCE = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

describe('paths', () => {
  it('are built in one place, with the name escaped into its segment', () => {
    expect(TEMPLATES_PATH).toBe('/admin/email-templates')
    expect(templatePath('sample_loan_reminder')).toBe(
      '/admin/email-templates/sample_loan_reminder'
    )
    // The names are code identifiers today, but the path must not trust that.
    expect(templatePath('a/b')).toBe('/admin/email-templates/a%2Fb')
  })

  it('opens one email on a page keyed by its name, apart from the API path', () => {
    // The name is how the API addresses a template — there is no id — and a
    // link is not a fetch, so the two addresses are two names.
    expect(LETTERS_ROUTE).toBe('/admin/letters')
    expect(templateRoute('sample_loan_reminder')).toBe('/admin/letters/sample_loan_reminder')
    expect(templateRoute('a/b')).toBe('/admin/letters/a%2Fb')
    expect(templateRoute('shipped')).not.toBe(templatePath('shipped'))
    expect(APP_SOURCE).toContain('path="/admin/letters/:name" element={<AdminLetterTemplate />}')
  })
})

describe('findTemplate', () => {
  const rows = [
    { name: 'shipped', subject: 'On its way' },
    { name: 'sample_loan_reminder', subject: 'Your sample' },
  ]

  it('picks the email out of the list read — the API has no by-name GET', () => {
    expect(findTemplate(rows, 'sample_loan_reminder')).toBe(rows[1])
  })

  it('answers null for a name the API does not send, so the page says not found', () => {
    expect(findTemplate(rows, 'retired_letter')).toBeNull()
    expect(findTemplate(rows, '')).toBeNull()
    expect(findTemplate(rows, undefined)).toBeNull()
    expect(findTemplate(undefined, 'shipped')).toBeNull()
  })
})

describe('placeholdersIn', () => {
  it('lists each distinct placeholder once, in order of first appearance', () => {
    expect(
      placeholdersIn(
        'Your sample {{ barcode }}',
        'Dear {{ holder_name }}, {{barcode}} was due {{ due_back_at }}. — {{ holder_name }}'
      )
    ).toEqual(['barcode', 'holder_name', 'due_back_at'])
  })

  it('matches the store: spaces optional, expressions are not placeholders', () => {
    // Mirrors PLACEHOLDER in atelier-api's template-store.js — `{{ field }}`
    // is text substitution, deliberately not a language.
    expect(placeholdersIn('{{x}} {{ x }} {{ not-a-field }} { single }')).toEqual(['x'])
  })

  it('answers nothing for a letter with no placeholders', () => {
    expect(placeholdersIn('Plain words.', null)).toEqual([])
  })
})

describe('the list row', () => {
  it('words the source, which is the API statement of which text is live', () => {
    expect(sourceBadge({ source: 'database' })).toEqual({ text: 'Edited', edited: true })
    expect(sourceBadge({ source: 'code' })).toEqual({ text: 'Set letter', edited: false })
    expect(sourceBadge({})).toEqual({ text: 'Set letter', edited: false })
  })

  it('names a letter for a person and keeps the identifier out of it', () => {
    expect(templateLabel('sample_loan_reminder')).toBe('Sample loan reminder')
    expect(templateLabel('shipped')).toBe('Shipped')
    expect(templateLabel(undefined)).toBe('—')
  })

  it('dates an edit by slicing the ISO string — never via the clock', () => {
    expect(updatedText({ updated_at: '2026-08-20T02:00:00.000Z' })).toBe('edited 2026-08-20')
    // An unedited letter has updated_at null, and prints nothing.
    expect(updatedText({ updated_at: null })).toBe('')
    // Held over the source too, the register's rule.
    expect(SCREEN_SOURCE).not.toMatch(/new Date\(/)
    expect(SCREEN_SOURCE).not.toMatch(/Date\.now\(/)
  })
})

describe('putBody: a letter is replaced whole', () => {
  it('requires both halves, because the API refuses a half-override', () => {
    // A row overriding only the subject would leave the body coming from code
    // with nothing on screen to say which half is which.
    expect(putBody({ subject: '', body: 'Dear…' }).error).toMatch(/subject/i)
    expect(putBody({ subject: 'Hello', body: '   ' }).error).toMatch(/letter/i)
  })

  it('sends the text VERBATIM once non-blank — the boxes are the letter', () => {
    const built = putBody({ subject: ' Spaced subject ', body: 'Dear {{ holder_name }},\n\nx\n' })
    expect(built.body).toEqual({
      subject: ' Spaced subject ',
      body: 'Dear {{ holder_name }},\n\nx\n',
    })
  })

  it('points a blank at Revert rather than accepting an empty override', () => {
    expect(putBody({ subject: '', body: '' }).error).toMatch(/revert/i)
  })
})

describe('revert', () => {
  it('reads the 404 as "already the set letter" — a no-op, not a failure', () => {
    // DELETE with no stored row answers 404 by design; there was no override to
    // remove and the letter is already the set one. The screen flashes that
    // sentence instead of painting an error.
    expect(isNoOverride({ status: 404 })).toBe(true)
    expect(isNoOverride({ status: 409 })).toBe(false)
    expect(isNoOverride(new Error('network'))).toBe(false)
    expect(isNoOverride(undefined)).toBe(false)
  })

  it('is wired through apiDelete with the no-op caught before the error line', () => {
    expect(PAGE_SOURCE).toContain('apiDelete(templatePath(template.name))')
    expect(PAGE_SOURCE).toContain('isNoOverride(err)')
  })
})

describe('templateDraft', () => {
  it('opens the editor on the letter exactly as listed — placeholders visible', () => {
    // An unedited letter arrives as the code template rendered with its own
    // field names still in it, so the editor never opens on an empty box.
    const row = {
      name: 'sample_loan_reminder',
      subject: 'Your sample {{ barcode }}',
      body: 'Dear {{ holder_name }},',
      source: 'code',
    }
    expect(templateDraft(row)).toEqual({
      subject: 'Your sample {{ barcode }}',
      body: 'Dear {{ holder_name }},',
    })
    expect(templateDraft({})).toEqual({ subject: '', body: '' })
  })
})

describe('the screen', () => {
  it('replaces a letter whole with PUT and never diffs it', () => {
    expect(PAGE_SOURCE).toContain("apiSend('PUT', templatePath(template.name), built.body)")
    expect(SCREEN_SOURCE).not.toContain('diffFields')
  })

  it('quotes no admin endpoint of its own', () => {
    // Every path arrives as an imported constant, the register's rule.
    expect(SCREEN_SOURCE.match(/['"`]\/admin\/[a-z-]+/g)).toBeNull()
  })

  it('says the placeholder contract in its copy', () => {
    // "Fills per recipient" and "unknown renders blank" are the two facts a
    // staffer must know before rewording a letter.
    expect(SCREEN_SOURCE).toMatch(/per recipient/i)
    expect(SCREEN_SOURCE).toMatch(/renders blank/i)
  })
})


// --- what each email is for (16 Sep 2026: "Emails", and say what they do) ----

describe('templateDescription / templateAudience', () => {
  it('says when a known email goes and to whom', () => {
    expect(templateDescription('shipped')).toMatch(/ships/)
    expect(templateDescription('backoffice_new_request')).toMatch(/back office/)
  })

  it('falls back to a generic line for a name this build has not been taught', () => {
    expect(templateDescription('brand_new_letter')).toBe('An automatic email the platform sends.')
  })

  it('reads the audience off the API prefix', () => {
    expect(templateAudience('backoffice_new_contact')).toBe('backoffice')
    expect(templateAudience('contact_received')).toBe('client')
    expect(templateAudience(undefined)).toBe('client')
  })
})

describe('groupTemplates', () => {
  it('lists client emails first, then the back office, dropping an empty group', () => {
    const groups = groupTemplates([
      { name: 'backoffice_new_request' },
      { name: 'shipped' },
      { name: 'request_received' },
    ])
    expect(groups.map((g) => g.key)).toEqual(['client', 'backoffice'])
    expect(groups[0].rows.map((r) => r.name)).toEqual(['shipped', 'request_received'])
    expect(groups[1].rows.map((r) => r.name)).toEqual(['backoffice_new_request'])
    expect(groupTemplates([{ name: 'shipped' }])).toHaveLength(1)
    expect(groupTemplates([])).toEqual([])
  })
})

describe('the screen is titled Emails and says what each one does', () => {
  it('names the page Emails, not Letters', () => {
    expect(LIST_SOURCE).toContain('title={<>Emails</>}')
    expect(SCREEN_SOURCE).not.toContain('title={<>Letters</>}')
  })

  it('prints the description and groups by audience', () => {
    expect(LIST_SOURCE).toContain('templateDescription(template.name)')
    expect(LIST_SOURCE).toContain('groupTemplates(list.rows)')
    // …and the page says it again, under the email's name.
    expect(PAGE_SOURCE).toContain('subtitle={templateDescription(template.name)}')
  })
})

// The editor moved to a page of its own (23 Sep 2026). There is no jsdom here,
// so the move is held by reading both files.
describe('one email on its own page', () => {
  it('leaves the list with no editor and nothing that writes', () => {
    expect(LIST_SOURCE).not.toContain('openName')
    expect(LIST_SOURCE).not.toContain('<textarea')
    expect(LIST_SOURCE).not.toContain('apiSend')
    expect(LIST_SOURCE).not.toContain('apiDelete')
    expect(LIST_SOURCE).not.toContain('useMutation')
  })

  it('links each row, by name and by "Open", to the email\'s page', () => {
    expect(LIST_SOURCE).toContain('to={templateRoute(template.name)}')
    expect(LIST_SOURCE).toContain('<GhostButton>Open</GhostButton>')
  })

  it('reads the list and picks its email, drawing an unknown name as not found', () => {
    expect(PAGE_SOURCE).toContain('findTemplate(body.email_templates, name)')
    expect(PAGE_SOURCE).toContain("setStatus(found ? 'ready' : 'missing')")
    expect(PAGE_SOURCE).toContain('<NotFound')
  })

  it('keeps the StrictMode guard on its load, and re-reads after a write', () => {
    expect(PAGE_SOURCE).toContain('let active = true')
    expect(PAGE_SOURCE).toContain('useMutation({ reload: load, flash })')
  })

  it('goes back to the list by the route constant', () => {
    expect(PAGE_SOURCE).toContain('to={LETTERS_ROUTE}')
  })
})
