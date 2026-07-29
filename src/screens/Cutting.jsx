import { useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, Em, StatusPill, PrimaryButton, Swatch, Toast, Indicative, Hairline } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import { parseQuantity, dualUnit } from '../utils/units.js'

// Cutting — UI-only preview of a cutting docket that records fabric cut-to-length and tracks each
// roll's remnant balance. The cutting PROCESS is still owed from Charlotte (TO SCOPE), so this
// writes nothing: it simulates the roll balances and docket lines in local state to show the flow.
// A balance under the remnant threshold flags the roll to move to the remnant bin.

const REMNANT_THRESHOLD = 3 // m — below this, the balance is a remnant, not a full roll

// Stub rolls. balance = full − cut-to-date; each roll cut reduces its balance.
const INITIAL = [
  { roll: 'R-ATL04-118', design: 'Atlas — Indigo', tone: ['#5C6B86', '#2C3A55'], full: 40, cut: 22 },
  { roll: 'R-ATL01-091', design: 'Atlas — Natural', tone: ['#E9DEC9', '#C7B189'], full: 36, cut: 8 },
  { roll: 'R-WRT03-066', design: 'Wright — Clay', tone: ['#B7917A', '#7C5645'], full: 30, cut: 27.5 },
]

export default function Cutting() {
  const [rolls, setRolls] = useState(INITIAL)
  const [rollSel, setRollSel] = useState(INITIAL[0].roll)
  const [cut, setCut] = useState('')
  const [dockets, setDockets] = useState([])
  const [toast, setToast] = useState(null)

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800) }
  const roll = rolls.find((r) => r.roll === rollSel)
  const metres = parseQuantity(cut)
  const balance = roll ? roll.full - roll.cut : 0

  function record() {
    if (!roll || metres <= 0) { flash('Enter a cut length in metres.'); return }
    if (metres > balance) { flash(`Only ${balance} m left on ${roll.roll} — cut cannot exceed the balance.`); return }
    setRolls((prev) => prev.map((r) => (r.roll === rollSel ? { ...r, cut: r.cut + metres } : r)))
    const newBalance = Math.round((balance - metres) * 100) / 100
    setDockets((prev) => [
      { id: `CUT-${String(prev.length + 1).padStart(4, '0')}`, roll: roll.roll, design: roll.design, metres, balance: newBalance },
      ...prev,
    ])
    flash(`Cut ${metres} m from ${roll.roll} — ${newBalance} m left. Preview only, nothing committed.`)
    setCut('')
  }

  const headCell = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, textAlign: 'right', padding: '0 0 10px' }
  const cell = { fontFamily: font.mono, fontSize: 13, textAlign: 'right' }

  return (
    <>
      <PageHeader
        eyebrow="Stock · Cutting"
        title={<>Cutting <Em>docket</Em></>}
        subtitle="Record fabric cut-to-length and track each roll's remnant balance."
        right={<StatusPill tone="clay">Preview — cutting process owed from Charlotte</StatusPill>}
      />

      <SectionTabs tabs={stockTabs} active="cutting" />

      <div style={{ marginTop: 12, background: '#F3EAE2', border: '1px solid #E2C9B8', borderRadius: 4, padding: '10px 14px', fontSize: 12, color: '#8A4A33' }}>
        Illustrative preview — Charlotte's cutting process is still owed (TO SCOPE). This simulates roll balances
        and dockets in the page only; it writes nothing and resets on reload.
      </div>

      <div className="r-ops-2col" style={{ marginTop: 26, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 40, alignItems: 'start' }}>

        {/* Rolls + docket log */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 12 }}>Rolls on hand</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.line}` }}>
                <th style={{ ...headCell, textAlign: 'left' }}>Design / roll</th>
                <th style={headCell}>Full</th>
                <th style={headCell}>Cut</th>
                <th style={headCell}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rolls.map((r) => {
                const bal = Math.round((r.full - r.cut) * 100) / 100
                const remnant = bal <= REMNANT_THRESHOLD
                return (
                  <tr key={r.roll} style={{ borderBottom: `1px solid ${c.line}` }}>
                    <td style={{ padding: '13px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Swatch tone={r.tone} size={30} radius={5} />
                        <div>
                          <div style={{ fontFamily: font.display, fontSize: 14.5, color: c.ink }}>{r.design}</div>
                          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, marginTop: 2 }}>{r.roll}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...cell, color: c.inkSoft }}>{r.full} m</td>
                    <td style={{ ...cell, color: c.inkSoft }}>{r.cut} m</td>
                    <td style={{ padding: '13px 0', textAlign: 'right' }}>
                      <div style={{ fontFamily: font.mono, fontSize: 13.5, color: remnant ? c.clay : c.ink }}>{bal} m</div>
                      {remnant
                        ? <div style={{ fontSize: 10, color: c.clay, marginTop: 2 }}>Remnant — move to remnant bin</div>
                        : <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>≈ {dualUnit(bal).yards}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 28, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 12 }}>Docket log</div>
          {dockets.length === 0
            ? <div style={{ fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No cuts recorded yet — record one on the right and it appears here.</div>
            : (
              <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
                {dockets.map((d, i) => (
                  <div key={d.id}>
                    {i > 0 && <Hairline />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px' }}>
                      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.accent }}>{d.id}</span>
                      <span style={{ fontSize: 12.5, color: c.ink }}>{d.design}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{d.roll}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: font.mono, fontSize: 12.5, color: c.ink }}>{d.metres} m · {dualUnit(d.metres).yards}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, minWidth: 78, textAlign: 'right' }}>bal {d.balance} m</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Cut form */}
        <aside style={{ border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '22px 22px 24px', position: 'sticky', top: 20 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Record a cut</div>

          <label style={{ display: 'block', marginTop: 18, fontSize: 11.5, color: c.muted }}>Roll</label>
          <select value={rollSel} onChange={(e) => setRollSel(e.target.value)}
            style={{ width: '100%', marginTop: 6, height: 40, border: `1px solid ${c.line}`, borderRadius: 3, background: c.paper, padding: '0 10px', fontFamily: font.ui, fontSize: 13, color: c.ink }}>
            {rolls.map((r) => <option key={r.roll} value={r.roll}>{r.design} · {r.roll}</option>)}
          </select>
          {roll && <div style={{ marginTop: 6, fontFamily: font.mono, fontSize: 11, color: c.muted }}>Balance {balance} m · ≈ {dualUnit(balance).yards}</div>}

          <label style={{ display: 'block', marginTop: 16, fontSize: 11.5, color: c.muted }}>Cut-to-length (m)</label>
          <input value={cut} onChange={(e) => setCut(e.target.value)} placeholder="6" inputMode="decimal"
            style={{ width: '100%', marginTop: 6, height: 40, border: `1px solid ${c.line}`, borderRadius: 3, background: c.paper, padding: '0 12px', fontFamily: font.mono, fontSize: 13, color: c.ink }} />
          {metres > 0 && <div style={{ marginTop: 6, fontFamily: font.mono, fontSize: 11, color: c.muted }}>≈ {dualUnit(metres).yards} · leaves {Math.round((balance - metres) * 100) / 100} m</div>}

          <PrimaryButton onClick={record} style={{ width: '100%', marginTop: 20 }}>Record cut</PrimaryButton>
          <div style={{ marginTop: 12, fontSize: 10.5, color: c.muted, lineHeight: 1.5 }}>
            <Indicative /> · a balance of {REMNANT_THRESHOLD} m or less is flagged as a remnant.
          </div>
        </aside>
      </div>

      {toast && <Toast>{toast}</Toast>}
    </>
  )
}
