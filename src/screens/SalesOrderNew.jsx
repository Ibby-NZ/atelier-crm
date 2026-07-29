import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, PrimaryButton, SecondaryButton, Swatch, Indicative } from '../components/ui.jsx'
import { FormField, SelectInput, TextInput } from '../components/form.jsx'
import { IconSearch } from '../components/icons.jsx'
import { team, computeOrderTotals } from '../data/atelier.js'
import { designLibrary, orderFromLines, buildSalesOrder } from '../store/records.js'
import { useAppStore } from '../store/AppStore.jsx'

function fmt(n) {
  return 'NZ$' + Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SalesOrderNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { clients, salesOrders, addSalesOrder } = useAppStore()

  const preClient = searchParams.get('client')
  const [clientId, setClientId] = useState(
    preClient && clients.some((c) => c.id === preClient) ? preClient : clients[0]?.id || '',
  )
  const [project, setProject] = useState('')
  const [salesperson, setSalesperson] = useState(team[team.length - 1])
  const [lines, setLines] = useState([])
  const [errors, setErrors] = useState({})

  // type-ahead over the validated design library
  const lib = useMemo(() => designLibrary(), [])
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [pending, setPending] = useState(null) // picked option awaiting a quantity
  const [qty, setQty] = useState('')

  const client = clients.find((cl) => cl.id === clientId) || null
  const clientOptions = clients.map((cl) => ({ value: cl.id, label: `${cl.name} · ${cl.type}` }))

  const q = query.trim().toLowerCase()
  const matches = q
    ? lib.filter((o) => o.label.toLowerCase().includes(q) || o.sku.toLowerCase().includes(q))
    : lib.slice(0, 8)

  const pick = (opt) => {
    setPending(opt)
    setQuery('')
    setFocused(false)
    setQty('')
  }
  const addLine = () => {
    const m = parseFloat(String(qty).replace(/[^0-9.]/g, ''))
    if (!pending || !m || m <= 0) return
    // Re-adding a SKU merges into (sums) the existing line so line SKUs stay unique (stable React keys).
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.sku === pending.sku)
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, qty: l.qty + m } : l))
      return [...prev, { design: pending.design, colourway: pending.colourway, sku: pending.sku, tone: pending.tone, unit: pending.unit, qty: m }]
    })
    setPending(null)
    setQty('')
    if (errors.lines) setErrors((e) => ({ ...e, lines: undefined }))
  }
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const previewOrder = orderFromLines(lines, client)
  const t = computeOrderTotals(previewOrder)

  const submit = () => {
    const errs = {}
    if (!client) errs.client = 'Select a client.'
    if (lines.length === 0) errs.lines = 'Add at least one line.'
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    const order = buildSalesOrder(
      { project, salesperson, lines },
      salesOrders.map((o) => o.number),
      client,
    )
    addSalesOrder(order)
    navigate(`/sales-orders/${order.id}`)
  }

  const inputBorder = focused ? c.brass : c.line
  const showDrop = focused && !pending

  return (
    <>
      <PageHeader
        eyebrow="Orders · New"
        title="New Sales Order"
        right={<SecondaryButton onClick={() => navigate('/sales-orders')} style={{ whiteSpace: 'nowrap' }}>Cancel</SecondaryButton>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 332px', gap: 44, alignItems: 'start', marginTop: 28 }}>
        {/* LEFT: composer */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <FormField label="Client" error={errors.client}>
              <SelectInput value={clientId} onChange={setClientId} options={clientOptions} ariaLabel="Client" />
            </FormField>
            <FormField label="Salesperson">
              <SelectInput value={salesperson} onChange={setSalesperson} options={team} ariaLabel="Salesperson" />
            </FormField>
          </div>
          <FormField label="Project">
            <TextInput value={project} onChange={setProject} placeholder="e.g. Hāwera — Master Suite" ariaLabel="Project" />
          </FormField>

          {/* Add item type-ahead */}
          <div style={{ marginTop: 18, position: 'relative' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 10 }}>Add item</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', border: `1px solid ${inputBorder}`, borderRadius: 3, background: c.paper, transition: 'border-color .15s' }}>
              <IconSearch size={16} color={c.brass} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 140)}
                placeholder="Search design or colourway — validated against the library"
                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: c.ink, fontFamily: font.ui }}
              />
              <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>No free codes</span>
            </div>

            {showDrop && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 74, zIndex: 30, background: c.paper, border: `1px solid ${c.line}`, borderRadius: 4, boxShadow: '0 10px 30px rgba(33,28,23,.14)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
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
                    <span style={{ marginLeft: 'auto', fontFamily: font.mono, fontSize: 12, color: c.inkSoft }}>{m.price}</span>
                  </button>
                ))}
                {matches.length === 0 && (
                  <div style={{ padding: 14, fontSize: 12.5, color: c.clay }}>No match — select a design from the library. Free-text codes aren’t accepted.</div>
                )}
              </div>
            )}

            {/* pending pick → enter quantity */}
            {pending && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${c.brass}`, borderRadius: 3, background: '#F3EADF', padding: '12px 14px' }}>
                <Swatch tone={pending.tone} size={30} radius={4} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink }}>{pending.label}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{pending.sku} · {pending.price} /m</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={qty}
                    onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') addLine() }}
                    autoFocus
                    aria-label="Quantity in metres"
                    placeholder="0"
                    style={{ width: 64, height: 38, textAlign: 'right', border: `1px solid ${c.brass}`, borderRadius: 3, background: c.paper, padding: '0 10px', fontFamily: font.mono, fontSize: 14, color: c.ink }}
                  />
                  <span style={{ fontSize: 13, color: c.inkSoft }}>m</span>
                  <button className="ab-primary ab-t" onClick={addLine} style={{ height: 38, padding: '0 16px', background: c.accent, color: c.paper, border: 'none', borderRadius: 3, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Add line</button>
                  <button className="ab-t" onClick={() => { setPending(null); setQty('') }} style={{ height: 38, padding: '0 12px', background: c.paper, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 3, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Added lines */}
          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Order lines</span>
              <span style={{ flex: 1, height: 1, background: c.line }} />
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{lines.length} lines</span>
            </div>
            {errors.lines && <div style={{ fontSize: 12, color: c.clay, marginBottom: 8 }}>{errors.lines}</div>}
            {lines.length === 0 && !errors.lines && (
              <div style={{ fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display, padding: '14px 2px' }}>No lines yet — search the library above to add one.</div>
            )}
            {lines.map((l, i) => (
              <div key={`${l.sku}-${i}`} className="ab-rowhover ab-t" style={{ display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) 90px 110px 28px', gap: 16, alignItems: 'center', borderBottom: `1px solid ${c.line}`, padding: '14px 8px', margin: '0 -8px' }}>
                <Swatch tone={l.tone} size={34} radius={5} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink }}>{l.design} — {l.colourway}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, marginTop: 3 }}>{l.sku}</div>
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{l.qty} m</div>
                <div style={{ fontFamily: font.mono, fontSize: 13.5, color: c.ink, textAlign: 'right' }}>{fmt(l.unit * l.qty)}</div>
                <button onClick={() => removeLine(i)} aria-label="Remove line" className="ab-t" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: c.muted, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: live summary */}
        <aside style={{ border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '24px 24px 26px', position: 'sticky', top: 20 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Order summary</div>
          <div style={{ marginTop: 4, fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Live · all figures indicative · supplied in metres (m)</div>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: c.inkSoft }}>Subtotal <span style={{ fontSize: 11, color: c.muted }}>(Trade)</span></span>
              <span style={{ fontFamily: font.mono, fontSize: 13.5, color: c.ink }}>{fmt(t.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: c.inkSoft }}>
                Discount
                <span style={{ fontSize: 11, color: c.muted }}> ({t.qualifies ? `Tier ${client?.tier || 1} · over ${previewOrder.volumeThreshold} m` : 'none — under threshold'})</span>
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 13.5, color: t.discount > 0 ? c.clay : c.muted }}>−{fmt(t.discount)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: c.inkSoft }}>Freight</span>
              <span style={{ fontFamily: font.mono, fontSize: 13.5, color: c.ink }}>{fmt(t.freight)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: c.inkSoft }}>GST 15%</span>
              <span style={{ fontFamily: font.mono, fontSize: 13.5, color: c.ink }}>{fmt(t.gst)}</span>
            </div>
          </div>

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>Order total</div>
              <div style={{ marginTop: 3 }}><Indicative /> <span style={{ fontSize: 11, color: c.muted }}>· incl GST</span></div>
            </div>
            <div style={{ fontFamily: font.display, fontWeight: 500, fontSize: 30, letterSpacing: '-0.01em', color: c.accent }}>{fmt(t.total)}</div>
          </div>

          <div style={{ marginTop: 24 }}>
            <PrimaryButton onClick={submit} style={{ width: '100%' }}>Create draft order</PrimaryButton>
          </div>
        </aside>
      </div>
    </>
  )
}
