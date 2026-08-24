import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  TEMPLATES_PATH,
  isNoOverride,
  placeholdersIn,
  putBody,
  sourceBadge,
  templateDraft,
  templateLabel,
  templatePath,
  updatedText,
} from './adminLetterTemplates.js'

const SCREEN_SOURCE = readFileSync(new URL('./AdminLetterTemplates.jsx', import.meta.url), 'utf8')

describe('paths', () => {
  it('are built in one place, with the name escaped into its segment', () => {
    expect(TEMPLATES_PATH).toBe('/admin/email-templates')
    expect(templatePath('sample_loan_reminder')).toBe(
      '/admin/email-templates/sample_loan_reminder'
    )
    // The names are code identifiers today, but the path must not trust that.
    expect(templatePath('a/b')).toBe('/admin/email-templates/a%2Fb')
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
    expect(SCREEN_SOURCE).toContain('apiDelete(templatePath(template.name))')
    expect(SCREEN_SOURCE).toContain('isNoOverride(err)')
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
    expect(SCREEN_SOURCE).toContain("apiSend('PUT', templatePath(template.name), built.body)")
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
