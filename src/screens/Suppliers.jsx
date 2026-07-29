import { useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, Em, StatusPill, Indicative } from '../components/ui.jsx'
import { suppliers, supplierById } from '../data/suppliers.js'
import { fxLine } from '../data/fx.js'
import { chainLabel, applyDiscountChain } from '../data/discounts.js'
import { useCan } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'
import { LockedPanel, MaskedFigure } from '../auth/guards.jsx'

// Supplier master (GEN-05): one supplier, many brands — each brand with its own discount
// structure or retail markup, plus the PO defaults (agent / currency / PO email) that flow onto
// purchase orders. Agents, currencies and PO emails are INDICATIVE until A13 lands.

const pctOf = (f) => `${Math.round(f * 100)}%`

function DefaultsCell({ label, main, sub, mono = false, last = false }) {
  return (
    <div style={{ padding: '16px 18px', borderRight: last ? 'none' : `1px solid ${c.line}` }} className="r-def-cell">
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{label}</div>
      <div style={{ marginTop: 7, fontFamily: mono ? font.mono : font.display, fontSize: mono ? 13 : 17, color: c.ink, wordBreak: 'break-word' }}>{main}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: c.muted, fontFamily: font.mono, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

function TermRow({ label, value, accent = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${c.line}` }}>
      <span style={{ fontSize: 12.5, color: c.inkSoft }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 13, color: accent ? c.accent : c.ink }}>{value}</span>
    </div>
  )
}

// One row (or a row plus tier sub-rows) per brand in the house.
// `rateFree` marks a Terms value that states the METHOD without quoting a rate — a tier
// count or "price already net" survives the mask; every other value is the rate itself.
// The chain note carries its rate in prose (×0.36 net, "40% off then 40% off"), so it
// needs a masked twin — dropping the number would otherwise leave the sentence lying.
function BrandRow({ supplier: s, brand: b, finance }) {
  const cell = (() => {
    if (b.discountTiers) return { value: `${b.discountTiers.length} discount tiers`, accent: true, note: 'Tier by collection/category — see below', rateFree: true }
    if (b.discountChain) return { value: `${chainLabel(b.discountChain)}`, accent: true, note: b.note || `Compounded — ×${(applyDiscountChain(1, b.discountChain)).toFixed(2)} net`, maskedNote: 'Compounded chain — sequential rates, not a single discount' }
    if (b.discount != null) return { value: `−${Math.round(b.discount * 100)}%`, note: 'Flat per-brand discount' }
    if (b.markup != null) return { value: `×${b.markup}`, note: 'Per-brand retail markup · discount at supplier average' }
    if (s.terms.discountIncluded) return { value: 'Price already net', note: 'Discount-inclusive price list — P2 skipped', rateFree: true }
    return { value: `Supplier average −${Math.round((s.terms.net || 0) * 100)}%`, note: 'Averaged default (9 Jul rule)' }
  })()
  const showValue = finance || cell.rateFree
  const note = finance ? cell.note : (cell.maskedNote || cell.note)
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.6fr', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${c.line}`, minWidth: 560 }}>
        <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
          {b.name}
          {b.indicative && <Indicative />}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: cell.accent ? c.accent : c.ink }}>{showValue ? cell.value : <MaskedFigure label="Discount terms" />}</span>
        <span style={{ fontSize: 11.5, color: c.muted }}>{note}</span>
      </div>
      {(b.discountTiers || []).map((t) => (
        <div key={t.label} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.6fr', gap: 12, alignItems: 'center', padding: '9px 16px 9px 34px', borderBottom: `1px solid ${c.line}`, background: c.paper, minWidth: 560 }}>
          <span style={{ fontSize: 12.5, color: c.inkSoft }}>{t.label}</span>
          <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink }}>{finance ? `−${Math.round(t.pct * 100)}%` : <MaskedFigure label="Tier discount" />}</span>
          <span style={{ fontSize: 11.5, color: c.muted }}>{t.label === 'All other collections' ? 'Fallback tier' : ''}</span>
        </div>
      ))}
    </>
  )
}

