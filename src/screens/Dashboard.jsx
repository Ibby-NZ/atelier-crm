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
import { c, font } from '../theme.js'
import { PageHeader, SecondaryButton, Em, Indicative } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiFetch } from '../lib/api.js'
import { messageOf } from '../admin/parts.jsx'
import { MaskedFigure } from '../auth/guards.jsx'
import { STATUS_LABELS, contactLabel, formatCents } from '../admin/orderFlow.js'
import { purchaseOrderRoute } from './adminPurchaseOrders.js'
import {
  DASHBOARD_PATH,
  STOCK_ALERTS_KPI,
  greeting,
  inboundKpi,
  mtdKpi,
  openKpi,
  recentOrderLink,
} from './dashboard.js'

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
        title={<>{greeting().salutation}{user ? `, ${user.name}` : ''} —&nbsp;<Em>{greeting().weekday}</Em></>}
        right={<SecondaryButton onClick={() => nav('/reporting')}>View reporting</SecondaryButton>}
      />

      {error && (
        <div style={{ marginTop: 20, fontSize: 12.5, color: c.clay }}>{error}</div>
      )}

      {/* KPI row — each live tile is a real link into the list its figure is made of. */}
      <div className="r-kpi-4" style={{ marginTop: 36, border: `1px solid ${c.line}`, borderRadius: 4, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', position: 'relative', background: c.paper }}>
        {kpis.map((k, i) => {
          const inner = (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>{k.label}</span>
                {k.indicative && <Indicative />}
              </div>
              <div title={k.withheld ? 'Company-wide sales — not available on your access' : undefined}
                style={{ marginTop: 14, fontFamily: font.mono, fontWeight: 500, fontSize: 29, letterSpacing: '-0.01em', color: k.withheld ? c.muted : (k.key ? c.accent : c.ink) }}>{k.value}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: c.muted }}>{k.note}</div>
            </>
          )
          const tileStyle = { display: 'block', padding: '22px 24px', borderLeft: i === 0 ? 'none' : `1px solid ${c.line}` }
          // A real <Link> where there is somewhere to go — it is a navigation.
          return k.link ? (
            <Link key={k.label} to={k.link} className="ab-rowhover ab-t" style={{ ...tileStyle, textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              {inner}
            </Link>
          ) : (
            <div key={k.label} style={tileStyle}>{inner}</div>
          )
        })}
      </div>

      {/* Two columns */}
      <div className="r-dash-cols" style={{ marginTop: 44, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

        {/* Recent orders */}
        <section style={{ paddingRight: 44 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Latest · Recent sales orders</div>
            <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.brass }}>
              {payload ? `${recent.length} most recent` : '…'}
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${c.line}` }}>
            {payload && recent.length === 0 && (
              <div style={{ padding: '15px 4px', fontSize: 12.5, color: c.muted }}>
                No orders on the platform yet.
              </div>
            )}
            {recent.map((order) => (
              <div key={order.id} onClick={() => nav(recentOrderLink(order))} className="ab-rowhover ab-t"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16, padding: '15px 10px 15px 4px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer', margin: '0 -10px 0 -4px' }}>
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{contactLabel(order)}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: c.muted }}>
                    {order.order_number} · {STATUS_LABELS[order.status] ?? order.status}
                  </div>
                </div>
                <div style={{ textAlign: 'right', paddingRight: 8 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 14.5, color: c.ink }}>{formatCents(order.total_cents)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Inbound */}
        <section style={{ paddingLeft: 44, borderLeft: `1px solid ${c.line}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Inbound · Purchase orders with the houses</div>
            <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.brass }}>
              {payload ? `${payload.inbound.count} en route` : '…'}
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${c.line}` }}>
            {payload && inboundPos.length === 0 && (
              <div style={{ padding: '15px 4px', fontSize: 12.5, color: c.muted }}>
                Nothing on the water — no purchase orders are out with the houses.
              </div>
            )}
            {inboundPos.map((po) => (
              <div key={po.id} onClick={() => nav(purchaseOrderRoute(po.id))} className="ab-rowhover ab-t"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16, padding: '15px 10px 15px 4px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer', margin: '0 -10px 0 -4px' }}>
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{po.supplier_name}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: c.muted }}>{po.po_number}</div>
                </div>
                <div style={{ textAlign: 'right', paddingRight: 8 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 14.5, color: c.ink }}>
                    {/* `total_cost` is DELETED server-side without finance visibility. */}
                    {Object.hasOwn(po, 'total_cost') ? (
                      po.total_cost == null ? '—' : `${po.currency ?? ''} ${Number(po.total_cost).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`.trim()
                    ) : (
                      <MaskedFigure label="Supplier spend" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
