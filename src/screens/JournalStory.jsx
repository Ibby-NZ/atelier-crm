import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font, weave } from '../theme.js'
import { WeaveImage, Indicative } from '../components/ui.jsx'
import { IconPlay } from '../components/icons.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { journal, hero } from '../data/atelier.js'
import { canonical, nzd } from '../data/pricing.js'

const RELATED = [
  { title: 'de Le Cuona and the art of understated linen', date: '09 Jun 2026', tone: ['#C9B79B', '#9C8868'] },
  { title: 'The Madder Dye Revival', date: '21 May 2026', tone: ['#9C4A43', '#5A211F'] },
  { title: 'Manuel Canovas — the colour of Giverny', date: '27 May 2026', tone: ['#44506A', '#222A3C'] },
]

export default function JournalStory() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [hovered, setHovered] = useState(null)

  const story = journal.story
  const shop = story.shop
  const chips = hero.colourways

  return (
    <div style={{ minHeight: '100vh', background: c.paper, color: c.ink }}>
      {/* sub-bar : breadcrumb */}
      <div style={{ borderBottom: `1px solid ${c.line}`, padding: '12px 40px' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>
          Journal /{' '}
          <Link to="/journal" className="ab-link" style={{ textDecoration: 'none', color: c.muted, borderBottom: `1px solid ${c.line}` }}>Material Stories</Link>
        </span>
      </div>

      {/* Full-bleed hero */}
      <div style={{ position: 'relative', height: 600, overflow: 'hidden', borderBottom: `1px solid ${c.line}` }}>
        <WeaveImage
          img={story.img}
          src={story.src}
          tone={['#8A5A2E', '#2C1E12']}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,21,14,.78) 0%, rgba(28,21,14,.1) 52%, rgba(28,21,14,.32) 100%)' }} />
        <div className="r-hero-pad" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 56px 54px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#E8C9A0' }}>
            {story.eyebrow} · June 2026
          </div>
          <h1 className="r-hero-h1" style={{ margin: '18px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 66, lineHeight: 1.0, letterSpacing: '-0.025em', color: c.paper, maxWidth: 860 }}>
            Inside Pierre Frey: <span style={{ fontStyle: 'italic' }}>Cappuccino</span>
          </h1>
          <p style={{ margin: '18px 0 0', fontSize: 16, lineHeight: 1.6, color: c.surface, maxWidth: 560 }}>
            {story.standfirst}
          </p>
        </div>
      </div>

      {/* byline rail */}
      <div style={{ borderBottom: `1px solid ${c.line}`, padding: '16px 40px', textAlign: 'center' }}>
        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>
          Words by Charlotte&nbsp;&nbsp;·&nbsp;&nbsp;Photography on location, Paris&nbsp;&nbsp;·&nbsp;&nbsp;6 min read
        </span>
      </div>

      {/* Article body */}
      <article className="r-hero-pad" style={{ maxWidth: 1040, margin: '0 auto', padding: '64px 40px 0' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <p style={{ fontSize: 17.5, lineHeight: 1.78, color: c.ink, margin: '0 0 22px' }}>
            <span style={{ float: 'left', fontFamily: font.display, fontWeight: 500, fontSize: 74, lineHeight: 0.78, padding: '6px 14px 0 0', color: c.accent }}>C</span>
            appuccino is Pierre Frey's quiet meditation on the warmth of the natural world — a collection that gathers the soft browns of unbleached linen, the milky greige of undyed wool and the honeyed glow of late-afternoon light, and sets them against weaves crisp enough to feel resolutely of the moment. The house has spent three generations learning that restraint is its own form of luxury.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.78, color: c.inkSoft, margin: '0 0 22px' }}>
            Founded in Paris in 1935, the maison still weaves to the same principle that guided its first archive: a cloth should be free-spirited and bold, yet never shout. Atlas — the collection's centrepiece — is woven from a blend of viscose, cotton and linen, a hand that drinks the light rather than reflecting it, and falls in a clean, considered drape across upholstery and drapery alike.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.78, color: c.inkSoft, margin: '0 0 22px' }}>
            “We are not chasing novelty,” the studio's design director will tell you, running a thumb across a freshly finished length of Indigo. “We are chasing a feeling you cannot quite name — the warmth of a room that has been lived in well, where every tone has been allowed to settle.”
          </p>
        </div>

        {/* pull quote */}
        <div style={{ maxWidth: 760, margin: '46px auto', paddingLeft: 28, borderLeft: `2px solid ${c.brass}` }}>
          <div style={{ fontFamily: font.display, fontStyle: 'italic', fontWeight: 500, fontSize: 30, lineHeight: 1.28, letterSpacing: '-0.01em', color: c.ink }}>
            “A cloth is finished not when the loom stops, but when the light agrees with it.”
          </div>
          <div style={{ marginTop: 14, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>
            — Design Director, Pierre Frey · Paris
          </div>
        </div>

        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <p style={{ fontSize: 16, lineHeight: 1.78, color: c.inkSoft, margin: '0 0 22px' }}>
            The colour comes last and matters most. Six tones make the Atlas range, each dyed in small lots and checked against the same north-facing light the house has trusted for decades. Natural and Flax hold the pale end; Slate sits in the middle as a true greige; Sienna, Indigo and Noir carry the dark — the anchors that let the lighter weaves breathe.
          </p>
        </div>

        {/* in-line full-width image */}
        <figure style={{ margin: '48px 0' }}>
          <WeaveImage
            img={story.img}
            src={story.src}
            tone={['#6E4A2E', '#2E2117']}
            style={{ height: 480, width: '100%' }}
            radius={4}
          />
          <figcaption style={{ marginTop: 12, fontFamily: font.mono, fontSize: 11, color: c.muted, textAlign: 'center' }}>
            The finishing floor — pile raised, sheared and brushed by hand before inspection.
          </figcaption>
        </figure>

        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <p style={{ fontSize: 16, lineHeight: 1.78, color: c.inkSoft, margin: '0 0 22px' }}>
            What cannot be photographed is the patience. A single bolt may sit a week on the frame before it is judged ready — long enough for the fibre to settle, for the weave to even, for the colour to deepen by a half-shade nobody but the dyer would notice. It is slow by design, and unapologetically so.
          </p>
        </div>

        {/* video block */}
        <div style={{ maxWidth: 760, margin: '46px auto 0' }}>
          <div style={{ position: 'relative', height: 428, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: weave('#565149', '#1A1610') }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 66, height: 66, borderRadius: '50%', background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(51,49,43,.3)' }}>
                <IconPlay size={20} color={c.paper} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontFamily: font.mono, fontSize: 11, color: c.muted, textAlign: 'center' }}>
            Inside the weaving hall · 2 min 14 s
          </div>
        </div>

        {/* Shop the story */}
        <div style={{ maxWidth: 760, margin: '64px auto 0', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '30px 32px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Shop the story</div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>{shop.brand}</div>
              <div style={{ marginTop: 6, fontFamily: font.display, fontSize: 28, color: c.ink }}>{shop.design}</div>
              <div style={{ marginTop: 16, display: 'flex', gap: 11 }}>
                {chips.map((w) => (
                  <div
                    key={w.sku}
                    className="ab-t"
                    title={`${w.name} · ${w.sku}`}
                    style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${w.tone[0]}, ${w.tone[1]})`, border: `1px solid ${c.line}`, cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${c.accent}` }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
                  />
                ))}
              </div>
              <div style={{ marginTop: 16, fontFamily: font.mono, fontSize: 13, color: c.ink }}>
                From {nzd(canonical.retail)} /m · <Indicative />
              </div>
            </div>
            <Link
              to="/product"
              className="ab-primary ab-t"
              style={{ flex: 'none', alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, padding: '0 24px', background: c.accent, color: c.paper, borderRadius: 4, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}
            >
              View the collection
            </Link>
          </div>
        </div>
      </article>

      {/* Related stories */}
      <div className="r-hero-pad" style={{ maxWidth: 1040, margin: '0 auto', padding: '72px 40px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.muted, marginBottom: 24 }}>Related stories</div>
        <div className="r-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {RELATED.map((r, i) => {
            const h = hovered === i
            return (
              <Link
                key={r.title}
                to="/journal/story"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div style={{ height: 200, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
                  <div className="ab-t" style={{ width: '100%', height: '100%', background: weave(r.tone[0], r.tone[1]), transform: h ? 'scale(1.05)' : 'scale(1)', transition: 'transform .5s ease' }} />
                </div>
                <div className="ab-t" style={{ marginTop: 13, fontFamily: font.display, fontSize: 19, lineHeight: 1.15, color: h ? c.accent : c.ink }}>{r.title}</div>
                <div style={{ marginTop: 8, fontFamily: font.mono, fontSize: 11, color: c.muted }}>{r.date}</div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Newsletter */}
      <div style={{ marginTop: 72, borderTop: `1px solid ${c.line}`, background: c.surface }}>
        <div className="r-hero-pad" style={{ maxWidth: 1040, margin: '0 auto', padding: '52px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 36, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.muted }}>Receive the Journal</div>
            <div style={{ marginTop: 12, fontFamily: font.display, fontWeight: 500, fontSize: 30, color: c.ink }}>
              Stories worth <span style={{ fontStyle: 'italic' }}>slowing</span> for.
            </div>
          </div>
          <div>
            {subscribed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontFamily: font.display, fontStyle: 'italic', fontSize: 18, color: c.ink }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.sage }} />You're on the list.
              </div>
            ) : (
              <div className="r-news-form" style={{ display: 'flex', gap: 10 }}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.co.nz"
                  style={{ width: 260, height: 48, border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, padding: '0 16px', fontSize: 14, color: c.ink }}
                />
                <button
                  onClick={() => setSubscribed(true)}
                  className="ab-primary ab-t"
                  style={{ height: 48, padding: '0 24px', background: c.accent, color: c.paper, border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >
                  Subscribe
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <BrandFooter />
    </div>
  )
}
