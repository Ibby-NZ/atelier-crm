// One email on its own page — where its words are edited. "For any kind of data
// entry … they will open in their own individual page instead of a tabbed drop
// down" (the client, 23 Sep 2026): the editor used to open under the email's row
// on /admin/letters, between the rows above and below it. The list is the list
// now, and this is the desk.
//
//   GET    /admin/email-templates        → { email_templates: [...] }
//   PUT    /admin/email-templates/:name  { subject, body } → { email_template }
//   DELETE /admin/email-templates/:name  → 204, or 404 "already the set letter"
//
// **There is no by-name GET, so the page reads the list and picks its row**
// (findTemplate). The list is a couple of dozen letters and is exactly what the
// API offers; inventing `GET /:name` here would 404 against every deployed API.
// A name the API does not send — a mistyped link, a letter a redeploy retired —
// is drawn as not found, never as an empty editor that could PUT a letter the
// API would 400 anyway.
//
// The rules came with the editor, unchanged. Save replaces the letter WHOLE (the
// API requires both halves, so it is never a diff); Revert is the DELETE, safe
// by construction because every override has a code template behind it, and its
// 404 is a friendly "it was already the set letter", not an error. A placeholder
// fills per-recipient at send time and an unknown one renders BLANK rather than
// erroring — the compose screen is where such a gap is seen and caught, since
// every reminder is read before it is sent. The decisions live in
// adminLetterTemplates.js with the vitest suite beside them.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiDelete, apiFetch, apiSend } from '../lib/api.js'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  inputStyle,
  messageOf,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  LETTERS_ROUTE,
  TEMPLATES_PATH,
  findTemplate,
  isNoOverride,
  placeholdersIn,
  putBody,
  sourceBadge,
  templateDescription,
  templateDraft,
  templateLabel,
  templatePath,
  updatedText,
} from './adminLetterTemplates.js'

const textareaStyle = {
  ...inputStyle,
  height: 'auto',
  minHeight: 220,
  padding: '10px 12px',
  fontFamily: font.mono,
  fontSize: 12.5,
  lineHeight: 1.6,
  resize: 'vertical',
}

export default function AdminLetterTemplate() {
  const { name } = useParams()
  const { message, flash } = useToast()

  const [template, setTemplate] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState({ subject: '', body: '' })

  const load = useCallback(async () => {
    const body = await apiFetch(TEMPLATES_PATH)
    const found = findTemplate(body.email_templates, name)
    setTemplate(found)
    return found
  }, [name])

  // useMutation's cycle with the email's own read standing in for a list
  // reload: re-reading is what flips the Edited/Default badge and its date.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then((found) => {
        if (active) setStatus(found ? 'ready' : 'missing')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load the emails.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Re-seed the boxes from server truth whenever the email reloads — after a
  // save that is the saved text, after a revert the set letter.
  useEffect(() => {
    if (!template) return
    setDraft(templateDraft(template))
  }, [template])

  const backLink = (
    <>
      <Link to={LETTERS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to emails
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing' || (status === 'ready' && !template)) {
    return (
      <NotFound
        title="Email not found"
        backTo={LETTERS_ROUTE}
        backLabel="Back to emails"
        message="The platform sends no email by that name — the link may be mistyped or out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Email" />
        <PanelNote>Loading the email…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Email" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }

  const badge = sourceBadge(template)
  const label = templateLabel(template.name)
  const placeholders = placeholdersIn(template.subject, template.body)

  const save = () => {
    const built = putBody(draft)
    if (built.error) return setError(built.error)
    return run(
      () => apiSend('PUT', templatePath(template.name), built.body),
      `${label} saved — every future send starts from this text.`
    )
  }

  // Revert = DELETE the override. The 404 is an ANSWER — "that name has no
  // stored override; it is already the set letter" — so it is caught before
  // useMutation would paint it red, and flashed as the no-op it is.
  const revert = () =>
    run(async () => {
      try {
        await apiDelete(templatePath(template.name))
        return { reverted: true }
      } catch (err) {
        if (isNoOverride(err)) return { reverted: false }
        throw err
      }
    }, (result) =>
      result.reverted
        ? `${label} is back to the default.`
        : `${label} was already the default — nothing to revert.`
    )

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={label}
        // When it goes, and to whom — the function the name alone does not state.
        subtitle={templateDescription(template.name)}
        right={
          <div style={{ textAlign: 'right' }}>
            {/* The API's own statement of which text is live. Edited is
                accent-toned so an overridden email is visible at a glance. */}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: badge.edited ? c.accent : c.muted,
              }}
            >
              {badge.edited ? 'Edited' : 'Default'}
            </span>
            {badge.edited && (
              <div style={{ ...mutedText, fontSize: 11, marginTop: 4 }}>{updatedText(template)}</div>
            )}
          </div>
        }
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Email" />
        <div style={{ padding: '20px 20px 22px' }}>
          <label style={{ display: 'block' }}>
            <span style={fieldLabel}>Subject</span>
            <input
              value={draft.subject}
              disabled={busy}
              onChange={setField('subject')}
              style={inputStyle}
              aria-label={`Subject for ${label}`}
            />
          </label>
          <label style={{ display: 'block', marginTop: 14 }}>
            <span style={fieldLabel}>Email</span>
            <textarea
              value={draft.body}
              disabled={busy}
              onChange={setField('body')}
              style={textareaStyle}
              aria-label={`Body for ${label}`}
            />
          </label>
          {placeholders.length > 0 && (
            <div style={{ marginTop: 10, ...mutedText, fontSize: 11.5 }}>
              Fills in per recipient:{' '}
              <span style={{ fontFamily: font.mono }}>
                {placeholders.map((field) => `{{ ${field} }}`).join('  ')}
              </span>
              {' — '}an unknown placeholder renders blank.
            </div>
          )}
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <GhostButton tone="accent" disabled={busy} onClick={save}>
              Save email
            </GhostButton>
            <GhostButton disabled={busy} onClick={revert}>
              Revert to the default
            </GhostButton>
          </div>
        </div>
      </section>

      <ToastLine message={message} />
    </div>
  )
}

const fieldLabel = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: c.muted,
  marginBottom: 7,
  marginTop: 8,
}