export default function Suppliers() {
  const [sel, setSel] = useState(suppliers[0].id)
  const s = supplierById(sel) || suppliers[0]
  const finance = useCan(CAPS.FINANCE_VIEW)

  return (
    <>
      <PageHeader
        eyebrow="Supplier master · GEN-05"
        title={<>One supplier, <Em>many brands</Em></>}
        subtitle="Brand roll-ups, discount methods and PO defaults per supplier. Agents, currencies and PO emails are indicative until A13 lands."
      />

      <div className="r-ops-2col" style={{ marginTop: 30, display: 'grid', gridTemplateColumns: '210px 1fr', gap: 32, alignItems: 'start' }}>
        {/* supplier rail */}
        <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>Supplier</div>
          {suppliers.map((row) => {
            const on = row.id === sel
            return (
              <div key={row.id} onClick={() => setSel(row.id)} className="ab-t"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer', background: on ? c.surface : 'transparent' }}>
                <span style={{ width: 2, height: 26, borderRadius: 2, background: on ? c.accent : 'transparent', flex: 'none' }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, color: on ? c.ink : c.inkSoft, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
                    {row.brands.length > 1 && (
                      <span style={{ fontFamily: font.mono, fontSize: 9, letterSpacing: '0.1em', color: c.brass, border: `1px solid ${c.line}`, borderRadius: 3, padding: '1px 5px', flex: 'none' }}>HOUSE</span>
                    )}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: c.muted, marginTop: 2 }}>
                    {row.brands.length} brand{row.brands.length > 1 ? 's' : ''} · {row.currency}
                  </span>
                </span>
              </div>
            )
          })}
        </div>

        {/* supplier detail */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: font.display, fontSize: 24, color: c.ink }}>{s.name}</div>
              <div style={{ fontSize: 12.5, color: c.muted, marginTop: 3 }}>{s.city}, {s.country} · {s.brands.length} brand{s.brands.length > 1 ? 's' : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {s.terms.method === 'per-brand'
                ? <StatusPill tone="clay">Per-brand exception</StatusPill>
                : <StatusPill tone="sage">Averaged default</StatusPill>}
              {s.terms.discountIncluded
                ? <StatusPill tone="sage">Discount-inclusive prices</StatusPill>
                : <StatusPill tone="muted">Discount to be taken</StatusPill>}
            </div>
          </div>

          {/* PO defaults — what flows onto purchase orders for this supplier */}
          <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>Defaulted onto purchase orders</span>
              {s.indicativeDefaults && (
                <span style={{ fontSize: 11, color: c.brass, fontStyle: 'italic', fontFamily: font.display }}>Indicative — real defaults owed under A13</span>
              )}
            </div>
            <div className="r-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {/* The currency a house bills in is workflow; the struck rate and the forex margin
                  riding on it are cost, so the cell keeps its head and loses its line. */}
              <DefaultsCell label="Currency · FX" main={s.currency} sub={finance ? fxLine(s.currency) : <MaskedFigure label="FX rate" />} />
              <DefaultsCell label="Shipping agent" main={s.agent} sub={`Incoterm ${s.incoterm}`} />
              <DefaultsCell label="PO email" main={s.poEmail} sub="Default PO destination" mono last />
            </div>
          </div>

          {/* Discount terms — every row of this panel is a rate Atelier pays, down to the
              averaged-from breakdown, so it locks whole rather than masking row by row: a
              frame of ―― tells the reader nothing the missing panel doesn't. The method
              still reaches a User through the pills above and the resolution note below. */}
          {finance ? (
            <div style={{ marginTop: 22, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>Supplier discount terms · P2</div>
              <TermRow label="List terms" value={pctOf(s.terms.list || 0)} />
              <TermRow label="Averaged net" value={s.terms.net == null ? '— (per-brand)' : pctOf(s.terms.net)} accent={s.terms.net != null} />
              {s.terms.averagedFrom && (
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${c.line}`, fontSize: 11.5, color: c.muted }}>
                  Averaged from: {s.terms.averagedFrom.map((a) => `${a.label} ${pctOf(a.pct)}`).join(' · ')}
                </div>
              )}
              {s.terms.note && (
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${c.line}`, fontSize: 12, color: c.inkSoft, fontStyle: 'italic', fontFamily: font.display }}>{s.terms.note}</div>
              )}
              {s.terms.excluded && (
                <div style={{ padding: '10px 14px', fontSize: 12, color: c.clay }}>
                  Excluded from the averaged default — handled per brand by exception (9 Jul rule)
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 22 }}>
              <LockedPanel
                title="Supplier discount terms are cost"
                reason="List terms, the averaged net rate and the brands it averages from are what Atelier pays this house. There is nothing in this panel that isn't a rate, so it closes rather than masks."
                hint="Director and Finance only. The brands this house carries, its PO defaults and how its discounts are structured stay on the page."
              />
            </div>
          )}

          {/* Brands in the house */}
          <div className="r-scroll-x" style={{ marginTop: 22, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.6fr', gap: 12, padding: '11px 16px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`, minWidth: 560 }}>
              {['Brand', 'Terms', 'Note'].map((h) => (
                <div key={h} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>{h}</div>
              ))}
            </div>
            {s.brands.map((b) => <BrandRow key={b.name} supplier={s} brand={b} finance={finance} />)}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: c.muted }}>
            Discounts resolve per line at order time: inclusive price lists skip the discount step, JV brands use their tier or compounded chain, everyone else takes the supplier's averaged rate.
          </div>
        </div>
      </div>
    </>
  )
}
