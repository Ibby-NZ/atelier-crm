// Library Browse — brand-world faceted luxury catalogue.
// Pixel-faithful to "Library Browse.dc.html"; data from ../data/atelier.js (designs).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font, weave } from '../theme.js'
import { Em, WeaveImage } from '../components/ui.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { designs } from '../data/atelier.js'

// Colour-family palette (the swatch chips). Local const — not exported by data module.
const COLOUR_DEFS = [
  ['ivory', 'Ivory', '#ECE5D6'],
  ['oat', 'Oat', '#D6C9AF'],
  ['stone', 'Stone', '#B3B0A4'],
  ['bracken', 'Bracken', '#6E4A2E'],
  ['indigo', 'Indigo', '#39415A'],
  ['clay', 'Clay', '#B06A4F'],
  ['sage', 'Sage', '#6F7A5A'],
  ['amber', 'Amber', '#B98A4E'],
  ['noir', 'Noir', '#26221C'],
]

// Map a colourway tone (its lighter top hex) onto a colour-family key.
function familyForTone(top) {
  const t = (top || '#999999').toLowerCase()
  const r = parseInt(t.slice(1, 3), 16), g = parseInt(t.slice(3, 5), 16), b = parseInt(t.slice(5, 7), 16)
  const lum = (r + g + b) / 3
  if (lum < 56) return 'noir'
  if (b > r && b > g && lum < 150) return 'indigo'
  if (g > r && g > b) return 'sage'
  if (r > 150 && g > 120 && b < 120 && lum > 150) return 'amber'
  if (r > 140 && g < 140 && b < 130 && lum < 170) return 'clay'
  if (lum < 130) return 'bracken'
  if (lum > 215) return 'ivory'
  if (r > g && g > b) return 'oat'
  return 'stone'
}

// Derive the families present in a design from its colourways.
function familiesOf(d) {
  const set = new Set()
  ;(d.colourways || []).forEach((cw) => set.add(familyForTone(cw.tone && cw.tone[0])))
  return set
}

