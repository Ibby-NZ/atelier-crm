import { useEffect, useState } from 'react'
import { c, font, shadow } from '../theme.js'
import { PageHeader, Em, StatusPill, Swatch } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { IconBarcode } from '../components/icons.jsx'
import { samples } from '../data/atelier.js'

// Sample Tracker PWA preview: a phone-frame mock of the barcode scanner for sending, returning
// and locating samples. No camera, no backend — the Dataverse-vs-PWA backend call (§6.1) is
// still open, so this preview writes nothing and simulates the scan against the samples register.

const target = samples.rows[0] // Wright — Clay · ATL-0049-217 · out with Marlow & Finch, overdue

const CONFIRMATIONS = {
  send: 'Marked for send — loan opens on sync',
  return: 'Returned to library — shelf 12C',
}

export default function SampleScanner() {
  const [phase, setPhase] = useState('idle') // 'idle' | 'scanning' | 'result'
  const [action, setAction] = useState(null) // null | 'send' | 'return' | 'locate'

  useEffect(() => {
    if (phase !== 'scanning') return undefined
    const t = setTimeout(() => setPhase('result'), 1400)
    return () => clearTimeout(t)
  }, [phase])

  const reset = () => {
    setPhase('idle')
    setAction(null)
  }

  const actionButton = (key, label, primary = false) => (
    <button key={key} onClick={() => setAction(key)} className="ab-t"
      style={{ height: 44, borderRadius: 4, fontFamily: font.ui, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', border: `1px solid ${primary ? c.accent : c.ink}`, background: primary ? c.accent : c.paper, color: primary ? c.paper : c.ink }}>
      {label}
    </button>
  )

  const cornerTick = (pos) => (
    <span key={JSON.stringify(pos)} style={{ position: 'absolute', width: 22, height: 22, ...pos }} />
  )

  return (
    <>
      <PageHeader
        eyebrow="Sample tracker · Mobile"
        title={<>Scan, send, <Em>return</Em></>}
        subtitle="A phone-frame preview of the barcode PWA for sending, returning and locating samples."
        right={<StatusPill tone="clay">Preview — backend pending the Dataverse-vs-PWA decision (§6.1)</StatusPill>}
      />

      <SectionTabs tabs={samplesTabs} active="scanner" />

      {/* phone frame */}
      <div style={{ width: 390, maxWidth: '100%', margin: '34px auto 0', border: `10px solid ${c.ink}`, borderRadius: 44, background: c.paper, overflow: 'hidden', boxShadow: shadow.lift }}>
        {/* status bar */}
        <div style={{ background: c.ink, color: c.paper, padding: '10px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: font.mono, fontSize: 10.5 }}>9:41</span>
          <span style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: '0.18em' }}>ATELIER SCANNER · PWA</span>
          <span style={{ fontFamily: font.mono, fontSize: 10.5 }}>▮▮▮</span>
        </div>
        <div style={{ background: '#F0E2D8', color: c.clay, fontSize: 10.5, padding: '7px 16px', textAlign: 'center' }}>
          Preview only — no camera, no backend (§6.1)
        </div>

        <div style={{ minHeight: 520, padding: '26px 20px 30px', display: 'flex', flexDirection: 'column' }}>
          {phase === 'idle' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
              <button onClick={() => setPhase('scanning')} className="ab-t" aria-label="Scan a sample barcode"
                style={{ width: 120, height: 120, borderRadius: '50%', border: `2px solid ${c.accent}`, background: '#F3EADF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <IconBarcode size={40} color={c.accent} />
              </button>
              <div style={{ fontSize: 13, color: c.inkSoft }}>Tap to scan a sample barcode</div>
              <div style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>ATL-… barcode set · same register as Samples</div>
            </div>
          )}

          {phase === 'scanning' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ position: 'relative', aspectRatio: '4 / 3', background: c.surfaceDeep, borderRadius: 6, overflow: 'hidden' }}>
                {cornerTick({ top: 10, left: 10, borderTop: `2px solid ${c.brass}`, borderLeft: `2px solid ${c.brass}` })}
                {cornerTick({ top: 10, right: 10, borderTop: `2px solid ${c.brass}`, borderRight: `2px solid ${c.brass}` })}
                {cornerTick({ bottom: 10, left: 10, borderBottom: `2px solid ${c.brass}`, borderLeft: `2px solid ${c.brass}` })}
                {cornerTick({ bottom: 10, right: 10, borderBottom: `2px solid ${c.brass}`, borderRight: `2px solid ${c.brass}` })}
                <div style={{ position: 'absolute', left: '8%', right: '8%', top: '8%', height: 2, background: c.accent, animation: 'ab-scan 1.6s ease-in-out infinite' }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 12.5, color: c.muted }}>Hold steady — reading barcode…</div>
            </div>
          )}

          {phase === 'result' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ border: `1px solid ${c.line}`, borderRadius: 6, background: c.surface, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Swatch tone={target.tone} size={44} radius={6} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: font.display, fontSize: 18, color: c.ink }}>{target.design}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted, marginTop: 2 }}>{target.barcode} · {target.supplier}</div>
                  </div>
                  <StatusPill tone="clay">Out · overdue</StatusPill>
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: c.inkSoft }}>Last seen — with {target.holder} · {target.since}</div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: c.muted }}>{target.loanHistory.length} loans on record · append-only history</div>
              </div>

              {action === 'locate' && (
                <div style={{ border: `1px solid ${c.line}`, borderRadius: 6, padding: '14px 16px', background: c.paper }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>Located</div>
                  <div style={{ marginTop: 7, fontFamily: font.display, fontSize: 16, color: c.ink }}>Parnell showroom · Sample wall B</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: c.muted }}>Last movement 25 Jun · with {target.holder}</div>
                </div>
              )}
              {(action === 'send' || action === 'return') && (
                <div style={{ borderRadius: 6, padding: '12px 16px', background: '#E9EDE0', color: c.sage, fontSize: 12.5 }}>
                  {CONFIRMATIONS[action]}
                </div>
              )}

              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {actionButton('send', 'Send', true)}
                {actionButton('return', 'Return')}
                {actionButton('locate', 'Locate')}
                <button onClick={reset} className="ab-t"
                  style={{ height: 38, borderRadius: 4, fontFamily: font.ui, fontSize: 12.5, cursor: 'pointer', border: 'none', background: 'transparent', color: c.muted }}>
                  Scan again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: '22px auto 0', maxWidth: 480, textAlign: 'center', fontSize: 12.5, color: c.muted, lineHeight: 1.6 }}>
        Installable on phone or tablet as a PWA. Uses the same ATL-… barcode set as the Samples register.
        The backend (Dataverse vs. standalone) is the §6.1 decision — this preview writes nothing.
      </div>
    </>
  )
}
