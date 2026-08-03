import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, PrimaryButton, SecondaryButton, Swatch, Indicative } from '../components/ui.jsx'
import { FormField, SelectInput, TextInput } from '../components/form.jsx'
import { IconSearch } from '../components/icons.jsx'
import { suppliers } from '../data/suppliers.js'
import { designLibrary, buildPurchaseOrder } from '../store/records.js'
import { useAppStore } from '../store/AppStore.jsx'

const SYMBOL = { USD: 'US$', EUR: '€', GBP: '£' }
const money = (currency, n) => `${SYMBOL[currency] || ''}${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hCell = { fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginBottom: 5 }

export default function PurchaseOrderNew() {
  const navigate = useNavigate()
  const { purchaseOrders, addPurchaseOrder } = useAppStore()

  const [supplierId, setSupplierId] = useState(suppliers[0].id)
  const supplier = suppliers.find((s) => s.id === supplierId) || suppliers[0]
  const [eta, setEta] = useState('')
  const [lines, setLines] = useState([])
  const [errors, setErrors] = useState({})

  // line builder
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [pending, setPending] = useState(null)
  const [ordered, setOrdered] = useState('')
  const [unitPrice, setUnitPrice] = useState('48.00')

  const lib = useMemo(() => designLibrary(), [])
  // Prefer this supplier's designs; fall back to the whole library if none map (e.g. Loro Piana, JV).
  const forSupplier = lib.filter((o) => o.supplier === supplier.name)
  const pool = forSupplier.length ? forSupplier : lib
  const q = query.trim().toLowerCase()
  const matches = q ? pool.filter((o) => o.label.toLowerCase().includes(q) || o.sku.toLowerCase().includes(q)) : pool.slice(0, 8)

  const changeSupplier = (id) => {
    setSupplierId(id)
    setLines([])
    setPending(null)
    setQuery('')
  }
  const pick = (opt) => {
    setPending(opt)
    setQuery('')
    setFocused(false)
    setOrdered('')
    setUnitPrice('48.00')
  }
  const addLine = () => {
    const m = parseFloat(String(ordered).replace(/[^0-9.]/g, ''))
    const up = parseFloat(String(unitPrice).replace(/[^0-9.]/g, ''))
    if (!pending || !m || m <= 0) return
    // A PO carries one row per SKU: re-adding a SKU merges into (sums) the existing line rather
    // than creating a duplicate — duplicate SKUs would collide on the detail screen's receive-by-SKU flow.
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.sku === pending.sku)
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, ordered: l.ordered + m } : l))
      return [...prev, { design: pending.design, colourway: pending.colourway, sku: pending.sku, tone: pending.tone, ordered: m, unit: up > 0 ? up : 48 }]
    })
    setPending(null)
    setOrdered('')
    setUnitPrice('48.00')
    if (errors.lines) setErrors((e) => ({ ...e, lines: undefined }))
  }
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const submit = () => {
    const errs = {}
    if (!supplier) errs.supplier = 'Select a supplier.'
    if (lines.length === 0) errs.lines = 'Add at least one line.'
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    const po = buildPurchaseOrder({ eta, lines }, purchaseOrders.map((p) => p.number), supplier)
    addPurchaseOrder(po)
    navigate(`/purchase-orders/${po.id}`)
  }

  const inputBorder = focused ? c.brass : c.line
  const showDrop = focused && !pending
  const cur = supplier.currency
  const totalForeign = lines.reduce((a, l) => a + l.ordered * l.unit, 0)

  return (
    <>
      <PageHeader
        eyebrow="Orders · New"
        title="New Purchase Order"
        right={<SecondaryButton onClick={() => navigate('/purchase-orders')} style={{ whiteSpace: 'nowrap' }}>Cancel</SecondaryButton>}
      />

      <div style={{ maxWidth: 860, marginTop: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <FormField label="Supplier" error={errors.supplier}>
            <SelectInput value={supplierId} onChange={changeSupplier} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} ariaLabel="Supplier" />
          </FormField>
          <FormField label="ETA" hint="e.g. 20 Jul">
            <TextInput value={eta} onChange={setEta} placeholder="20 Jul" ariaLabel="ETA" />
          </FormField>
        </div>

        {/* Defaulted-from-supplier panel */}
        <div style={{ marginTop: 8, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '20px 24px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 18 }}>
            Defaulted from supplier — no re-keying
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '20px 32px' }}>
            <div>
              <div style={hCell}>Supplier</div>
              <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{supplier.name}</div>
              <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{supplier.city}, {supplier.country}</div>
            </div>
            <div>
              <div style={hCell}>Currency</div>
              <div style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{supplier.currency}</div>
              <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Indicative FX</div>
            </div>
            <div>
              <div style={hCell}>Shipping agent</div>
              <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{supplier.agent}</div>
              <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Incoterm {supplier.incoterm}</div>
            </div>
            <div>
              <div style={hCell}>PO email</div>
              <div style={{ fontSize: 12.5, color: c.inkSoft, wordBreak: 'break-all' }}>{supplier.poEmail}</div>
            </div>
          </div>
        </div>

        {/* Add line type-ahead */}
        <div style={{ marginTop: 26, position: 'relative' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 10 }}>Add line</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', border: `1px solid ${inputBorder}`, borderRadius: 4, background: c.paper, transition: 'border-color .15s' }}>
            <IconSearch size={16} color={c.brass} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 140)}
              placeholder={`Search ${supplier.name} designs — validated against the library`}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: c.ink, fontFamily: font.ui }}
            />
            <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>No free codes</span>
          </div>

          {showDrop && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 74, zIndex: 30, background: c.paper, border: `1px solid ${c.line}`, borderRadius: 4, boxShadow: '0 10px 30px rgba(51,49,43,.14)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
              {matches.map((m) => (
                <button
                  key={m.sku}
                  className="ab-rowhover ab-t"
                  onMouseDown={(e) => { e.preventDefault(); pick(m) }}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  <Swatch tone={m.tone} size={28} radius={4} />
                  <span style={{ fontSize: 13, color: c.ink }}>{m.label}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{m.sku}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: c.muted }}>{m.brand}</span>
                </button>
              ))}
              {matches.length === 0 && (
                <div style={{ padding: 14, fontSize: 12.5, color: c.clay }}>No match — select a design from the library.</div>
              )}
            </div>
          )}

          {pending && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${c.brass}`, borderRadius: 4, background: '#F3EADF', padding: '12px 14px' }}>
              <Swatch tone={pending.tone} size={30} radius={4} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink }}>{pending.label}</div>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{pending.sku}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={ordered} onChange={(e) => setOrdered(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') addLine() }} autoFocus aria-label="Ordered metres" placeholder="0"
                    style={{ width: 60, height: 38, textAlign: 'right', border: `1px solid ${c.brass}`, borderRadius: 4, background: c.paper, padding: '0 10px', fontFamily: font.mono, fontSize: 14, color: c.ink }} />
                  <span style={{ fontSize: 13, color: c.inkSoft }}>m</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: c.muted }}>{SYMBOL[cur] || cur}</span>
                  <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') addLine() }} aria-label="Unit price"
                    style={{ width: 72, height: 38, textAlign: 'right', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, padding: '0 10px', fontFamily: font.mono, fontSize: 14, color: c.ink }} />
                  <span style={{ fontSize: 12, color: c.muted }}>/m</span>
                </label>
                <button className="ab-primary ab-t" onClick={addLine} style={{ height: 38, padding: '0 16px', background: c.accent, color: c.paper, border: 'none', borderRadius: 4, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Add line</button>
                <button className="ab-t" onClick={() => { setPending(null); setOrdered('') }} style={{ height: 38, padding: '0 12px', background: c.paper, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 4, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Lines */}
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Order lines</span>
            <span style={{ flex: 1, height: 1, background: c.line }} />
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{lines.length} lines · {money(cur, totalForeign)}</span>
          </div>
          {errors.lines && <div style={{ fontSize: 12, color: c.clay, marginBottom: 8 }}>{errors.lines}</div>}
          {lines.length === 0 && !errors.lines && (
            <div style={{ fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display, padding: '14px 2px' }}>No lines yet — search {supplier.name}'s designs above to add one.</div>
          )}
          {lines.map((l, i) => (
            <div key={`${l.sku}-${i}`} className="ab-rowhover ab-t" style={{ display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) 80px 96px 110px 28px', gap: 14, alignItems: 'center', borderBottom: `1px solid ${c.line}`, padding: '14px 8px', margin: '0 -8px' }}>
              <Swatch tone={l.tone} size={34} radius={5} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink }}>{l.design} — {l.colourway}</div>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, marginTop: 3 }}>{l.sku}</div>
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{l.ordered} m</div>
              <div style={{ fontFamily: font.mono, fontSize: 12.5, color: c.inkSoft, textAlign: 'right' }}>{money(cur, l.unit)}</div>
              <div style={{ fontFamily: font.mono, fontSize: 13.5, color: c.ink, textAlign: 'right' }}>{money(cur, l.unit * l.ordered)}</div>
              <button onClick={() => removeLine(i)} aria-label="Remove line" className="ab-t" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: c.muted, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
          <PrimaryButton onClick={submit}>Create purchase order</PrimaryButton>
          <SecondaryButton onClick={() => navigate('/purchase-orders')}>Cancel</SecondaryButton>
          <span style={{ marginLeft: 'auto' }}><Indicative /></span>
        </div>
      </div>
    </>
  )
}