export default function LibraryBrowse() {
  const [houses, setHouses] = useState(() => new Set())
  const [apps, setApps] = useState(() => new Set())
  const [comps, setComps] = useState(() => new Set())
  const [colour, setColour] = useState(null)
  const [misc, setMisc] = useState(() => new Set())
  const [hovered, setHovered] = useState(null)

  const toggle = (set, setter) => (val) => {
    const next = new Set(set)
    next.has(val) ? next.delete(val) : next.add(val)
    setter(next)
  }
  const toggleHouse = toggle(houses, setHouses)
  const toggleApp = toggle(apps, setApps)
  const toggleComp = toggle(comps, setComps)
  const toggleMisc = toggle(misc, setMisc)
  const pickColour = (k) => setColour((prev) => (prev === k ? null : k))
  const clearAll = () => { setHouses(new Set()); setApps(new Set()); setComps(new Set()); setColour(null); setMisc(new Set()) }

  // Facet option lists derived from the real catalogue.
  const houseList = [...new Set(designs.map((d) => d.brand))]
  const appList = [...new Set(designs.map((d) => d.application))]
  const compList = [...new Set(designs.map((d) => d.composition))]

  // Each design's colour-family set (computed once).
  const famMap = designs.map((d) => familiesOf(d))

  const filtered = designs.filter((d, i) =>
    (houses.size === 0 || houses.has(d.brand)) &&
    (apps.size === 0 || apps.has(d.application)) &&
    (comps.size === 0 || comps.has(d.composition)) &&
    (!colour || famMap[i].has(colour))
  )

  const resultCount = `Showing ${filtered.length} of ${designs.length} designs`
  const empty = filtered.length === 0

  const container = { maxWidth: 1440, margin: '0 auto' }

  // ---- facet rail row builders ----
  const Check = ({ on, label, onClick }) => (
    <div onClick={onClick} className="ab-t" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <span style={{ width: 14, height: 14, flex: 'none', border: `1px solid ${on ? c.accent : c.brass}`, borderRadius: 2, background: on ? c.accent : 'transparent' }} />
      <span style={{ fontSize: 13, color: on ? c.accent : c.inkSoft, fontWeight: on ? 600 : 400 }}>{label}</span>
    </div>
  )
  const MiscChip = ({ label }) => {
    const on = misc.has(label)
    return (
      <div onClick={() => toggleMisc(label)} className="ab-t" style={{ padding: '6px 11px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: 3, cursor: 'pointer', fontSize: 11.5, color: on ? c.accent : c.inkSoft, background: on ? '#F3EADF' : 'transparent' }}>{label}</div>
    )
  }
  const facetHead = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 14 }
  const facetBlock = { padding: '22px 0', borderBottom: `1px solid ${c.line}` }

  const miscGroups = [
    { title: 'Width', items: ['140 cm', '150 cm', '130 cm'] },
    { title: 'Performance', items: ['40,000 rubs', '50,000 rubs', '60,000 rubs'] },
    { title: 'Lead time', items: ['Under 6 wks', '6–10 wks', '10 wks +'] },
    { title: 'Price band', items: ['Atelier', 'Signature', 'Rare'] },
  ]

  return (
    <div style={{ fontFamily: font.ui }}>
      {/* ===== Sub-bar PageHeader ===== */}
      <div className="r-hero-pad" style={{ ...container, padding: '48px 40px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.muted }}>The Collection</div>
            <h1 className="r-hero-h1" style={{ margin: '14px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 48, lineHeight: 1.0, letterSpacing: '-0.02em', color: c.ink }}>The <Em>Library</Em></h1>
            <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.65, color: c.muted }}>A curated register of the world’s finest weaves — gathered from the houses we love, and held to be touched, draped and considered in the calm of the studio.</p>
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 13, color: c.muted }}>{resultCount}</div>
        </div>
      </div>

      {/* ===== Main split ===== */}
      <div className="r-lib-main r-hero-pad" style={{ ...container, padding: '0 40px 64px', display: 'grid', gridTemplateColumns: '258px 1fr', gap: 52, alignItems: 'start' }}>

        {/* Filter rail */}
        <aside style={{ borderTop: `1px solid ${c.line}`, paddingTop: 6 }}>

          {/* House */}
          <div style={facetBlock}>
            <div style={facetHead}>House</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {houseList.map((h) => <Check key={h} label={h} on={houses.has(h)} onClick={() => toggleHouse(h)} />)}
            </div>
          </div>

          {/* Application */}
          <div style={facetBlock}>
            <div style={facetHead}>Application</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {appList.map((a) => <Check key={a} label={a} on={apps.has(a)} onClick={() => toggleApp(a)} />)}
            </div>
          </div>

          {/* Colour family */}
          <div style={facetBlock}>
            <div style={facetHead}>Colour family</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              {COLOUR_DEFS.map(([k, name, hex]) => (
                <div key={k} onClick={() => pickColour(k)} title={name} className="ab-t"
                  style={{ width: 26, height: 26, borderRadius: 5, background: hex, cursor: 'pointer', border: `1px solid ${c.line}`, boxShadow: colour === k ? `0 0 0 2px ${c.accent}` : 'none' }} />
              ))}
            </div>
          </div>

          {/* Composition */}
          <div style={facetBlock}>
            <div style={facetHead}>Composition</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {compList.map((cmp) => <Check key={cmp} label={cmp} on={comps.has(cmp)} onClick={() => toggleComp(cmp)} />)}
            </div>
          </div>

          {/* Other facets */}
          {miscGroups.map((grp) => (
            <div key={grp.title} style={facetBlock}>
              <div style={{ ...facetHead, marginBottom: 13 }}>{grp.title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {grp.items.map((it) => <MiscChip key={it} label={it} />)}
              </div>
            </div>
          ))}
        </aside>

        {/* Gallery grid */}
        <section>
          {!empty && (
            <div className="r-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 40 }}>
              {filtered.map((d) => {
                const idx = designs.indexOf(d)
                const hov = hovered === idx
                const lead = (d.colourways && d.colourways[0] && d.colourways[0].tone) || ['#E5DBC8', '#C9B68E']
                return (
                  <Link key={d.design + d.brand} to="/product" className="ab-tile ab-t"
                    onMouseEnter={() => setHovered(idx)} onMouseLeave={() => setHovered(null)}
                    style={{ textDecoration: 'none', display: 'block', transform: hov ? 'translateY(-4px)' : 'translateY(0)', boxShadow: hov ? '0 16px 36px rgba(33,28,23,.14)' : 'none', transition: 'transform .25s ease, box-shadow .25s ease' }}>
                    <div style={{ position: 'relative', height: 320, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
                      <WeaveImage img={d.img} src={d.src} tone={lead} className="ab-img"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} radius={0} />
                      <div className="ab-reveal" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(33,28,23,.5), rgba(33,28,23,0) 55%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 22, opacity: hov ? 1 : 0, transition: 'opacity .25s ease' }}>
                        <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 16, color: c.paper, borderBottom: '1px solid rgba(247,242,233,.6)', paddingBottom: 3 }}>View the collection</span>
                      </div>
                    </div>
                    <div style={{ padding: '16px 2px 0' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>{d.brand.toUpperCase()}</div>
                      <div style={{ marginTop: 7, fontFamily: font.display, fontSize: 23, color: c.ink }}>{d.design}</div>
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {(d.colourways || []).map((cw) => {
                            const fam = familyForTone(cw.tone && cw.tone[0])
                            return (
                              <div key={cw.sku || cw.name} onClick={(e) => { e.preventDefault(); e.stopPropagation(); pickColour(fam) }}
                                title={cw.name}
                                style={{ width: 18, height: 18, borderRadius: 3, background: weave(cw.tone[0], cw.tone[1]), border: `1px solid ${c.line}`, cursor: 'pointer' }} />
                            )
                          })}
                        </div>
                        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{(d.colourways || []).length} colourways</span>
                      </div>
                      <div style={{ marginTop: 11, fontSize: 11.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Trade pricing visible after sign-in</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {empty && (
            <div style={{ padding: 60, textAlign: 'center', fontSize: 14, color: c.muted, border: `1px solid ${c.line}`, borderRadius: 4 }}>
              No designs match these facets.{' '}
              <span onClick={clearAll} style={{ color: c.accent, cursor: 'pointer', borderBottom: `1px solid ${c.accent}` }}>Clear filters</span>
            </div>
          )}
        </section>
      </div>

      <BrandFooter />
    </div>
  )
}
