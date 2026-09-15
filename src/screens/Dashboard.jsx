// The landing screen, live against GET /admin/dashboard (one round trip: sales
// MTD out of the API's revenue scope, the open order book, inbound POs, the
// newest orders).
//
// EVERY FIGURE IS CLICKABLE INTO THE LIST IT IS MADE OF — the client's ask.
// The links come from ./dashboard.js, built off the payload's own stated
// populations, so a tile cannot open a list that disagrees with its number.
// Stock alerts is the one tile still indicative: nothing in the schema holds a
// par level, and inventing a number would be a worse lie than an empty tile.
//
// The RPT-03 scope rule survives the wiring: the MTD figure is company-wide,
// so a login without all-company report access gets a withheld tile (drawn,
// not fetched-and-hidden — the API serves it either way, this is honesty about
// scope, not access control; CAPS says so at length).
//
// PO money is masked SERVER-side by key deletion (`total_cost` simply absent
// without finance visibility); the MaskedFigure here only draws that absence.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { c, font, radius } from '../theme.js'
import { PageHeader, SecondaryButton, Em, Indicative } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiFetch } from '../lib/api.js'
import { messageOf, panel, PanelHead, PanelNote } from '../admin/parts.jsx'
import { MaskedFigure } from '../auth/guards.jsx'
import { STATUS_LABELS, contactLabel, formatCents } from '../admin/orderFlow.js'
import { purchaseOrderRoute } from './adminPurchaseOrders.js'
import {
  DASHBOARD_PATH,
  STOCK_ALERTS_KPI,
  inboundKpi,
  mtdKpi,
  openKpi,
  recentOrderLink,
} from './dashboard.js'

const weekday = () =>
  new Date().toLocaleDateString('en-NZ', { weekday: 'long' })

