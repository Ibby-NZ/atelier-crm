// Generic sub-navigation tab strip — same pattern as the Reporting tabs
// (Overview / Report library). Active tab renders as a static span; the
// rest are links.
//
// LAYOUT ONLY. The tab sets, and which actions each section offers, live in
// ./sections.js so they can be unit-tested (there is no jsdom here) — and are
// re-exported below, so every screen keeps its existing
// `import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'`.
import { Link } from 'react-router-dom'
import { c, font, radius } from '../theme.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { sectionActions } from './sections.js'

export * from './sections.js'

// A tab carrying `cap` is dropped for logins without it, following the SideNav.
// The route behind it is guarded either way — this only stops the strip offering a
// door that opens onto a locked panel, and taking the strip itself away with it.
//
// The section's actions ride on the strip rather than in a screen's PageHeader:
// the client asked for "New sales order" on every tab of the Orders section, and
// the strip is the one piece of chrome every tab of a section already renders.
// They are resolved from the tab set (see sectionActions), so a screen neither
// passes them nor knows about them.
export function SectionTabs({ tabs, active }) {
  const { can } = useAuth()
  const visible = tabs.filter((t) => !t.cap || can(t.cap))
  const actions = sectionActions(tabs)
  return (
    <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', borderBottom: `1px solid ${c.line}` }}>
      <div style={{ display: 'flex', gap: 24 }}>
        {visible.map((t) => {
          const on = t.key === active
          if (on) {
            return (
              <span key={t.key} style={{ paddingBottom: 9, fontSize: 13, color: c.accent, fontWeight: 600, borderBottom: `2px solid ${c.accent}` }}>
                {t.label}
              </span>
            )
          }
          return (
            <Link key={t.key} to={t.to} className="ab-link" style={{ textDecoration: 'none', paddingBottom: 9, fontSize: 13, color: c.muted, borderBottom: '2px solid transparent' }}>
              {t.label}
            </Link>
          )
        })}
      </div>
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, paddingBottom: 7 }}>
          {actions.map((action) => (
            <Link
              key={action.key}
              to={action.to}
              className="ab-t"
              style={{ textDecoration: 'none', border: `1px solid ${c.line}`, borderRadius: radius.pill, padding: '6px 12px', fontFamily: font.ui, fontSize: 12, color: c.accent, whiteSpace: 'nowrap' }}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
