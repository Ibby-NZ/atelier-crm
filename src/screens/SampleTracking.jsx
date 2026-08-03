import { useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, Em, StatusPill, Swatch, Indicative } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { IconSearch, IconBarcode, IconClose } from '../components/icons.jsx'
import { samples } from '../data/atelier.js'

const COLS = '1.6fr 1.1fr 130px 130px 1.2fr 110px'

// derive an editable register from the shared data module (since-days as numbers)
function seed() {
  return samples.rows.map((r) => {
    const isOut = r.status === 'Out'
    const days = isOut ? parseInt(String(r.since), 10) || 0 : 0
    return {
      name: r.design, supplier: r.supplier, barcode: r.barcode, tone: r.tone,
      status: r.status, heldBy: r.holder, days, overdue: !!r.overdue,
      loanHistory: r.loanHistory || [],
    }
  })
}

export default function SampleTracking() {
  const [rowsState, setRows] = useState(seed)
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('Out')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [supplierFilter, setSupplierFilter] = useState('All')
  const [banner, setBanner] = useState(null) // { msg, kind }
  const [historyOf, setHistoryOf] = useState(null) // selected sample → loan-history modal

  // ---- derived stats -------------------------------------------------------
  const out = rowsState.filter((s) => s.status === 'Out').length
  const inLib = rowsState.filter((s) => s.status === 'In library').length
  const overdueCount = rowsState.filter((s) => s.status === 'Out' && s.days >= 14).length
  const stats = [
    { label: 'Samples out', value: String(out), color: c.ink },
    { label: 'In library', value: String(inLib), color: c.ink },
    { label: 'Overdue', value: String(overdueCount), color: c.accent },
  ]

  // ---- filters -------------------------------------------------------------
  const statusOpts = ['All', 'In library', 'Out', 'Overdue']
  const supplierOpts = ['All', ...Array.from(new Set(rowsState.map((s) => s.supplier)))]

  const q = query.trim().toLowerCase()
  const matchQ = (s) =>
    !q || [s.name, s.supplier, s.barcode, s.heldBy, s.status].some((v) => String(v).toLowerCase().includes(q))
  const matchStatus = (s) =>
    statusFilter === 'All'
      ? true
      : statusFilter === 'Overdue'
        ? s.status === 'Out' && s.days >= 14
        : s.status === statusFilter
  const matchSupplier = (s) => supplierFilter === 'All' || s.supplier === supplierFilter

  const filtered = rowsState.filter((s) => matchQ(s) && matchStatus(s) && matchSupplier(s))

  // ---- scan ----------------------------------------------------------------
  function doScan() {
    const cd = (code || rowsState[0].barcode).trim().toUpperCase()
    const idx = rowsState.findIndex((x) => x.barcode.toUpperCase() === cd)
    if (idx < 0) {
      setScanOpen(false)
      setCode('')
      setBanner({ msg: `No sample matches barcode ${cd}.`, kind: 'bad' })
      return
    }
    const nm = rowsState[idx].name
    setRows((prev) =>
      prev.map((x, i) => {
        if (i !== idx) return x
        return mode === 'Out'
          ? { ...x, status: 'Out', heldBy: 'New loan — unassigned', days: 0, overdue: false }
          : { ...x, status: 'In library', heldBy: '—', days: 0, overdue: false }
      }),
    )
    setScanOpen(false)
    setCode('')
    setBanner({
      msg:
        mode === 'Out'
          ? `${nm} (${cd}) checked out — loan opened.`
          : `${nm} (${cd}) checked in — returned to the library.`,
      kind: 'good',
    })
  }

  const bannerMap = {
    good: { bg: '#EEF0E6', border: '#CBD3BC', dot: c.sage },
    bad: { bg: '#F3EAE2', border: '#E2C9B8', dot: c.clay },
  }
  const bk = banner ? bannerMap[banner.kind] : null

  // ---- small pieces --------------------------------------------------------
  const ModeToggle = ({ h = 46, pad = 16, fs = 13 }) => (
    <div style={{ display: 'inline-flex', border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
      {['Out', 'In'].map((m) => {
        const on = m === mode
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="ab-t"
            style={{
              border: 'none', cursor: 'pointer', padding: `0 ${pad}px`, height: h, fontSize: fs,
              fontWeight: 500, fontFamily: font.ui,
              background: on ? c.ink : 'transparent', color: on ? c.paper : c.inkSoft,
            }}
          >
            {m}
          </button>
        )
      })}
    </div>
  )

  const FilterPills = ({ label, opts, value, onSet }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginRight: 2 }}>
        {label}
      </span>
      {opts.map((o) => {
        const on = o === value
        return (
          <div
            key={o}
            onClick={() => onSet(o)}
            className="ab-t"
            style={{
              padding: '6px 12px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: 4,
              cursor: 'pointer', fontSize: 12, color: on ? c.accent : c.inkSoft,
              background: on ? '#F3EADF' : 'transparent',
            }}
          >
            {o}
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <PageHeader
        eyebrow="Library Asset"
        title={<>Sample <Em>Tracking</Em></>}
        subtitle="A non-financial balance-sheet asset — tracked apart from saleable stock."
      />

      <SectionTabs tabs={samplesTabs} active="tracking" />

      {/* Scan region */}
      <div
        className="r-st-scan"
        style={{
          border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface,
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 0,
        }}
      >
        <div style={{ padding: '24px 26px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <button
            onClick={() => setScanOpen(true)}
            className="ab-t ab-primary"
            style={{
              display: 'flex', alignItems: 'center', gap: 11, height: 46, padding: '0 22px',
              background: c.accent, color: c.paper, border: 'none', borderRadius: 4,
              fontSize: 14, fontWeight: 500, fontFamily: font.ui, cursor: 'pointer',
            }}
          >
            <IconBarcode size={18} color="#E8C9A0" />
            Scan sample
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 14px',
                border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper,
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>
                Barcode
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={rowsState[0]?.barcode || 'ATL-0049-217'}
                style={{
                  width: 150, border: 'none', background: 'transparent',
                  fontFamily: font.mono, fontSize: 14, color: c.ink,
                }}
              />
            </div>
            <ModeToggle />
          </div>
        </div>

        {/* stat tiles */}
        <div className="r-st-tiles" style={{ display: 'flex', borderLeft: `1px solid ${c.line}` }}>
          {stats.map((s) => (
            <div key={s.label} style={{ padding: '20px 26px', borderLeft: `1px solid ${c.line}`, minWidth: 118 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: c.muted }}>
                {s.label}
              </div>
              <div style={{ marginTop: 10, fontFamily: font.display, fontWeight: 500, fontSize: 28, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* scan result banner */}
      {banner && bk && (
        <div
          style={{
            marginTop: 16, display: 'flex', alignItems: 'center', gap: 12,
            border: `1px solid ${bk.border}`, borderRadius: 4, background: bk.bg, padding: '12px 16px',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: bk.dot, flex: 'none' }} />
          <span style={{ fontSize: 13, color: c.ink }}>{banner.msg}</span>
          <span
            onClick={() => setBanner(null)}
            style={{ marginLeft: 'auto', fontSize: 11.5, color: c.muted, cursor: 'pointer', borderBottom: `1px dotted ${c.muted}` }}
          >
            Dismiss
          </span>
        </div>
      )}

      {/* Register */}
      <div style={{ marginTop: 34 }}>
        {/* search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 280, height: 48,
              padding: '0 16px', border: `1px solid ${focused ? c.brass : c.line}`, borderRadius: 4, background: c.paper,
            }}
          >
            <IconSearch size={18} color={c.brass} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search by design, colourway, supplier, barcode or who's holding it"
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14.5, color: c.ink }}
            />
            <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>
              {filtered.length} of {rowsState.length}
            </span>
          </div>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
          <FilterPills label="Status" opts={statusOpts} value={statusFilter} onSet={setStatusFilter} />
          <FilterPills label="Supplier" opts={supplierOpts} value={supplierFilter} onSet={setSupplierFilter} />
        </div>

        {/* table */}
        <div className="r-scroll-x" style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '11px 18px',
              background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`,
            }}
          >
            {['Design · Colourway', 'Supplier', 'Barcode', 'Status', 'Held by', 'Out since'].map((h, i) => (
              <div
                key={h}
                style={{
                  fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: c.muted, textAlign: i === 5 ? 'right' : 'left',
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {filtered.map((s, i) => {
            const isOut = s.status === 'Out'
            const overdueRow = isOut && s.days >= 14
            return (
              <div
                key={s.barcode + i}
                className="ab-rowhover ab-t"
                onClick={() => setHistoryOf(s)}
                title="View loan history"
                style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center',
                  padding: '16px 18px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Swatch tone={s.tone} size={30} radius={5} />
                  <span
                    style={{
                      fontFamily: font.display, fontSize: 15.5, color: c.ink,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {s.name}
                  </span>
                </div>
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>{s.supplier}</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft }}>{s.barcode}</span>
                <div>
                  <StatusPill tone={isOut ? 'clay' : 'sage'}>{s.status}</StatusPill>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.heldBy}
                  </div>
                  {overdueRow && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        setBanner({ msg: `Reminder sent to ${s.heldBy} — ${s.name} (${s.barcode}).`, kind: 'good' })
                      }}
                      style={{ fontSize: 11, color: c.accent, borderBottom: `1px solid ${c.accent}`, cursor: 'pointer' }}
                    >
                      Send reminder
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: font.mono, fontSize: 13.5,
                      color: overdueRow ? c.clay : isOut ? c.inkSoft : c.muted,
                    }}
                  >
                    {isOut ? `${s.days} days` : '—'}
                  </div>
                  {overdueRow && (
                    <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.clay, marginTop: 2 }}>
                      Overdue at 14
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 13, color: c.muted }}>
              No samples match — try a different term or clear the filters.
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <Indicative /> <span style={{ fontSize: 12, color: c.muted }}>Sample register is a non-financial asset — no sale value attached. Click a row to see its loan history.</span>
        </div>
      </div>

      {/* Loan-history modal — Charlotte's ask: view a sample's loan trail to see how it is performing */}
      {historyOf && (() => {
        const h = historyOf.loanHistory || []
        const completed = h.filter((e) => e.returned)
        const avgDays = completed.length ? Math.round(completed.reduce((a, e) => a + (e.days || 0), 0) / completed.length) : 0
        const openLoan = h.find((e) => !e.returned)
        return (
          <div
            onClick={() => setHistoryOf(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(51,49,43,.46)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: 500, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: c.paper, border: `1px solid ${c.line}`, borderRadius: 8, boxShadow: '0 24px 60px rgba(51,49,43,.3)' }}
            >
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Swatch tone={historyOf.tone} size={34} radius={5} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Loan history</div>
                    <div style={{ fontFamily: font.display, fontSize: 20, color: c.ink, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{historyOf.name}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted, marginTop: 2 }}>{historyOf.supplier} · {historyOf.barcode}</div>
                  </div>
                </div>
                <div onClick={() => setHistoryOf(null)} style={{ width: 30, height: 30, flex: 'none', border: `1px solid ${c.line}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <IconClose size={15} color={c.muted} />
                </div>
              </div>

              {/* summary tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: `1px solid ${c.line}` }}>
                {[
                  { label: 'Total loans', value: String(h.length) },
                  { label: 'Avg days out', value: avgDays ? `${avgDays}` : '—' },
                  { label: 'Status', value: openLoan ? 'Out' : 'In library', accent: !!openLoan },
                ].map((t, i) => (
                  <div key={t.label} style={{ padding: '16px 20px', borderLeft: i ? `1px solid ${c.line}` : 'none' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{t.label}</div>
                    <div style={{ marginTop: 8, fontFamily: font.display, fontWeight: 500, fontSize: 22, color: t.accent ? c.accent : c.ink }}>{t.value}</div>
                  </div>
                ))}
              </div>

              {/* loan trail */}
              <div style={{ padding: '18px 24px 24px' }}>
                {h.length === 0 && (
                  <div style={{ fontSize: 13, color: c.muted, padding: '10px 0' }}>No loans recorded yet — this sample has stayed in the library.</div>
                )}
                {h.map((e, i) => {
                  const openRow = !e.returned
                  return (
                    <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i === h.length - 1 ? 0 : 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 11, height: 11, borderRadius: '50%', background: openRow ? c.accent : c.sage, flex: 'none', marginTop: 3 }} />
                        {i !== h.length - 1 && <div style={{ flex: 1, width: 2, background: c.line, marginTop: 4 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 14, color: c.ink, fontWeight: 500 }}>{e.holder}</span>
                          <span style={{ fontFamily: font.mono, fontSize: 12, color: openRow ? c.accent : c.muted, flex: 'none' }}>{openRow ? `${e.days} days · out` : `${e.days} days`}</span>
                        </div>
                        <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted, marginTop: 3 }}>{e.out} → {e.returned || 'present'}</div>
                        {e.note && <div style={{ fontSize: 12, color: c.inkSoft, marginTop: 4, fontStyle: 'italic', fontFamily: font.display }}>{e.note}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Scan modal */}
      {scanOpen && (
        <div
          onClick={() => setScanOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(51,49,43,.46)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: '100%', background: c.paper, border: `1px solid ${c.line}`,
              borderRadius: 8, overflow: 'hidden', boxShadow: '0 24px 60px rgba(51,49,43,.3)',
            }}
          >
            <div
              style={{
                padding: '20px 24px', borderBottom: `1px solid ${c.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
                  Scanner
                </div>
                <div style={{ fontFamily: font.display, fontSize: 20, color: c.ink, marginTop: 3 }}>
                  Scan a sample {mode === 'Out' ? 'out' : 'in'}
                </div>
              </div>
              <div
                onClick={() => setScanOpen(false)}
                style={{
                  width: 30, height: 30, border: `1px solid ${c.line}`, borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.muted,
                }}
              >
                <IconClose size={15} color={c.muted} />
              </div>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ position: 'relative', height: 170, borderRadius: 4, background: c.ink, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 18, border: '1px solid rgba(169,139,93,.4)', borderRadius: 4 }} />
                <div style={{ position: 'absolute', left: 18, top: 18, width: 22, height: 22, borderLeft: `2px solid ${c.brass}`, borderTop: `2px solid ${c.brass}` }} />
                <div style={{ position: 'absolute', right: 18, top: 18, width: 22, height: 22, borderRight: `2px solid ${c.brass}`, borderTop: `2px solid ${c.brass}` }} />
                <div style={{ position: 'absolute', left: 18, bottom: 18, width: 22, height: 22, borderLeft: `2px solid ${c.brass}`, borderBottom: `2px solid ${c.brass}` }} />
                <div style={{ position: 'absolute', right: 18, bottom: 18, width: 22, height: 22, borderRight: `2px solid ${c.brass}`, borderBottom: `2px solid ${c.brass}` }} />
                <div
                  style={{
                    position: 'absolute', left: '18%', right: '18%', height: 2,
                    background: c.accent, boxShadow: `0 0 12px ${c.accent}`,
                    animation: 'ab-scan 2s ease-in-out infinite',
                  }}
                />
                <div
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center',
                    fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.brass,
                  }}
                >
                  Position barcode within frame
                </div>
              </div>

              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Or type the barcode"
                  style={{
                    flex: 1, height: 42, border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper,
                    padding: '0 13px', fontFamily: font.mono, fontSize: 14, color: c.ink,
                  }}
                />
                <ModeToggle h={42} pad={13} fs={12.5} />
              </div>

              <button
                onClick={doScan}
                className="ab-t ab-primary"
                style={{
                  marginTop: 16, width: '100%', height: 46, background: c.accent, color: c.paper,
                  border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 500, fontFamily: font.ui, cursor: 'pointer',
                }}
              >
                Confirm scan {mode === 'Out' ? 'out' : 'in'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
