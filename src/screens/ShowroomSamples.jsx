import { useState, useEffect } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, Em, StatusPill, Swatch, Indicative, Toast } from '../components/ui.jsx'
import { showrooms, sampleOrders, sampleOrderFlow } from '../data/atelier.js'
import { useIsNarrow } from '../hooks/useIsNarrow.js'

const COLS = '1.7fr 1.2fr 0.9fr 0.9fr 84px 176px'

// Status → StatusPill tone. Requested reads as "needs action" (clay); received/displayed are settled (sage).
const toneOf = (status) =>
  status === 'Displayed' || status === 'Received' ? 'sage' : status === 'Requested' ? 'clay' : 'muted'

// The label for advancing an order one step along the lifecycle (null once it is displayed).
const ADVANCE_LABEL = {
  Requested: 'Mark ordered',
  Ordered: 'Mark shipped',
  'In transit': 'Mark received',
  Received: 'Put on display',
}

// Seed an editable register from the shared data (stable id for keys + immutable status advance).
function seed() {
  return sampleOrders.map((o, i) => ({ ...o, id: i }))
}

const nextStatus = (status) => {
  const at = sampleOrderFlow.indexOf(status)
  return at >= 0 && at < sampleOrderFlow.length - 1 ? sampleOrderFlow[at + 1] : status
}

export default function ShowroomSamples() {
  const [orders, setOrders] = useState(seed)
  const [showroomFilter, setShowroomFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [toast, setToast] = useState(null)
  const narrow = useIsNarrow()

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // ---- advance a single order one step, immutably --------------------------
  function advance(id) {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: nextStatus(o.status) } : o)),
    )
    const o = orders.find((x) => x.id === id)
    if (o) setToast(`${o.design} — ${o.colourway} · ${nextStatus(o.status)}`)
  }

  // ---- derived stats -------------------------------------------------------
  const inTransit = orders.filter((o) => o.status === 'In transit').length
  const awaiting = orders.filter((o) => o.status === 'Requested' || o.status === 'Ordered').length
  const onDisplay = orders.filter((o) => o.status === 'Displayed').length
  const stats = [
    { label: 'Sample orders', value: String(orders.length), color: c.ink },
    { label: 'In transit', value: String(inTransit), color: c.ink },
    { label: 'Awaiting', value: String(awaiting), color: awaiting ? c.accent : c.ink },
    { label: 'On display', value: String(onDisplay), color: c.ink },
  ]

  const statusOpts = ['All', ...sampleOrderFlow]
  const countFor = (id) => orders.filter((o) => o.showroom === id).length

  // ---- filtered set + the showrooms to render ------------------------------
  const matchStatus = (o) => statusFilter === 'All' || o.status === statusFilter
  const visible = showrooms.filter((s) => showroomFilter === 'All' || s.id === showroomFilter)

  // ---- selector cards (All + each showroom) --------------------------------
  const SelectorCard = ({ id, title, sub, count }) => {
    const on = showroomFilter === id
    return (
      <button
        onClick={() => setShowroomFilter(id)}
        className="ab-t"
        style={{
          textAlign: 'left', cursor: 'pointer', flex: '1 1 160px', minWidth: 148,
          padding: '13px 16px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: 4,
          background: on ? '#F3EADF' : c.paper,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: font.display, fontSize: 16, color: on ? c.accent : c.ink }}>{title}</span>
          <span style={{ fontFamily: font.mono, fontSize: 13, color: on ? c.accent : c.muted }}>{count}</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: c.muted }}>{sub}</div>
      </button>
    )
  }

  const StatusPills = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginRight: 2 }}>Status</span>
      {statusOpts.map((o) => {
        const on = o === statusFilter
        return (
          <div key={o} onClick={() => setStatusFilter(o)} className="ab-t"
            style={{ padding: '6px 12px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: 3, cursor: 'pointer', fontSize: 12, color: on ? c.accent : c.inkSoft, background: on ? '#F3EADF' : 'transparent' }}>
            {o}
          </div>
        )
      })}
    </div>
  )

  // ---- one showroom's table ------------------------------------------------
  const ShowroomBlock = ({ showroom }) => {
    const rows = orders.filter((o) => o.showroom === showroom.id && matchStatus(o))
    return (
      <div style={{ marginTop: 30 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontFamily: font.display, fontSize: 20, color: c.ink }}>{showroom.name}</span>
          <span style={{ fontSize: 12.5, color: c.muted }}>{showroom.city}</span>
          {showroom.flagship && (
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.brass, border: `1px solid ${c.line}`, borderRadius: 3, padding: '2px 7px' }}>Flagship</span>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: font.mono, fontSize: 12, color: c.muted }}>{rows.length} {rows.length === 1 ? 'order' : 'orders'}</span>
        </div>

        <div className="r-scroll-x" style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '11px 18px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
            {['Design · Colourway', 'Supplier', 'Sample', 'Ordered by', 'Date', 'Status'].map((h) => (
              <div key={h} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{h}</div>
            ))}
          </div>

          {rows.map((o) => {
            const label = ADVANCE_LABEL[o.status]
            return (
              <div key={o.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: '15px 18px', borderBottom: `1px solid ${c.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Swatch tone={o.tone} size={30} radius={5} />
                  <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.design} — {o.colourway}</span>
                </div>
                <span style={{ fontSize: 12.5, color: c.inkSoft, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.supplier}</span>
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>{o.qty} {o.kind}</span>
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>{o.orderedBy}</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>{o.date}</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <StatusPill tone={toneOf(o.status)}>{o.status}</StatusPill>
                  {label && (
                    <span onClick={() => advance(o.id)} className="ab-t"
                      style={{ fontSize: 11, color: c.accent, borderBottom: `1px solid ${c.accent}`, cursor: 'pointer' }}>
                      {label}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {rows.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: c.muted }}>
              No sample orders for this showroom{statusFilter === 'All' ? '' : ` at “${statusFilter}”`}.
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Sample service · Internal"
        title={<>Showroom <Em>Samples</Em></>}
        subtitle="Which brand samples each showroom has ordered for its display wall — from request through to on-stand."
      />

      {/* stat tiles */}
      <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: narrow ? 'repeat(2,1fr)' : 'repeat(4,1fr)', border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: c.surface }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ padding: '18px 22px', borderLeft: i && !(narrow && i % 2 === 0) ? `1px solid ${c.line}` : 'none', borderTop: narrow && i >= 2 ? `1px solid ${c.line}` : 'none' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: c.muted }}>{s.label}</div>
            <div style={{ marginTop: 8, fontFamily: font.display, fontWeight: 500, fontSize: 28, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* showroom selector */}
      <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SelectorCard id="All" title="All showrooms" sub="Every location" count={orders.length} />
        {showrooms.map((s) => (
          <SelectorCard key={s.id} id={s.id} title={s.name} sub={s.city} count={countFor(s.id)} />
        ))}
      </div>

      {/* status filter */}
      <div style={{ marginTop: 18 }}>
        <StatusPills />
      </div>

      {/* per-showroom tables */}
      {visible.map((s) => <ShowroomBlock key={s.id} showroom={s} />)}

      <div style={{ marginTop: 14 }}>
        <Indicative /> <span style={{ fontSize: 12, color: c.muted }}>Showroom sample stock — a display asset, no sale value. Advance a row to move it along the lifecycle.</span>
      </div>

      {toast && <Toast>{toast}</Toast>}
    </>
  )
}
