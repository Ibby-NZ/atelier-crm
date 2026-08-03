import { useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, SecondaryButton, Em, Indicative } from '../components/ui.jsx'
import { dashboard } from '../data/atelier.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'
import { MaskedFigure } from '../auth/guards.jsx'

const dotColour = { clay: c.clay, sage: c.sage, muted: c.muted }

export default function Dashboard() {
  const nav = useNavigate()
  const { user, can, access } = useAuth()
  const finance = can(CAPS.FINANCE_VIEW)
  const { kpis, orders, pos, activity, greetingDay } = dashboard

  return (
    <>
      <PageHeader
        eyebrow="Atelier Textiles · Parnell"
        title={<>Good morning{user ? `, ${user.name}` : ''} —&nbsp;<Em>{greetingDay}</Em></>}
        right={<SecondaryButton onClick={() => nav('/reporting')}>View reporting</SecondaryButton>}
      />

      {/* KPI row */}
      <div className="r-kpi-4" style={{ marginTop: 36, border: `1px solid ${c.line}`, borderRadius: 4, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', position: 'relative', background: c.paper }}>
        {kpis.map((k, i) => {
          // Withheld rather than scoped: a month-to-date total for one salesperson is a
          // figure the data does not hold, and inventing one to fill the tile would be a
          // worse lie than an empty tile. Same call as R-02/R-11 — no salesperson grain,
          // so say so instead of quietly serving the company number.
          const withheld = k.allCompany && !access.all
          return (
            <div key={k.label} style={{ padding: '22px 24px', borderLeft: i === 0 ? 'none' : `1px solid ${c.line}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>{k.label}</div>
              <div title={withheld ? 'Company-wide sales — not available on your access' : undefined}
                style={{ marginTop: 14, fontFamily: font.mono, fontWeight: 500, fontSize: 29, letterSpacing: '-0.01em', color: withheld ? c.muted : (k.key ? c.accent : c.ink) }}>{withheld ? '——' : k.value}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: c.muted }}>{withheld ? 'Company-wide — not on your access' : k.note}</div>
            </div>
          )
        })}
        <div style={{ position: 'absolute', top: -1, right: 14, transform: 'translateY(-50%)', background: c.paper, padding: '0 8px' }}>
          <Indicative />
        </div>
      </div>

      {/* Two columns */}
      <div className="r-dash-cols" style={{ marginTop: 44, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

        {/* Today */}
        <section style={{ paddingRight: 44 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Today · Recent sales orders</div>
            <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.brass }}>{orders.length} placed</span>
          </div>
          <div style={{ borderTop: `1px solid ${c.line}` }}>
            {orders.map((o) => (
              <div key={o.client} onClick={() => nav('/sales-orders')} className="ab-rowhover ab-t"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16, padding: '15px 10px 15px 4px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer', margin: '0 -10px 0 -4px' }}>
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{o.client}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: c.muted }}>{o.sub}</div>
                </div>
                <div style={{ textAlign: 'right', paddingRight: 8 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 14.5, color: c.ink }}>{o.amount}</div>
                  <div style={{ marginTop: 3 }}><Indicative /></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Inbound */}
        <section style={{ paddingLeft: 44, borderLeft: `1px solid ${c.line}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Inbound · Open purchase orders</div>
            <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.brass }}>{pos.length} en route</span>
          </div>
          <div style={{ borderTop: `1px solid ${c.line}` }}>
            {pos.map((p) => (
              <div key={p.supplier} onClick={() => nav('/purchase-orders')} className="ab-rowhover ab-t"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16, padding: '15px 10px 15px 4px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer', margin: '0 -10px 0 -4px' }}>
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{p.supplier}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: c.muted }}>ETA {p.eta}</div>
                </div>
                <div style={{ textAlign: 'right', paddingRight: 8 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 14.5, color: c.ink }}>
                    {finance ? p.amount : <MaskedFigure label="Supplier spend" />}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{finance ? 'Outstanding · Indicative' : 'Supplier spend · restricted'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Activity strip */}
      <div style={{ marginTop: 48, borderTop: `1px solid ${c.line}`, paddingTop: 18, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Activity</div>
        {activity.filter((a) => finance || !a.finance).map((a, i) => {
          const isOverdue = a.tone === 'clay'
          const inner = (
            <>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColour[a.tone] || c.muted, flex: 'none' }} />
              <span style={{ fontSize: 13, color: isOverdue ? c.clay : c.inkSoft }}>{a.text}</span>
            </>
          )
          return isOverdue ? (
            <div key={i} onClick={() => nav('/samples')} className="ab-rowhover ab-t"
              style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', padding: '6px 10px', margin: '-6px 0', borderRadius: 4 }}>
              {inner}
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>{inner}</div>
          )
        })}
      </div>
    </>
  )
}
