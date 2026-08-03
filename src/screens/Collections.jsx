import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { Em, PageHeader, WeaveImage, Indicative } from '../components/ui.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { collections } from '../data/atelier.js'

// Tone palette for collection thumbnails, keyed by application (local, not in data module)
const APP_TONE = {
  Mixed: ['#C9B79B', '#8A6A4A'],
  Outdoor: ['#9FB0A0', '#5F7256'],
  Drapery: ['#D6C9AF', '#B5985B'],
  Upholstery: ['#C2A98A', '#7A5A40'],
}

// Strip a leading "Brand |" / "Brand —" prefix so the display name reads cleanly under the eyebrow.
function cleanName(name, brand) {
  let n = name
  const seps = [' | ', ' — ', ' - ']
  for (const s of seps) {
    if (n.startsWith(brand + s)) { n = n.slice((brand + s).length); break }
  }
  if (n === name && n.startsWith(brand + ' ')) n = n.slice(brand.length + 1)
  return n.trim() || name
}

export default function Collections() {
  const [hovered, setHovered] = useState(null)
  const [app, setApp] = useState(null)

  const applications = Array.from(new Set(collections.map((x) => x.application)))
  const filtered = app ? collections.filter((x) => x.application === app) : collections

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Sub-bar under the shared editorial nav */}
      <div style={{ borderBottom: `1px solid ${c.line}` }}>
        <div
          className="r-hero-pad"
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '14px 40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ab-t"
              onClick={() => setApp(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '5px 12px',
                fontFamily: font.ui,
                fontSize: 11.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: app === null ? c.accent : c.muted,
                fontWeight: app === null ? 600 : 500,
                borderBottom: `2px solid ${app === null ? c.accent : 'transparent'}`,
              }}
            >
              All
            </button>
            {applications.map((a) => (
              <button
                key={a}
                type="button"
                className="ab-t"
                onClick={() => setApp(a)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  fontFamily: font.ui,
                  fontSize: 11.5,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: app === a ? c.accent : c.muted,
                  fontWeight: app === a ? 600 : 500,
                  borderBottom: `2px solid ${app === a ? c.accent : 'transparent'}`,
                }}
              >
                {a}
              </button>
            ))}
          </div>
          <Link
            to="/library"
            className="ab-link ab-t"
            style={{
              fontSize: 12,
              letterSpacing: '0.06em',
              color: c.inkSoft,
              textDecoration: 'none',
              borderBottom: `1px solid ${c.line}`,
              paddingBottom: 2,
            }}
          >
            Browse the full Library
          </Link>
        </div>
      </div>

      {/* PageHeader + count */}
      <div className="r-hero-pad" style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 40px 30px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ maxWidth: 660 }}>
            <PageHeader
              eyebrow="The Houses"
              title={<><Em>Collections</Em></>}
              subtitle="The seasons and stories we carry — gathered house by house, each collection held in the studio to be touched, draped and considered in calm natural light."
            />
          </div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 13,
              color: c.muted,
              paddingBottom: 4,
            }}
          >
            {filtered.length} of {collections.length} collections
          </div>
        </div>
      </div>

      {/* Gallery grid */}
      <div className="r-hero-pad" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px 24px' }}>
        <div
          className="r-collections-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
            gap: 40,
          }}
        >
          {filtered.map((col, i) => {
            const tone = APP_TONE[col.application] || APP_TONE.Mixed
            const name = cleanName(col.name, col.brand)
            return (
              <Link
                key={col.name}
                to="/library"
                className="ab-tile ab-t"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div
                  style={{
                    position: 'relative',
                    height: 320,
                    border: `1px solid ${c.line}`,
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <WeaveImage
                    img={col.img}
                    src={col.src}
                    tone={tone}
                    alt={col.name}
                    className="ab-img"
                    style={{ width: '100%', height: '100%' }}
                  />
                  <div
                    className="ab-reveal"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(to top, rgba(51,49,43,.5), rgba(51,49,43,0) 55%)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      paddingBottom: 22,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.display,
                        fontStyle: 'italic',
                        fontSize: 16,
                        color: c.paper,
                        borderBottom: '1px solid rgba(247,242,233,.6)',
                        paddingBottom: 3,
                      }}
                    >
                      View the collection
                    </span>
                  </div>
                </div>
                <div style={{ padding: '16px 2px 0' }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: c.muted,
                    }}
                  >
                    {col.brand}
                  </div>
                  <div
                    style={{
                      marginTop: 7,
                      fontFamily: font.display,
                      fontSize: 23,
                      lineHeight: 1.15,
                      color: c.ink,
                    }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: c.brass,
                      }}
                    >
                      {col.application}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: '10px 0 0',
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: c.muted,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {col.description}
                  </p>
                  <div
                    style={{
                      marginTop: 11,
                      fontSize: 11.5,
                      color: c.muted,
                      fontStyle: 'italic',
                      fontFamily: font.display,
                    }}
                  >
                    Sign in for Trade pricing <Indicative style={{ marginLeft: 6 }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div
            style={{
              padding: 60,
              textAlign: 'center',
              fontSize: 14,
              color: c.muted,
              border: `1px solid ${c.line}`,
              borderRadius: 4,
            }}
          >
            No collections in this application.{' '}
            <span
              onClick={() => setApp(null)}
              style={{ color: c.accent, cursor: 'pointer', borderBottom: `1px solid ${c.accent}` }}
            >
              Show all
            </span>
          </div>
        )}
      </div>

      <div style={{ height: 56 }} />
      <BrandFooter />
    </div>
  )
}
