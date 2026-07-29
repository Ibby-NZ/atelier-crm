import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { Em, WeaveImage } from '../components/ui.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { IconPlay } from '../components/icons.jsx'
import { journal } from '../data/atelier.js'

// Local warm tones per card (data module collections carry no tone field)
const cardTones = [
  ['#7A5230', '#3C2918'],
  ['#C9B79B', '#9C8868'],
  ['#B87356', '#7E4631'],
  ['#9C4A43', '#5A211F'],
  ['#8A8B6F', '#565740'],
  ['#44506A', '#222A3C'],
]
const cardHrefs = ['/product', '/library', '/library', '/journal/story', '/library', '/library']

export default function Journal() {
  const [hovered, setHovered] = useState(null)
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const hero = journal.hero

  return (
    <div style={{ background: c.paper, color: c.ink }}>
      {/* Hero full-bleed */}
      <Link
        to="/journal/story"
        style={{
          textDecoration: 'none', display: 'block', position: 'relative',
          height: 560, overflow: 'hidden', borderBottom: `1px solid ${c.line}`,
        }}
      >
        <WeaveImage
          img={hero.img}
          src={hero.src}
          tone={['#8A5A2E', '#2C1E12']}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(28,21,14,.72) 0%, rgba(28,21,14,.15) 50%, rgba(28,21,14,.3) 100%)',
        }} />
        <div className="r-hero-pad" style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '0 56px 52px', maxWidth: 1340, margin: '0 auto',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#E8C9A0' }}>
            {hero.eyebrow}
          </div>
          <h1 className="r-hero-h1" style={{
            margin: '16px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 72,
            lineHeight: 0.98, letterSpacing: '-0.025em', color: c.paper, maxWidth: 820,
          }}>
            {hero.title}
          </h1>
          <p style={{ margin: '18px 0 0', fontSize: 16, lineHeight: 1.6, color: c.surfaceDeep, maxWidth: 520 }}>
            {hero.description || 'New designs and timeless classics in natural tones — free-spirited, bold and resolutely contemporary, yet timeless.'}
          </p>
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', border: '1px solid rgba(232,201,160,.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconPlay size={18} color={c.paper} />
            </div>
            <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 22, color: c.paper }}>
              Inspire more
            </span>
          </div>
        </div>
      </Link>

      <div className="r-hero-pad" style={{ maxWidth: 1340, margin: '0 auto', padding: '56px 56px 0' }}>
        {/* Curated grid */}
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.muted }}>
          The Journal
        </div>
        <div className="r-grid-3" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px 36px' }}>
          {journal.articles.map((a, i) => {
            const h = hovered === i
            return (
              <Link
                key={i}
                to={cardHrefs[i] || '/journal/story'}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  textDecoration: 'none', display: 'block',
                  transition: 'transform .25s ease',
                  transform: h ? 'translateY(-3px)' : 'translateY(0)',
                }}
              >
                <div style={{ height: 300, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
                  <WeaveImage
                    img={a.img}
                    src={a.src}
                    tone={cardTones[i]}
                    style={{
                      width: '100%', height: '100%',
                      transition: 'transform .5s ease',
                      transform: h ? 'scale(1.05)' : 'scale(1)',
                    }}
                  />
                </div>
                <div style={{ padding: '16px 2px 0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
                    {a.eyebrow}
                  </div>
                  <div style={{
                    marginTop: 9, fontFamily: font.display, fontSize: 23, lineHeight: 1.12,
                    color: h ? c.accent : c.ink, transition: 'color .2s ease',
                  }}>
                    {a.title}
                  </div>
                  <div style={{ marginTop: 12, fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                    {a.date} · {a.read} read
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Featured video strip */}
        <Link to="/journal/story" style={{ textDecoration: 'none', display: 'block', marginTop: 64 }}>
          <div style={{
            position: 'relative', height: 420, border: `1px solid ${c.line}`,
            borderRadius: 4, overflow: 'hidden',
            background: 'repeating-linear-gradient(46deg, rgba(255,255,255,.03) 0 4px, rgba(0,0,0,.06) 4px 8px), linear-gradient(120deg, #4A4138, #211C17)',
          }}>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 22,
            }}>
              <div style={{
                width: 66, height: 66, borderRadius: '50%', border: '1px solid rgba(232,201,160,.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(33,28,23,.2)',
              }}>
                <IconPlay size={20} color={c.paper} />
              </div>
              <div style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 26, color: c.paper }}>
                In the Atelier — Hands &amp; Thread
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Newsletter capture */}
      <div style={{ marginTop: 72, borderTop: `1px solid ${c.line}`, background: c.surface }}>
        <div className="r-hero-pad" style={{
          maxWidth: 1340, margin: '0 auto', padding: '56px 56px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 40, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.muted }}>
              Stay in the know
            </div>
            <div style={{ marginTop: 14, fontFamily: font.display, fontWeight: 500, fontSize: 38, letterSpacing: '-0.01em', color: c.ink }}>
              Inspire <Em>more.</Em>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: c.muted }}>
              The Journal, delivered monthly. Quiet, considered, never often.
            </div>
          </div>
          <div>
            {subscribed ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 11,
                fontFamily: font.display, fontStyle: 'italic', fontSize: 18, color: c.ink,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.sage }} />
                Welcome — see you at month&rsquo;s end.
              </div>
            ) : (
              <div>
                <div className="r-news-form" style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@studio.co.nz"
                    style={{
                      width: 280, height: 48, border: `1px solid ${c.line}`, borderRadius: 3,
                      background: c.paper, padding: '0 16px', fontSize: 14, color: c.ink,
                      fontFamily: font.ui,
                    }}
                  />
                  <button
                    className="ab-primary ab-t"
                    onClick={() => setSubscribed(true)}
                    style={{
                      height: 48, padding: '0 26px', background: c.accent, color: c.paper,
                      border: 'none', borderRadius: 3, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                      fontFamily: font.ui,
                    }}
                  >
                    Subscribe
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: c.muted }}>
                  Delivered via Mailchimp · unsubscribe any time.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <BrandFooter />
    </div>
  )
}
