// Emails (the office's word; the route is still /admin/letters) — the
// staff-editable email templates, wired to atelier-api's
// /admin/email-templates (W20-US-003 / US-006). Live: an edit changes the
// letter every future send drafts from.
//
//   GET    /admin/email-templates        → { email_templates: [{ name, subject,
//                                          body, source, updated_at }] }
//
// The list shows EVERY letter the API can send: an edited one as its stored
// text, an unedited one as the code template with its own {{ placeholders }}
// still visible — so the editor opens on the default words, never a blank box.
//
// One email OPENS ON ITS OWN PAGE (AdminLetterTemplate, /admin/letters/:name),
// where it is saved and reverted. The editor used to open under its row here,
// and the client asked for every data-entry form to open on a page of its own
// instead (23 Sep 2026). This screen is the list: which emails there are, when
// each goes and to whom, which have been edited, and the subject each one
// carries — and nothing on it writes. The decisions live in
// adminLetterTemplates.js with the vitest suite beside them; this file is
// layout and effects.
//
// A placeholder fills per-recipient at send time, and an unknown one renders
// BLANK rather than erroring — the compose screen is where such a gap is seen
// and caught, since every reminder is read before it is sent.

import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, adminTabs } from '../components/sectionTabs.jsx'
import { useAdminList } from '../admin/useAdminList.js'
import {
  GhostButton,
  PanelHead,
  PanelNote,
  monoText,
  mutedText,
  panel,
  sectionLabel,
} from '../admin/parts.jsx'
import {
  TEMPLATES_PATH,
  sourceBadge,
  templateDescription,
  templateLabel,
  templateRoute,
  groupTemplates,
  updatedText,
} from './adminLetterTemplates.js'

export default function AdminLetterTemplates() {
  // The store is a handful of rows and the endpoint has no filters; the list
  // hook still earns its keep as the load/error half of the screen.
  // readList treats the meta-less envelope as "the rows are the total".
  const list = useAdminList({ path: TEMPLATES_PATH, key: 'email_templates' })

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* "Emails", not "Letters" (16 Sep 2026): these are the automatic emails
          the platform sends, and each row says when it goes and to whom. */}
      <PageHeader
        eyebrow="Administration"
        title={<>Emails</>}
        subtitle="The automatic emails the platform sends — order confirmations, receipts, shipping notices, sample chases, password resets and the back-office alerts. Open one to edit it, and every future send starts from your words. Anything in {{ double braces }} fills in per recipient at send time."
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
                  return (
                    <div
                      key={template.name}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: 16,
                        alignItems: 'start',
                        padding: '14px 20px',
                        borderTop: `1px solid ${c.line}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <Link
                            to={templateRoute(template.name)}
                            className="ab-link"
                            style={{ fontSize: 13.5, fontWeight: 600, color: c.ink, textDecoration: 'none' }}
                          >
                            {templateLabel(template.name)}
                          </Link>
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
                        <div style={{ ...mutedText, fontSize: 12, marginTop: 6 }}>
                          <span style={{ ...monoText, fontSize: 11, marginRight: 8 }}>Subject</span>
                          {template.subject}
                        </div>
                      </div>
                      <Link to={templateRoute(template.name)} style={{ textDecoration: 'none' }}>
                        <GhostButton>Open</GhostButton>
                      </Link>
                    </div>
                  )
                })}
              </div>
            ))}
        </section>
      </div>
    </div>
  )
}
