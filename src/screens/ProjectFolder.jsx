import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { WeaveImage, Toast, PrimaryButton } from '../components/ui.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { IconCopy } from '../components/icons.jsx'
import { projectFolder } from '../data/atelier.js'

const palette = [
  { name: 'Indigo', hex: '#2C3A55' },
  { name: 'Jade', hex: '#3E6258' },
  { name: 'Clay', hex: '#B06A4F' },
  { name: 'Blanc', hex: '#D6C9AF' },
  { name: 'Noir', hex: '#26221C' },
]

function metres(p) {
  const n = parseFloat(String(p.qty).replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : n
}

export default function ProjectFolder() {
  const navigate = useNavigate()
  const [pieces, setPieces] = useState(projectFolder.pieces)
  const [hovered, setHovered] = useState(null)
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  function flash(msg) {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2800)
  }

  function remove(i, e) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setPieces((ps) => ps.filter((_, j) => j !== i))
    setHovered(null)
  }

  const total = pieces.reduce((a, p) => a + metres(p), 0)
  const totalLabel = `${total.toFixed(1).replace(/\.0$/, '')} m`

  return (
    <div style={{ minHeight: '100vh', background: c.paper, color: c.ink }}>
      <div className="r-hero-pad" style={{ maxWidth: 1340, margin: '0 auto', padding: '42px 56px 72px' }}>

        {/* Sub-bar PageHeader */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.muted }}>Project Folder</div>
            <h1 style={{ margin: '14px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 42, lineHeight: 1.02, letterSpacing: '-0.02em', color: c.ink }}>
              Project Hāwera — <span style={{ fontStyle: 'italic' }}>Master Suite</span>
            </h1>
            <div style={{ marginTop: 12, fontSize: 13.5, color: c.muted }}>
              Curated by {projectFolder.designer} · {projectFolder.client}, Ponsonby
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>{pieces.length} pieces</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: c.brass }} />
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.accent }}>{totalLabel} total · Indicative</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: c.brass }} />
              <span style={{ fontSize: 11.5, color: c.muted }}>Last edited {projectFolder.lastEdited}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            <div
              className="ab-t"
              onClick={() => flash(`Link copied — ${projectFolder.shareUrl}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, height: 40, padding: '0 14px', border: `1px solid ${c.line}`, borderRadius: 20, cursor: 'pointer', background: c.paper }}
            >
              <IconCopy size={14} color={c.brass} />
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.inkSoft }}>{projectFolder.shareUrl}</span>
              <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, borderLeft: `1px solid ${c.line}`, paddingLeft: 10 }}>Read-only</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link to="/storefront" className="ab-link" style={{ fontSize: 12, color: c.brass, textDecoration: 'none', borderBottom: `1px solid ${c.brass}`, paddingBottom: 1 }}>Preview client view</Link>
              <PrimaryButton onClick={() => { flash(`${pieces.length} samples requested → Sample Tracking`); }}>
                Request all samples
              </PrimaryButton>
            </div>
          </div>
        </div>

        {/* Collage grid */}
        <div className="r-grid-3" style={{ marginTop: 44, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 36 }}>
          {pieces.map((p, i) => {
            const on = hovered === i
            return (
              <div
                key={p.sku + i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ position: 'relative' }}
              >
                <Link to="/product" style={{ textDecoration: 'none', display: 'block' }}>
                  <div
                    className="ab-t"
                    style={{ position: 'relative', height: 262, border: `1px solid ${on ? c.brass : c.line}`, borderRadius: 4, overflow: 'hidden', transform: on ? 'translateY(-4px)' : 'translateY(0)', transition: 'transform .25s ease, border-color .2s ease' }}
                  >
                    <WeaveImage img={p.img} src={p.src} tone={p.tone} style={{ width: '100%', height: '100%' }} />
                    {on && (
                      <div
                        onClick={(e) => remove(i, e)}
                        style={{ position: 'absolute', right: 12, top: 12, width: 28, height: 28, borderRadius: '50%', background: 'rgba(51,49,43,.55)', color: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, cursor: 'pointer' }}
                      >×</div>
                    )}
                  </div>
                </Link>
                <div style={{ padding: '15px 2px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 24, height: 24, flex: 'none', borderRadius: 4, background: p.tone[1], border: `1px solid ${c.line}` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: font.display, fontSize: 18, color: c.ink, lineHeight: 1.15 }}>{p.design} — {p.colourway}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 11.5, color: c.muted }}>{p.supplier}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{p.sku}</span>
                  </div>
                  <div style={{ marginTop: 11, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 14.5, color: c.inkSoft }}>“{p.note}”</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, flex: 'none' }}>{p.qty}</span>
                  </div>
                  <div style={{ marginTop: 11, height: 18 }}>
                    {on && (
                      <span
                        onClick={() => navigate('/sample-request')}
                        style={{ fontSize: 11.5, color: c.accent, borderBottom: `1px solid ${c.accent}`, cursor: 'pointer' }}
                      >Request sample</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add from Library */}
          <Link
            to="/library"
            className="ab-t"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 262, border: `1px dashed #C7BBA2`, borderRadius: 4, background: c.paper }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 42, height: 42, margin: '0 auto', border: `1px solid ${c.brass}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.brass, fontSize: 22, fontWeight: 300 }}>+</div>
              <div style={{ marginTop: 12, fontSize: 12.5, letterSpacing: '0.04em', color: c.muted }}>Add from Library</div>
            </div>
          </Link>
        </div>

        {/* Project palette footer */}
        <div style={{ marginTop: 52, borderTop: `1px solid ${c.line}`, paddingTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 14 }}>Project palette</div>
            <div style={{ display: 'flex', gap: 18 }}>
              {palette.map((sw) => (
                <div key={sw.name} style={{ textAlign: 'center' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 8, background: sw.hex, border: `1px solid ${c.line}` }} />
                  <div style={{ marginTop: 7, fontSize: 10.5, color: c.inkSoft }}>{sw.name}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Total cloth · Indicative</div>
            <div style={{ marginTop: 10, fontFamily: font.display, fontWeight: 500, fontSize: 30, color: c.accent }}>{totalLabel}</div>
          </div>
        </div>
      </div>

      <BrandFooter />

      {toast && <Toast>{toast}</Toast>}
    </div>
  )
}