export default function Dashboard() {
  const nav = useNavigate()
  const { user, access } = useAuth()
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiFetch(DASHBOARD_PATH)
      .then((body) => active && setPayload(body))
      .catch((err) => {
        if (!active) return
        setError(messageOf(err, 'The dashboard figures could not be loaded.'))
      })
    return () => {
      active = false
    }
  }, [])

  const kpis = [
    { label: 'Sales · MTD', ...mtdKpi(payload?.sales_mtd ?? null, { allAccess: access.all }), key: true },
    { label: 'Open orders', ...openKpi(payload?.open_orders ?? null) },
    { label: 'Inbound shipments', ...inboundKpi(payload?.inbound ?? null) },
    { label: 'Stock alerts', ...STOCK_ALERTS_KPI },
  ]

  const recent = payload?.recent_orders ?? []
  const inboundPos = payload?.inbound?.purchase_orders ?? []

  return (
    <>
      <PageHeader
        eyebrow="Atelier Textiles · Parnell"
        title={<>Good morning{user ? `, ${user.name}` : ''} —&nbsp;<Em>{weekday()}</Em></>}
        right={<SecondaryButton onClick={() => nav('/reporting')}>View reporting</SecondaryButton>}
      />

      {error && (
        <div style={{ marginTop: 20, fontSize: 12.5, color: c.clay }}>{error}</div>
      )}

      {/* KPI row — each live tile is a real link into the list its figure is made of. */}
      <div className="r-grid-3" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16 }}>
        {kpis.map((k) => {
          const inner = (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', alignContent: 'flex-start', justifyContent: 'space-between', gap: 6, minHeight: 34 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.inkSoft }}>{k.label}</span>
                {k.indicative && <Indicative />}
              </div>
              <div title={k.withheld ? 'Company-wide sales — not available on your access' : undefined}
                style={{ marginTop: 14, fontFamily: font.mono, fontWeight: 500, fontSize: 29, letterSpacing: '-0.01em', overflowWrap: 'anywhere', color: k.withheld ? c.muted : (k.key ? c.accent : c.ink) }}>{k.value}</div>
              <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5, color: c.muted }}>{k.note}</div>
            </>
          )
          const tileStyle = { display: 'block', minWidth: 0, padding: 20, border: `1px solid ${c.line}`, borderRadius: radius.md }
          // A real <Link> where there is somewhere to go — it is a navigation.
          // A paper surface behind the link keeps the shared hover treatment visible.
          return (
            <div key={k.label} style={{ display: 'grid', minWidth: 0, border: 'none', borderRadius: radius.md, background: c.paper }}>
              {k.link ? (
                <Link to={k.link} className="ab-rowhover ab-t" style={{ ...tileStyle, textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
                  {inner}
                </Link>
              ) : (
                <div style={tileStyle}>{inner}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Two columns */}
      <div className="r-ops-2col" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', alignItems: 'start', gap: 24 }}>

        {/* Recent orders */}
        <section aria-labelledby="dashboard-recent-orders" style={{ ...panel, minWidth: 0 }}>
          <PanelHead
            label={<span id="dashboard-recent-orders" role="heading" aria-level={2} style={{ color: c.ink }}>Latest · Recent sales orders</span>}
            right={
              <span style={{ flexShrink: 0, fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.brass }}>
                {payload ? `${recent.length} most recent` : '…'}
              </span>
            }
          />
          <div style={{ padding: payload ? '4px 8px' : 0 }}>
            {!payload && (
              <PanelNote>{error ? 'Recent orders are unavailable.' : 'Loading recent orders…'}</PanelNote>
            )}
            {payload && recent.length === 0 && (
              <div style={{ padding: '16px 12px', fontSize: 12.5, lineHeight: 1.5, color: c.muted }}>
                No orders on the platform yet.
              </div>
            )}
            {recent.map((order, i) => (
              <Link key={order.id} to={recentOrderLink(order)} className="ab-rowhover ab-t"
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 16, padding: '16px 12px', borderBottom: i === recent.length - 1 ? 'none' : `1px solid ${c.line}`, borderRadius: radius.xs, cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 500, lineHeight: 1.5, color: c.ink }}>{contactLabel(order)}</div>
                  <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: c.muted }}>
                    <span style={{ fontFamily: font.mono, color: c.inkSoft }}>{order.order_number}</span> · {STATUS_LABELS[order.status] ?? order.status}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 14.5, fontWeight: 500, color: c.ink }}>{formatCents(order.total_cents)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Inbound */}
        <section aria-labelledby="dashboard-inbound-orders" style={{ ...panel, minWidth: 0 }}>
          <PanelHead
            label={<span id="dashboard-inbound-orders" role="heading" aria-level={2} style={{ color: c.ink }}>Inbound · Purchase orders with the houses</span>}
            right={
              <span style={{ flexShrink: 0, fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.brass }}>
                {payload ? `${payload.inbound.count} en route` : '…'}
              </span>
            }
          />
          <div style={{ padding: payload ? '4px 8px' : 0 }}>
            {!payload && (
              <PanelNote>{error ? 'Inbound purchase orders are unavailable.' : 'Loading inbound purchase orders…'}</PanelNote>
            )}
            {payload && inboundPos.length === 0 && (
              <div style={{ padding: '16px 12px', fontSize: 12.5, lineHeight: 1.5, color: c.muted }}>
                Nothing on the water — no purchase orders are out with the houses.
              </div>
            )}
            {inboundPos.map((po, i) => (
              <Link key={po.id} to={purchaseOrderRoute(po.id)} className="ab-rowhover ab-t"
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 16, padding: '16px 12px', borderBottom: i === inboundPos.length - 1 ? 'none' : `1px solid ${c.line}`, borderRadius: radius.xs, cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 500, lineHeight: 1.5, color: c.ink }}>{po.supplier_name}</div>
                  <div style={{ marginTop: 6, fontFamily: font.mono, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>{po.po_number}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 14.5, fontWeight: 500, color: c.ink }}>
                    {/* `total_cost` is DELETED server-side without finance visibility. */}
                    {Object.hasOwn(po, 'total_cost') ? (
                      po.total_cost == null ? '—' : `${po.currency ?? ''} ${Number(po.total_cost).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`.trim()
                    ) : (
                      <MaskedFigure label="Supplier spend" />
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
