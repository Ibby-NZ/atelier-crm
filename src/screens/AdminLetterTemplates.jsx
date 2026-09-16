// Emails (the office's word; the route is still /admin/letters) — the
// staff-editable email templates, wired to atelier-api's
// /admin/email-templates (W20-US-003 / US-006). Live: an edit here changes the
// letter every future send drafts from.
//
//   GET    /admin/email-templates        → { email_templates: [{ name, subject,
//                                          body, source, updated_at }] }
//   PUT    /admin/email-templates/:name  { subject, body } → { email_template }
//   DELETE /admin/email-templates/:name  → 204, or 404 "already the set letter"
//
// The list shows EVERY letter the API can send: an edited one as its stored
// text, an unedited one as the code template with its own {{ placeholders }}
// still visible — so the editor opens on the default words, never a blank box.
// Save replaces the letter whole (the API requires both halves); Revert is the
// DELETE, safe by construction because every override has a code template
// behind it, and its 404 is a friendly "it was already the set letter", not an
// error. The decisions live in adminLetterTemplates.js with the vitest suite
// beside them; this file is layout and effects.
//
// A placeholder fills per-recipient at send time, and an unknown one renders
// BLANK rather than erroring — the compose screen is where such a gap is seen
// and caught, since every reminder is read before it is sent.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, adminTabs } from '../components/sectionTabs.jsx'
import { apiDelete, apiSend } from '../lib/api.js'
import { useAdminList } from '../admin/useAdminList.js'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  TEMPLATES_PATH,
  isNoOverride,
  placeholdersIn,
  putBody,
  sourceBadge,
  templateDraft,
  templateDescription,
  templateLabel,
  templatePath,
  groupTemplates,
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

