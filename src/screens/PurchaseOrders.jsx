import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { Indicative, Swatch, Toast } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { useAppStore } from '../store/AppStore.jsx'
import { shortDate } from '../store/records.js'
import { deriveBackorders } from '../utils/backorders.js'
import { printPackingSlip, packingSlipLines } from '../utils/packingSlip.js'
import { useCan } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'
import { MaskedFigure } from '../auth/guards.jsx'

const SYMBOL = { USD: 'US$', EUR: '€', GBP: '£' }
// Currency-aware money formatter (generalised from the old EUR-only euro()): '€1,920.00', 'US$48.00'.
const money = (currency) => (n) => `${SYMBOL[currency] || ''}${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function unitNum(s) {
  return parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0
}

// Unit € / Line € are supplier cost. Without finance.view the grid loses those two
// tracks entirely rather than blanking the cells — a column drawn and then hidden is
// still a column that shipped the figure. The metres, ETA and status a salesperson
// chases an order with all survive the drop (same trade as R-07 in reportPolicy).
const COLS = '118px 1fr 74px 74px 92px 72px 96px 92px'
const COLS_NO_COST = '118px 1fr 74px 74px 92px 92px'
const MIN_W = 920
const MIN_W_NO_COST = 728

// Seed-only origin/raised metadata (local — not in the data module). Used only when po.seeded.
const ORIGIN_CLIENT = 'Marlow & Finch'
const RAISED = { date: '28 May 2026', by: 'Rebecca' }
const otherShipments = [
  { po: 'PO-2026-0143', supplier: 'Manuel Canovas', ordered: 60, received: 0, out: 60, eta: '09 Jul', so: 'SO-2026-0411', client: 'McKenzie & Willis' },
  { po: 'PO-2026-0140', supplier: 'Larsen', ordered: 26, received: 0, out: 26, eta: '12 Jul', so: 'SO-2026-0418', client: 'Marlow & Finch' },
]

export default function PurchaseOrders() {
  const { id } = useParams()
  const { getPurchaseOrder } = useAppStore()
  const po = getPurchaseOrder(id)
  if (!po) {
    return <NotFound title="Purchase order not found" backTo="/purchase-orders" backLabel="Back to purchase orders" message="That purchase order could not be found — it may have been removed, or the link is out of date." />
  }
  // key={po.id} remounts the id-derived useState (lines/receipts) on param change.
  return <PurchaseOrderDetail key={po.id} po={po} />
}

function PurchaseOrderDetail({ po }) {
  const { updatePurchaseOrder } = useAppStore()
  // finance.view gates the cost tracks (Unit/Line) + the FX rate — same trade as reportPolicy R-07.
  const finance = useCan(CAPS.FINANCE_VIEW)
  const cols = finance ? COLS : COLS_NO_COST
  const minW = finance ? MIN_W : MIN_W_NO_COST
  const fmt = money(po.currency)
  const sym = SYMBOL[po.currency] || po.currency

  const [lines, setLines] = useState(() =>
    po.lines.map((l) => ({
      sku: l.sku,
      name: l.design,
      tone: l.tone,
      ordered: l.ordered,
      received: l.received,
      unit: unitNum(l.unit),
    })),
  )
  const [receipts, setReceipts] = useState(() =>
    po.receipts.map((r, i) => ({
      n: i + 1,
      label: r.note,
      sku: r.sku || '',
      qty: r.qty != null ? r.qty : null,
      date: r.date,
      seed: r.qty == null,
    })),
  )
  const [open, setOpen] = useState(null)
  const [recvQty, setRecvQty] = useState('')
  const [toast, setToast] = useState(null)
  const flash = (m) => {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  const openReceive = (l) => {
    setOpen(l.sku)
    setRecvQty(String(l.ordered - l.received))
  }
  const cancel = () => {
    setOpen(null)
    setRecvQty('')
  }
  const confirm = (sku) => {
    const line = lines.find((l) => l.sku === sku)
    const out = line.ordered - line.received
    let q = parseFloat(recvQty)
    if (isNaN(q) || q <= 0) {
      setOpen(null)
      setRecvQty('')
      return
    }
    q = Math.min(q, out)
    const date = po.seeded ? '19 Jun' : shortDate(new Date())
    setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, received: l.received + q } : l)))
    setReceipts((prev) => [...prev, { n: prev.length + 1, label: line.name, sku, qty: q, date, seed: false }])
    setOpen(null)
    setRecvQty('')
    // Created POs persist the received counts + receipt (record shape) so they survive reload.
    if (!po.seeded) {
      const recordLines = po.lines.map((l) => (l.sku === sku ? { ...l, received: l.received + q } : l))
      const recordReceipts = [...po.receipts, { note: line.name, sku, qty: q, date }]
      updatePurchaseOrder(po.id, { lines: recordLines, receipts: recordReceipts })
    }
  }

  const tOrd = lines.reduce((a, l) => a + l.ordered, 0)
  const tRec = lines.reduce((a, l) => a + l.received, 0)
  const tOut = tOrd - tRec
  const tLine = lines.reduce((a, l) => a + l.ordered * l.unit, 0)

  const statusLabel = tRec === 0 ? (po.status || 'Draft') : tOut > 0 ? 'Part-received' : 'Received in full'
  const statusColor = tOut > 0 && tRec > 0 ? c.clay : tOut === 0 ? c.sage : c.muted

  const shipments = [
    { po: po.number, supplier: po.supplier, ordered: tOrd, received: tRec, out: tOut, eta: po.eta, so: po.origin, client: po.seeded ? ORIGIN_CLIENT : '—', self: true },
    ...otherShipments,
  ]
  const soLink = (s) => (s.self && po.seeded && s.so && s.so !== '—' ? `/sales-orders/${s.so}` : '/sales-orders')

  // Back orders generated on receipt (decision 2): a line part-received but still short is on back
  // order for the balance. Derived from the live `lines` state, so it updates after each receipt.
  const selfClient = po.seeded ? ORIGIN_CLIENT : '—'
  const backorders = deriveBackorders(lines, { so: po.origin, client: selfClient })

  const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
  const num = { fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }

  return (
    <>
      {/* PageHeader */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: c.muted }}>
            Purchase Order
          </div>
          <h1 style={{ margin: '12px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 36, lineHeight: 1.05, letterSpacing: '-0.015em', color: c.ink }}>
            <span style={{ fontFamily: font.mono, fontSize: 27, fontWeight: 500 }}>{po.number}</span> — {po.supplier}
          </h1>
        </div>
        <span style={{ flex: 'none', marginTop: 6, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor, border: `1px solid ${c.line}`, borderRadius: 4, padding: '6px 12px' }}>
          {statusLabel}
        </span>
      </div>

      <SectionTabs tabs={ordersTabs} active="purchase" />

      {/* Defaulted-from-supplier panel */}
      <div style={{ marginTop: 28, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
            Defaulted from supplier — no re-keying
          </span>
          <Link to="/suppliers" className="ab-link ab-t" style={{ fontSize: 12, color: c.brass, borderBottom: `1px dotted ${c.brass}`, textDecoration: 'none' }}>
            Supplier master →
          </Link>
        </div>
        <div className="r-po-defaults" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '20px 32px' }}>
          <div>
            <div style={{ ...hCell, fontSize: 10, marginBottom: 5 }}>Supplier</div>
            <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{po.supplier}</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{po.city}, {po.country}</div>
          </div>
          <div>
            <div style={{ ...hCell, fontSize: 10, marginBottom: 5 }}>Currency · FX</div>
            <div style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{po.currency}</div>
            {/* The struck rate and the margin-inclusive rate together give up the forex buffer by
                division (2.2449 × 0.49 = 1.1) — the +10% the pricing engine treats as a cost step.
                Suppliers.jsx masks the same pair; the currency itself is not cost, so it stays. */}
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
              {finance ? `Indicative ${po.fx}` : <MaskedFigure label="FX rate" />}
            </div>
          </div>
          <div>
            <div style={{ ...hCell, fontSize: 10, marginBottom: 5 }}>Shipping agent</div>
            <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{po.agent}</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Incoterm {po.incoterm}</div>
          </div>
          <div>
            <div style={{ ...hCell, fontSize: 10, marginBottom: 5 }}>ETA</div>
            <div style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{po.eta ? `${po.eta} 2026` : '—'}</div>
          </div>
          <div>
            <div style={{ ...hCell, fontSize: 10, marginBottom: 5 }}>Origin sales order</div>
            {po.seeded ? (
              <>
                <Link to={`/sales-orders/${po.origin}`} className="ab-link" style={{ fontFamily: font.mono, fontSize: 13, color: c.accent, textDecoration: 'none' }}>
                  {po.origin}
                </Link>
                <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{ORIGIN_CLIENT}</div>
              </>
            ) : (
              <div style={{ fontFamily: font.mono, fontSize: 13, color: c.muted }}>—</div>
            )}
          </div>
          <div>
            <div style={{ ...hCell, fontSize: 10, marginBottom: 5 }}>Raised</div>
            {po.seeded ? (
              <>
                <div style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{RAISED.date}</div>
                <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>by {RAISED.by}</div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{shortDate(po.createdAt ? new Date(po.createdAt) : new Date())} 2026</div>
                <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>by Liz</div>
              </>
            )}
          </div>
          {po.tracking && (
            <div>
              <div style={{ ...hCell, fontSize: 10, marginBottom: 5 }}>Tracking · supplier</div>
              <div style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{po.tracking.carrier}</div>
              <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{po.tracking.supplierRef} · customer ref at dispatch</div>
            </div>
          )}
        </div>
      </div>

      {/* Order lines table */}
      <div style={{ marginTop: 36 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Order lines</div>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>{finance ? `Metres · ${po.currency} · Indicative` : 'Metres'}</div>
        </div>
        <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflowX: 'auto' }}>
          {/* header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', minWidth: minW, padding: '11px 18px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
            <div style={hCell}>SKU</div>
            <div style={hCell}>Design / Colourway</div>
            <div style={{ ...hCell, textAlign: 'right' }}>Ordered</div>
            <div style={{ ...hCell, textAlign: 'right' }}>Received</div>
            <div style={{ ...hCell, textAlign: 'right' }}>Outstanding</div>
            {finance && <div style={{ ...hCell, textAlign: 'right' }}>Unit {sym}</div>}
            {finance && <div style={{ ...hCell, textAlign: 'right' }}>Line {sym}</div>}
            <div />
          </div>

          {lines.map((l) => {
            const out = l.ordered - l.received
            const isOpen = open === l.sku
            return (
              <div key={l.sku}>
                <div className="ab-rowhover" style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', minWidth: minW, padding: '15px 18px', borderBottom: `1px solid ${c.line}`, background: isOpen ? '#F3EADF' : 'transparent' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.inkSoft }}>{l.sku}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <Swatch tone={l.tone} size={26} radius={4} />
                    <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                  </div>
                  <div style={num}>{l.ordered} m</div>
                  <div style={num}>{l.received} m</div>
                  <div style={{ ...num, color: out > 0 ? c.clay : c.sage, fontWeight: 500 }}>{out} m</div>
                  {finance && <div style={{ ...num, fontSize: 12.5, color: c.inkSoft }}>{fmt(l.unit)}</div>}
                  {finance && <div style={num}>{fmt(l.ordered * l.unit)}</div>}
                  <div style={{ textAlign: 'right' }}>
                    {out > 0 && !isOpen && (
                      <button className="ab-secondary ab-t" onClick={() => openReceive(l)} style={{ fontSize: 11.5, color: c.accent, background: 'transparent', border: `1px solid ${c.accent}`, borderRadius: 4, padding: '5px 11px', cursor: 'pointer' }}>
                        Receive
                      </button>
                    )}
                    {out === 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: c.sage }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.sage }} />Complete
                      </span>
                    )}
                  </div>
                </div>

                {/* inline receiving row */}
                {isOpen && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: minW, padding: '16px 18px 16px 47px', borderBottom: `1px solid ${c.line}`, background: '#F3EADF' }}>
                    <span style={{ ...hCell, fontSize: 10 }}>Receive against {l.sku}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        value={recvQty}
                        onChange={(e) => setRecvQty(e.target.value.replace(/[^0-9.]/g, ''))}
                        style={{ width: 72, height: 36, border: `1px solid ${c.brass}`, borderRadius: 4, background: c.paper, padding: '0 10px', fontFamily: font.mono, fontSize: 14, color: c.ink, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 13, color: c.inkSoft }}>
                        m of <span style={{ fontFamily: font.mono }}>{out} m</span> outstanding
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
                      Any balance stays on this PO — never forced onto a new one.
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 9 }}>
                      <button className="ab-t" onClick={cancel} style={{ height: 36, padding: '0 14px', background: c.paper, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 4, fontSize: 12.5, cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button className="ab-primary ab-t" onClick={() => confirm(l.sku)} style={{ height: 36, padding: '0 16px', background: c.accent, color: c.paper, border: 'none', borderRadius: 4, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                        Confirm receipt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* totals */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', minWidth: minW, padding: '13px 18px', background: c.surface }}>
            <div />
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{finance ? 'Totals · Indicative' : 'Totals'}</div>
            <div style={{ ...num, fontWeight: 500 }}>{tOrd} m</div>
            <div style={{ ...num, fontWeight: 500 }}>{tRec} m</div>
            <div style={{ ...num, color: tOut > 0 ? c.clay : c.sage, fontWeight: 500 }}>{tOut} m</div>
            {finance && <div />}
            {finance && <div style={{ ...num, fontWeight: 500 }}>{fmt(tLine)}</div>}
            <div />
          </div>
        </div>
      </div>

      {/* Receipts log */}
      <div style={{ marginTop: 30 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 12 }}>
          Receipts · accumulating
        </div>
        <div style={{ borderTop: `1px solid ${c.line}` }}>
          {receipts.length === 0 && (
            <div style={{ padding: '14px 4px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No receipts yet — receive a line above.</div>
          )}
          {receipts.map((r) => (
            <div key={r.n} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', gap: 18, alignItems: 'center', padding: '12px 4px', borderBottom: `1px solid ${c.line}` }}>
              <span style={{ fontSize: 12.5, color: c.ink }}>Receipt {r.n}</span>
              <span style={{ fontSize: 12.5, color: c.inkSoft }}>
                {r.label} {r.sku && <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{r.sku}</span>}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 13, color: c.sage }}>
                {r.qty != null ? `+${r.qty} m` : 'received'}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>{r.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Back orders — generated on receipt (decision 2, 15 Jul) */}
      <div style={{ marginTop: 30 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
            Back orders · generated on receipt
          </div>
          <div style={{ fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
            A line part-received but still short goes on back order for the balance
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${c.line}` }}>
          {backorders.length === 0 ? (
            <div style={{ padding: '14px 4px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
              No back orders — nothing part-received and short.
            </div>
          ) : (
            backorders.map((b) => (
              <div key={b.sku} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', gap: 18, alignItems: 'center', padding: '12px 4px', borderBottom: `1px solid ${c.line}` }}>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft }}>{b.sku}</span>
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>
                  {b.design}
                  {b.so && b.so !== '—' && (
                    <>
                      {' · '}
                      <Link to={po.seeded ? `/sales-orders/${b.so}` : '/sales-orders'} className="ab-link" style={{ fontFamily: font.mono, fontSize: 11, color: c.accent, textDecoration: 'none' }}>{b.so}</Link>
                      <span style={{ color: c.muted }}> · {b.client}</span>
                    </>
                  )}
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: c.clay, fontWeight: 500 }}>{b.qty} m short</span>
                <span style={{ fontSize: 11, color: c.muted, letterSpacing: '0.04em' }}>{b.status}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Document actions */}
      <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="ab-primary ab-t" style={{ height: 44, padding: '0 22px', background: c.accent, color: c.paper, border: 'none', borderRadius: 4, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
          Confirm receipt
        </button>
        <button className="ab-t" style={{ height: 42, padding: '0 18px', background: c.paper, color: c.ink, border: `1px solid ${c.ink}`, borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Save draft
        </button>
      </div>

      {/* Outstanding shipments band */}
      <div style={{ marginTop: 48 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
            Outstanding shipments
          </div>
          <div style={{ fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
            Packing slips are generated here at dispatch — not at order entry
          </div>
        </div>
        <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 70px 70px 88px 110px 1.2fr', gap: 14, alignItems: 'center', minWidth: 900, padding: '11px 18px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
            <div style={hCell}>PO</div>
            <div style={hCell}>Supplier</div>
            <div style={{ ...hCell, textAlign: 'right' }}>Ord</div>
            <div style={{ ...hCell, textAlign: 'right' }}>Rec</div>
            <div style={{ ...hCell, textAlign: 'right' }}>Outst.</div>
            <div style={hCell}>ETA</div>
            <div style={hCell}>Origin sales order</div>
          </div>
          {shipments.map((s) => (
            <div key={s.po} className="ab-rowhover" style={{ display: 'grid', gridTemplateColumns: '150px 1fr 70px 70px 88px 110px 1.2fr', gap: 14, alignItems: 'center', minWidth: 900, padding: '14px 18px', borderBottom: `1px solid ${c.line}`, background: s.self ? '#F3EADF' : 'transparent' }}>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft }}>{s.po}</span>
              <span style={{ fontSize: 13, color: c.ink }}>{s.supplier}</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink, textAlign: 'right' }}>{s.ordered} m</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink, textAlign: 'right' }}>{s.received} m</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: s.out > 0 ? c.clay : c.sage, textAlign: 'right', fontWeight: 500 }}>{s.out} m</span>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>{s.eta || '—'}</span>
              <span style={{ fontSize: 12.5 }}>
                <Link to={soLink(s)} className="ab-link" style={{ fontFamily: font.mono, fontSize: 12, color: c.accent, textDecoration: 'none' }}>{s.so}</Link>
                <span style={{ color: c.muted }}> · {s.client}</span>
                {s.received > 0 && (
                  <span onClick={() => {
                    // Packing slip lists ONLY the lines currently shipping (decision 2). The self row
                    // prints the live PO lines; other rows stay as a toast (their lines aren't loaded here).
                    if (s.self) {
                      const ok = printPackingSlip({ poNumber: po.number, supplier: po.supplier, so: s.so, client: s.client, lines })
                      flash(ok
                        ? `Packing slip opened — ${packingSlipLines(lines).length} line(s) shipping to ${s.client}.`
                        : 'Allow pop-ups to open the packing slip.')
                    } else {
                      flash(`Packing slip generated for ${s.client} — ${s.received} m received against ${s.so}.`)
                    }
                  }}
                    className="ab-t" style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: c.accent, cursor: 'pointer' }}>
                    Generate packing slip →
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <Indicative />
        </div>
      </div>

      {toast && <Toast>{toast}</Toast>}
    </>
  )
}
