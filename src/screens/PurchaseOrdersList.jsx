import { Link, useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, PrimaryButton, StatusPill, Indicative } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { useAppStore } from '../store/AppStore.jsx'

const COLS = '150px 1.4fr 84px 84px 84px 96px 122px'
const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }

// Two secondary shipments kept as muted reference rows (demo richness) — not linked, not in the store.
const otherShipments = [
  { po: 'PO-2026-0143', supplier: 'Manuel Canovas', currency: 'GBP', ordered: 60, received: 0, eta: '09 Jul' },
  { po: 'PO-2026-0140', supplier: 'Larsen', currency: 'GBP', ordered: 26, received: 0, eta: '12 Jul' },
]

export default function PurchaseOrdersList() {
  const navigate = useNavigate()
  const { purchaseOrders } = useAppStore()

  return (
    <>
      <PageHeader
        eyebrow="Orders"
        title="Purchase Orders"
        right={<PrimaryButton onClick={() => navigate('/purchase-orders/new')} style={{ whiteSpace: 'nowrap' }}>New purchase order</PrimaryButton>}
      />

      <SectionTabs tabs={ordersTabs} active="purchase" />

      <div style={{ marginTop: 26, border: `1px solid ${c.line}`, borderRadius: 4, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', minWidth: 820, padding: '12px 20px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
          <div style={hCell}>Number</div>
          <div style={hCell}>Supplier</div>
          <div style={hCell}>Currency</div>
          <div style={{ ...hCell, textAlign: 'right' }}>Ordered</div>
          <div style={{ ...hCell, textAlign: 'right' }}>Received</div>
          <div style={hCell}>ETA</div>
          <div style={hCell}>Status</div>
        </div>

        {purchaseOrders.map((po) => {
          const tOrd = po.lines.reduce((a, l) => a + l.ordered, 0)
          const tRec = po.lines.reduce((a, l) => a + l.received, 0)
          const tOut = tOrd - tRec
          const status = tRec === 0 ? (po.status || 'Draft') : tOut > 0 ? 'Part-received' : 'Received in full'
          const tone = tOut === 0 && tRec > 0 ? 'sage' : tRec > 0 ? 'clay' : 'muted'
          return (
            <Link
              key={po.id}
              to={`/purchase-orders/${po.id}`}
              className="ab-rowhover ab-t"
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', minWidth: 820, padding: '15px 20px', borderBottom: `1px solid ${c.line}`, textDecoration: 'none' }}
            >
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.inkSoft }}>{po.number}</span>
              <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{po.supplier}</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.inkSoft }}>{po.currency}</span>
              <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{tOrd} m</span>
              <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{tRec} m</span>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>{po.eta || '—'}</span>
              <span><StatusPill tone={tone}>{status}</StatusPill></span>
            </Link>
          )
        })}

        {/* reference rows — muted, non-linked */}
        {otherShipments.map((s) => (
          <div key={s.po} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', minWidth: 820, padding: '15px 20px', borderBottom: `1px solid ${c.line}`, background: c.surface, opacity: 0.75 }}>
            <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted }}>{s.po}</span>
            <span style={{ fontSize: 14, color: c.muted }}>{s.supplier}</span>
            <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted }}>{s.currency}</span>
            <span style={{ fontFamily: font.mono, fontSize: 13, color: c.muted, textAlign: 'right' }}>{s.ordered} m</span>
            <span style={{ fontFamily: font.mono, fontSize: 13, color: c.muted, textAlign: 'right' }}>{s.received} m</span>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>{s.eta}</span>
            <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>Reference</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Indicative />
        <span style={{ fontSize: 12, color: c.muted }}>{purchaseOrders.length} purchase orders · reference rows show other inbound shipments.</span>
      </div>
    </>
  )
}