export default function AdminLetterTemplates() {
  const [openName, setOpenName] = useState(null)
  const [draft, setDraft] = useState({ subject: '', body: '' })
  const { message, flash } = useToast()

  // The store is a handful of rows and the endpoint has no filters; the list
  // hook still earns its keep as the load/reload/error half of the mutate
  // cycle. readList treats the meta-less envelope as "the rows are the total".
  const list = useAdminList({ path: TEMPLATES_PATH, key: 'email_templates' })
  const { busy, error, setError, run } = useMutation({ reload: list.reload, flash })

  // Keep the open editor in step with a reloaded row; close it if the row is
  // gone (it cannot be, short of a redeploy shrinking TEMPLATE_NAMES).
  useEffect(() => {
    if (openName == null) return
    const row = list.rows.find((template) => template.name === openName)
    if (!row) {
      setOpenName(null)
      return
    }
    setDraft(templateDraft(row))
  }, [openName, list.rows])

  const toggle = (template) => {
    setError('')
    setOpenName((current) => (current === template.name ? null : template.name))
  }

  const save = (template) => {
    const built = putBody(draft)
    if (built.error) return setError(built.error)
    run(
      () => apiSend('PUT', templatePath(template.name), built.body),
      `${templateLabel(template.name)} saved — every future send starts from this text.`
    )
  }

  // Revert = DELETE the override. The 404 is an ANSWER — "that name has no
  // stored override; it is already the set letter" — so it is caught before
  // useMutation would paint it red, and flashed as the no-op it is.
  const revert = (template) => {
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
        ? `${templateLabel(template.name)} is back to the default.`
        : `${templateLabel(template.name)} was already the default — nothing to revert.`
    )
  }

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* "Emails", not "Letters" (16 Sep 2026): these are the automatic emails
          the platform sends, and each row says when it goes and to whom. */}
      <PageHeader
        eyebrow="Administration"
        title={<>Emails</>}
        subtitle="The automatic emails the platform sends — order confirmations, receipts, shipping notices, sample chases, password resets and the back-office alerts. Edit one here and every future send starts from your words. Anything in {{ double braces }} fills in per recipient at send time."
      />
      <SectionTabs tabs={adminTabs} active="letters" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Email templates"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                {list.total.toLocaleString('en-NZ')} emails
              </span>
            }
          />
          <PanelNote>
            A {'{{ placeholder }}'} becomes that recipient's own value when the email is
            sent — {'{{ holder_name }}'} becomes the borrower's name. One the email does
            not know renders blank, which shows up in the compose preview before anything
            goes. Reverting removes your edit and returns the email to the default text; the
            default itself can never be deleted.
          </PanelNote>

          <ErrorLine style={{ padding: '0 20px 12px' }}>{error}</ErrorLine>
          {list.status === 'loading' && <PanelNote>Loading the emails…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}

          {list.status === 'ready' &&
            groupTemplates(list.rows).map((group) => (
              <div key={group.key}>
                <div style={{ ...sectionLabel, padding: '18px 20px 6px', borderTop: `1px solid ${c.line}` }}>
                  {group.label}
                </div>
                {group.rows.map((template) => {
                  const badge = sourceBadge(template)
                  const open = openName === template.name
                  const placeholders = placeholdersIn(template.subject, template.body)
                  return (
                    <div
                      key={template.name}
                      style={{
                        borderTop: `1px solid ${c.line}`,
                        ...(open ? { background: c.surface, borderLeft: `3px solid ${c.accent}` } : {}),
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) auto',
                          gap: 16,
                          alignItems: 'start',
                          padding: open ? '14px 20px 10px 17px' : '14px 20px',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                              {templateLabel(template.name)}
                            </span>
                            {/* The API's own statement of which text is live.
                                Edited is accent-toned so an overridden email is
                                visible at a glance. */}
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
                              <span style={{ ...mutedText, fontSize: 11 }}>{updatedText(template)}</span>
                            )}
                          </div>
                          {/* When it goes, and to whom — the function the name
                              alone does not state. */}
                          <div style={{ fontSize: 12.5, color: c.inkSoft, marginTop: 4, lineHeight: 1.5 }}>
                            {templateDescription(template.name)}
                          </div>
                          {!open && (
                            <div style={{ ...mutedText, fontSize: 12, marginTop: 6 }}>
                              <span style={{ ...monoText, fontSize: 11, marginRight: 8 }}>Subject</span>
                              {template.subject}
                            </div>
                          )}
                        </div>
                        <GhostButton disabled={busy} aria-expanded={open} onClick={() => toggle(template)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
                      </div>

                      {open && (
                        <div style={{ padding: '0 20px 22px 17px' }}>
                          <label style={{ display: 'block' }}>
                            <span style={fieldLabel}>Subject</span>
                            <input
                              value={draft.subject}
                              disabled={busy}
                              onChange={setField('subject')}
                              style={inputStyle}
                              aria-label={`Subject for ${templateLabel(template.name)}`}
                            />
                          </label>
                          <label style={{ display: 'block', marginTop: 14 }}>
                            <span style={fieldLabel}>Email</span>
                            <textarea
                              value={draft.body}
                              disabled={busy}
                              onChange={setField('body')}
                              style={textareaStyle}
                              aria-label={`Body for ${templateLabel(template.name)}`}
                            />
                          </label>
                          {placeholders.length > 0 && (
                            <div style={{ marginTop: 10, ...mutedText, fontSize: 11.5 }}>
                              Fills in per recipient:{' '}
                              <span style={{ fontFamily: font.mono }}>
                                {placeholders.map((name) => `{{ ${name} }}`).join('  ')}
                              </span>
                              {' — '}an unknown placeholder renders blank.
                            </div>
                          )}
                          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                            <GhostButton tone="accent" disabled={busy} onClick={() => save(template)}>
                              Save email
                            </GhostButton>
                            <GhostButton disabled={busy} onClick={() => revert(template)}>
                              Revert to the default
                            </GhostButton>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
        </section>
      </div>

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
