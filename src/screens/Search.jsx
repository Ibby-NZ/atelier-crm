import { useState, useMemo } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, Em, Swatch, Indicative } from '../components/ui.jsx'
import { IconSearch } from '../components/icons.jsx'
import { designs, products, collections, brands, samples } from '../data/atelier.js'

// Cross-entity search index (Charlotte's ask · INV-03): one searchable record set spanning colourways,
// finished products, ranges, brands and samples — matched on code, design, colourway, supplier, range or
// barcode with partial (no-exact-details-needed) matching. Built once.
function buildIndex() {
  const rec = []
  designs.forEach((d) =>
    (d.colourways || []).forEach((cw) =>
      rec.push({
        type: 'Colourway', title: `${d.design} — ${cw.name}`, meta: `${d.brand} · ${d.composition}`,
        sub: cw.sku, tone: cw.tone,
        terms: [d.brand, d.supplier, d.design, cw.name, cw.sku, d.composition, d.application, d.priceBand].filter(Boolean).join(' ').toLowerCase(),
      }),
    ),
  )
  products.forEach((p) =>
    rec.push({
      type: 'Product', title: p.name, meta: `${p.brand} · ${p.type}`, sub: p.sku, tone: null,
      terms: [p.name, p.brand, p.design, p.type, p.composition, p.sku].filter(Boolean).join(' ').toLowerCase(),
    }),
  )
  collections.forEach((cn) =>
    rec.push({
      type: 'Range', title: cn.name, meta: [cn.brand, cn.application].filter(Boolean).join(' · '), sub: '', tone: null,
      terms: [cn.name, cn.brand, cn.application].filter(Boolean).join(' ').toLowerCase(),
    }),
  )
  brands.forEach((b) =>
    rec.push({
      type: 'Brand', title: b.name, meta: [b.country, b.currency].filter(Boolean).join(' · '), sub: '', tone: null,
      terms: [b.name, b.country, b.slug, b.currency].filter(Boolean).join(' ').toLowerCase(),
    }),
  )
  samples.rows.forEach((s) =>
    rec.push({
      type: 'Sample', title: s.design, meta: `${s.supplier} · ${s.status}`, sub: s.barcode, tone: s.tone,
      terms: [s.design, s.supplier, s.barcode, s.holder, s.status].filter(Boolean).join(' ').toLowerCase(),
    }),
  )
  return rec
}

const GROUP_ORDER = ['Colourway', 'Product', 'Range', 'Brand', 'Sample']
const PER_GROUP = 10
const EXAMPLES = ['Atlas', 'PF-ATL-04', 'Larsen', 'Cappuccino', 'ATL-0049', 'linen']

export default function Search() {
  const index = useMemo(buildIndex, [])
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const q = query.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  const results = q ? index.filter((r) => words.every((w) => r.terms.includes(w))) : []

  const groups = GROUP_ORDER
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length)

  const TypeTag = ({ type }) => (
    <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.brass, border: `1px solid ${c.line}`, borderRadius: 4, padding: '2px 7px' }}>{type}</span>
  )

  return (
    <>
      <PageHeader
        eyebrow="Find anything"
        title={<>Search the <Em>library</Em></>}
        subtitle="One search across products, colourways, ranges, brands and samples — by design, code, supplier, range or barcode. Partial matches are fine; you don't need the exact details."
      />

      {/* search field */}
      <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 12, height: 56, padding: '0 18px', border: `1px solid ${focused ? c.brass : c.line}`, borderRadius: 4, background: c.paper, transition: 'border-color .15s' }}>
        <IconSearch size={20} color={c.brass} />
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Try a design, colourway, SKU, supplier, range or barcode…"
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: c.ink, fontFamily: font.ui }}
        />
        {q && <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted, flex: 'none' }}>{results.length} result{results.length === 1 ? '' : 's'}</span>}
      </div>

      {/* empty (pre-search) state */}
      {!q && (
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: c.muted }}>Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setQuery(ex)} className="ab-t"
              style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft, background: c.surface, border: `1px solid ${c.line}`, borderRadius: 100, padding: '5px 13px', cursor: 'pointer' }}>{ex}</button>
          ))}
        </div>
      )}

      {/* no-match state */}
      {q && results.length === 0 && (
        <div style={{ marginTop: 26, padding: 30, textAlign: 'center', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface }}>
          <div style={{ fontFamily: font.display, fontSize: 18, color: c.ink }}>Nothing found for “{query}”.</div>
          <div style={{ marginTop: 8, fontSize: 13, color: c.muted }}>Try fewer or different words — the search matches partial text across every field.</div>
        </div>
      )}

      {/* results, grouped */}
      {groups.map((g) => (
        <div key={g.type} style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>{g.type === 'Range' ? 'Ranges' : g.type + 's'}</span>
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.brass }}>{g.items.length}</span>
          </div>
          <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            {g.items.slice(0, PER_GROUP).map((r, i) => (
              <div key={r.type + r.title + r.sub + i} className="ab-rowhover" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer' }}>
                {r.tone
                  ? <Swatch tone={r.tone} size={30} radius={5} />
                  : <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 13, color: c.brass }}>{r.title[0]}</div>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.meta}</div>
                </div>
                {r.sub && <span style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft, flex: 'none' }}>{r.sub}</span>}
                <TypeTag type={r.type} />
              </div>
            ))}
            {g.items.length > PER_GROUP && (
              <div style={{ padding: '11px 16px', fontSize: 12, color: c.muted, background: c.surface }}>+ {g.items.length - PER_GROUP} more {g.type.toLowerCase()}{g.items.length - PER_GROUP === 1 ? '' : 's'} — refine your search to narrow.</div>
            )}
          </div>
        </div>
      ))}

      {q && results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Indicative /> <span style={{ fontSize: 12, color: c.muted }}>Prototype search over the demo catalogue — production adds fuzzy ranking and typo tolerance (INV-03).</span>
        </div>
      )}
    </>
  )
}
