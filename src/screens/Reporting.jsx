import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, Em, Indicative, Toast } from '../components/ui.jsx'
import { ReportingTabs } from '../components/reportingTabs.jsx'
import { IconLock } from '../components/icons.jsx'
import { useAccess } from '../auth/AuthContext.jsx'
import { NO_OWNER_REASON } from '../auth/roles.js'
import { LockedPanel, MaskedFigure } from '../auth/guards.jsx'
import { canViewReport, reportDenialReason } from '../auth/reportPolicy.js'
import { reporting } from '../data/atelier.js'
import { toCSV, downloadCSVFile, htmlTable, openPrintWindow } from '../utils/exporters.js'

// Blocked-card name → report-library key: each formerly-locked operational report
// now has an indicative preview at /reporting/library?r=<key>.
const BLOCKED_TO_LIBRARY = {
  'Zero-cost sales': 'zerocost',
  'Margin exceptions': 'margin',
  'Stock — holdings · allocations · value': 'stock',
  'Purchases & purchase spend': 'purchases',
  'Shipment tracking': 'shipment',
  'Inwards goods': 'inwards',
  'Delivery details': 'delivery',
}

// Every roll-up on this screen is all-company, and two of them ARE the FY Sales
// headline: byRegion sums to NZ$1,730k and bySalesperson to NZ$1,730,000 — the
// headline exactly. Withholding NZ$1.73M while leaving those on screen hands the
// figure straight back with the addition left as an exercise. So a scoped reader
// (RPT-03) keeps only what carries a salesperson grain — their own row — and the
// aggregates that cannot be scoped are withheld rather than masked in place.
const NO_GRAIN_HINT = 'Your own figures by supplier, range and territory are in the report library — R-01, sales per owner.'

const NO_OWNER_TOAST = 'Nothing to export — this login has no salesperson attached (A6).'

// One scoping pass feeds both the screen and the export. A second copy would drift,
// and the copy that drifts is the one that ships the company's FY figure.
function scopeReporting(access) {
  if (access.all) return { all: true, stats: reporting.stats, salespeople: reporting.bySalesperson, own: null }
  const own = reporting.bySalesperson.find((r) => r.name === access.owner) || null
  // FY Sales is the only headline with an owner grain to fall back to, and it is
  // relabelled because 642,300 under a bare "FY Sales" reads as the company's.
  // The other three are company aggregates with no per-person equivalent here.
  const stats = reporting.stats.map((s) => (
    s.label === 'FY Sales' && own
      ? { ...s, label: `FY Sales · ${own.name}`, value: own.fy, delta: own.yoy, up: own.up }
      : { label: s.label, masked: true }
  ))
  return { all: false, stats, salespeople: own ? [own] : [], own }
}

// The reporting pack as flat sections — one source for both the CSV download and the
// print sheet, built from the scoped view so the export cannot outrun the screen.
const exportSections = ({ all, stats, salespeople }) => {
  const sections = [
    { title: 'KPIs', head: ['Metric', 'Value', 'YoY'], rows: stats.filter((s) => !s.masked).map((s) => [s.label, s.value, s.delta]) },
    { title: all ? 'Sales by salesperson' : 'Sales — own', head: ['Salesperson', 'This yr', 'YoY'], rows: salespeople.map((r) => [r.name, r.fy, r.yoy]) },
  ]
  if (all) sections.push(
    { title: 'By region', head: ['Region', 'NZ$k', 'Share %'], rows: reporting.byRegion.map((r) => [r.region, r.value, r.pct]) },
    { title: 'Top ranges', head: ['Range', 'FY'], rows: reporting.topRanges.map((r) => [r.name, r.value]) },
    { title: 'Sales by brand', head: ['Brand', 'This yr', 'Last yr', 'YoY'], rows: reporting.byBrand.map((b) => [b.brand, b.fy, b.prev, b.yoy]) },
  )
  return sections.filter((s) => s.rows.length)
}

// Period datasets are derived from the real reporting.thisYear / lastYear series.
function datasets() {
  const mCur = reporting.thisYear
  const mPrev = reporting.lastYear
  const mLab = reporting.months
  const sum3 = (a, i) => a[i * 3] + a[i * 3 + 1] + a[i * 3 + 2]
  const qCur = [0, 1, 2, 3].map((i) => sum3(mCur, i))
  const qPrev = [0, 1, 2, 3].map((i) => sum3(mPrev, i))
  const cum = (a) => a.reduce((acc, v) => { acc.push((acc.length ? acc[acc.length - 1] : 0) + v); return acc }, [])
  return {
    Month: { cur: mCur, prev: mPrev, labels: mLab },
    Quarter: { cur: qCur, prev: qPrev, labels: ['Q1', 'Q2', 'Q3', 'Q4'] },
    YTD: { cur: cum(mCur), prev: cum(mPrev), labels: mLab },
  }
}

function buildChart(d) {
  const W = 680, H = 250, padL = 10, padR = 14, padT = 18, padB = 22
  const plotW = W - padL - padR, plotH = H - padT - padB, baseline = padT + plotH
  const n = d.cur.length
  const max = Math.max(...d.cur, ...d.prev) * 1.08
  const x = (i) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW)
  const y = (v) => padT + plotH - (v / max) * plotH
  const pts = (arr) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const curPts = pts(d.cur), prevPts = pts(d.prev)
  const curLine = 'M' + curPts.join(' L')
  const prevLine = 'M' + prevPts.join(' L')
  const area = `M${x(0).toFixed(1)},${baseline} L` + curPts.join(' L') + ` L${x(n - 1).toFixed(1)},${baseline} Z`
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ((padT + plotH * f).toFixed(1)))
  const points = d.cur.map((v, i) => ({
    cx: x(i).toFixed(1), cy: y(v).toFixed(1),
    leftPct: (x(i) / W) * 100, topPct: (y(v) / H) * 100,
    label: d.labels[i], cur: v, prev: d.prev[i],
  }))
  return { W, H, curLine, prevLine, area, grid, points, xlabels: d.labels }
}

// derive region pct widths from real byRegion values
const rMax = Math.max(...reporting.byRegion.map((r) => r.value))
// parse "NZ$391,600" → 391600 for the by-brand bar widths
const num = (s) => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0
const bMax = Math.max(...reporting.byBrand.map((b) => num(b.fy)))

export default function Reporting() {
  const navigate = useNavigate()
  const access = useAccess()
  const scoped = scopeReporting(access)
  const [period, setPeriod] = useState('Month')
  const [hovered, setHovered] = useState(null)
  const [pressed, setPressed] = useState(null)
  const [toast, setToast] = useState(null)

  const press = (k) => () => {
    setPressed(k)
    setTimeout(() => setPressed((p) => (p === k ? null : p)), 220)
  }
  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  const onExcel = () => {
    press('excel')()
    const sections = exportSections(scoped)
    if (!sections.length) { flash(NO_OWNER_TOAST); return }
    const csv = sections
      .map((s) => `${s.title}\r\n` + toCSV(s.head, s.rows))
      .join('\r\n\r\n')
    downloadCSVFile('atelier-reporting-fy2026.csv', csv)
    flash('Reporting pack exported to Excel (CSV).')
  }
  const onPDF = () => {
    press('pdf')()
    const sections = exportSections(scoped)
    if (!sections.length) { flash(NO_OWNER_TOAST); return }
    const html = sections.map((s) => htmlTable(s.title, s.head, s.rows)).join('')
    const ok = openPrintWindow('Atelier reporting — FY2026', html)
    flash(ok ? 'Reporting pack opened for PDF / print.' : 'Allow pop-ups to export the PDF.')
  }

  const periods = ['Month', 'Quarter', 'YTD']
  const chart = scoped.all ? buildChart(datasets()[period]) : null
  const hp = chart && hovered != null && chart.points[hovered] ? chart.points[hovered] : null
  const periodLabel = period === 'YTD' ? 'Year to date' : period === 'Quarter' ? 'By quarter' : 'By month'

  const sage = c.sage, clay = c.clay

  return (
    <>
      <PageHeader
        eyebrow="Analytics · FY2026"
        title={<>The view from <Em>here</Em></>}
        subtitle="Every team member can run their own."
        right={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14 }}>
            {scoped.all && (
              <div style={{ display: 'flex', gap: 22 }}>
                {periods.map((p) => {
                  const on = p === period
                  return (
                    <div key={p} onClick={() => { setPeriod(p); setHovered(null) }}
                      style={{ cursor: 'pointer', paddingBottom: 4, fontSize: 13, color: on ? c.accent : c.muted, fontWeight: on ? 600 : 500, borderBottom: `2px solid ${on ? c.accent : 'transparent'}` }}>
                      {p}
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <button onClick={onExcel} className="ab-t"
                  style={{ height: 38, padding: '0 16px', whiteSpace: 'nowrap', background: pressed === 'excel' ? c.surfaceDeep : c.paper, color: c.ink, border: `1px solid ${c.ink}`, borderRadius: 3, fontSize: 12.5, fontWeight: 500, fontFamily: font.ui, cursor: 'pointer' }}>
                  Export to Excel
                </button>
                <span style={{ marginTop: 5, fontSize: 10.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
                  McKenzie &amp; Willis receive Excel price lists
                </span>
              </div>
              <button onClick={onPDF} className="ab-t"
                style={{ height: 38, padding: '0 16px', whiteSpace: 'nowrap', background: pressed === 'pdf' ? c.surfaceDeep : c.paper, color: c.ink, border: `1px solid ${c.ink}`, borderRadius: 3, fontSize: 12.5, fontWeight: 500, fontFamily: font.ui, cursor: 'pointer', alignSelf: 'flex-start' }}>
                Export to PDF
              </button>
            </div>
          </div>
        }
      />
      <ReportingTabs active="overview" />

      {/* Stat cards */}
      <div className="r-kpi-4" style={{ marginTop: 30, border: `1px solid ${c.line}`, borderRadius: 4, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
        {scoped.stats.map((s, i) => {
          const chipColor = s.up ? sage : clay
          return (
            <div key={s.label} style={{ padding: '20px 22px', borderLeft: i === 0 ? 'none' : `1px solid ${c.line}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>{s.label}</div>
              <div style={{ marginTop: 13, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                {s.masked
                  ? <MaskedFigure label="All-company figure" />
                  : <span style={{ fontFamily: font.display, fontWeight: 500, fontSize: s.value.length > 8 ? 27 : 30, letterSpacing: '-0.01em', color: s.key ? c.accent : c.ink }}>{s.value}</span>}
              </div>
              {!s.masked && (
                <div style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" style={{ transform: s.up ? 'none' : 'rotate(180deg)' }}>
                    <path d="M5 1 L9 8 L1 8 Z" fill={chipColor} />
                  </svg>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: chipColor }}>{s.delta}</span>
                  <span style={{ fontSize: 11, color: c.muted, marginLeft: 2 }}>YoY</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!scoped.all && (
        <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.6, color: c.muted }}>
          {scoped.own
            ? `Company-wide totals are not on your access — FY Sales is scoped to ${scoped.own.name}’s own book (RPT-03).`
            : NO_OWNER_REASON}
        </div>
      )}

      {/* Main grid */}
      <div className="r-ops-2col" style={{ marginTop: 36, display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 40, alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ minWidth: 0 }}>
          {/* Trend chart */}
          {!chart ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 14 }}>Sales trend</div>
              <LockedPanel title="Sales trend — all-company"
                reason="The trend is the company’s monthly sales, this year against last. The series carries no salesperson dimension, so there is no version of it scoped to your own book."
                hint={NO_GRAIN_HINT} />
            </>
          ) : (
          <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Sales trend · {periodLabel}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: c.inkSoft }}>
                <span style={{ width: 16, height: 2, background: c.ink, display: 'inline-block' }}></span>This year
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: c.muted }}>
                <span style={{ width: 16, height: 0, borderTop: `2px dashed ${c.muted}`, display: 'inline-block' }}></span>Last year
              </span>
            </div>
          </div>

          <div style={{ position: 'relative', border: `1px solid ${c.line}`, borderRadius: 4, padding: '14px 16px 8px', background: c.paper }}>
            <svg viewBox="0 0 680 250" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
              {chart.grid.map((gy, i) => (
                <line key={i} x1="10" y1={gy} x2="666" y2={gy} stroke={c.line} strokeWidth="1" />
              ))}
              <path d={chart.area} fill={c.accent} fillOpacity="0.07" />
              <path d={chart.prevLine} fill="none" stroke={c.muted} strokeWidth="1.6" strokeDasharray="5 4" strokeLinejoin="round" />
              <path d={chart.curLine} fill="none" stroke={c.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {chart.points.map((pt, i) => (
                <circle key={i} cx={pt.cx} cy={pt.cy} r="14" fill="transparent"
                  onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }} />
              ))}
              {hp && <circle cx={hp.cx} cy={hp.cy} r="3.5" fill={c.accent} />}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 6px 0' }}>
              {chart.xlabels.map((xl, i) => (
                <span key={i} style={{ fontFamily: font.mono, fontSize: 10, color: c.muted }}>{xl}</span>
              ))}
            </div>
            {hp && (
              <div style={{ position: 'absolute', left: `${hp.leftPct}%`, top: `${hp.topPct}%`, transform: 'translate(-50%,-115%)', background: c.ink, color: c.paper, padding: '8px 11px', borderRadius: 4, whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 8px 22px rgba(33,28,23,.18)' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.brass, marginBottom: 4 }}>{hp.label}</div>
                <div style={{ fontFamily: font.mono, fontSize: 12 }}>This yr&nbsp;&nbsp;NZ${hp.cur}k</div>
                <div style={{ fontFamily: font.mono, fontSize: 12, color: '#B8AE9C' }}>Last yr&nbsp;&nbsp;NZ${hp.prev}k</div>
              </div>
            )}
          </div>
          </>
          )}

          {/* Sales by salesperson */}
          <div style={{ marginTop: 34 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>{scoped.all ? 'Sales by salesperson' : 'Your sales'}</span>
              <Indicative />
            </div>
            {!scoped.salespeople.length ? (
              <LockedPanel title="No own sales to show" reason={NO_OWNER_REASON} hint={NO_GRAIN_HINT} />
            ) : (
            <div className="r-scroll-x" style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 96px', gap: 14, padding: '11px 18px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
                {['Salesperson', 'This yr', 'Last yr', 'YoY'].map((h, i) => (
                  <div key={h} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, textAlign: i === 0 ? 'left' : 'right' }}>{h}</div>
                ))}
              </div>
              {scoped.salespeople.map((r) => (
                <div key={r.name} className="ab-rowhover" style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 96px', gap: 14, alignItems: 'center', padding: '15px 18px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 13, color: c.inkSoft }}>{r.name[0]}</div>
                    <span style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{r.name}</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{r.fy}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.muted, textAlign: 'right' }}>—</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: r.up ? sage : clay, textAlign: 'right' }}>{r.yoy}</span>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ minWidth: 0 }}>
          {/* By region */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>By region</span>
            <Indicative />
          </div>
          {!scoped.all ? (
            <LockedPanel title="Regional split — all-company"
              reason="The five regional bars are the company’s FY sales split by region — they add back to the FY Sales total, so they cannot be shown to a reader that total is withheld from."
              hint={NO_GRAIN_HINT} />
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {reporting.byRegion.map((rg) => (
              <div key={rg.region}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 13, color: c.ink }}>{rg.region}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink }}>NZ${rg.value}k</span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{rg.pct}%</span>
                  </span>
                </div>
                <div style={{ height: 6, background: c.surfaceDeep, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(rg.value / rMax * 100).toFixed(0)}%`, background: c.inkSoft, borderRadius: 3 }}></div>
                </div>
              </div>
            ))}
          </div>
          )}

          {/* Top ranges */}
          <div style={{ marginTop: 36, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 6 }}>Top ranges</div>
          {!scoped.all ? (
            <LockedPanel title="Top ranges — all-company"
              reason="This ranks ranges on the company’s FY sales, not yours."
              hint={NO_GRAIN_HINT} />
          ) : (
          <div style={{ borderTop: `1px solid ${c.line}` }}>
            {reporting.topRanges.map((rn, i) => {
              const [supplier, name] = rn.name.split(' · ')
              return (
                <div key={rn.name} className="ab-rowhover" style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 14, alignItems: 'center', padding: '14px 4px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer', margin: '0 -4px' }}>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: c.brass }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink }}>{name || supplier}</div>
                    {name && <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{supplier}</div>}
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{rn.value}</span>
                </div>
              )
            })}
          </div>
          )}
        </div>
      </div>

      {/* Sales by brand — Charlotte's ask: see how each brand is tracking (groups RPT-01 at brand level) */}
      <div style={{ marginTop: 44 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Sales by brand</span>
          <Indicative />
        </div>
        {!canViewReport(access, 'brandtype') ? (
          <LockedPanel title="Sales by brand — all-company" reason={reportDenialReason('brandtype')} hint={NO_GRAIN_HINT} />
        ) : (
        <div className="r-scroll-x" style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 120px 120px 92px', gap: 14, padding: '11px 18px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
            {['Brand', 'FY26 relative', 'This yr', 'Last yr', 'YoY'].map((h, i) => (
              <div key={h} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, textAlign: i > 1 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {reporting.byBrand.map((b) => (
            <div key={b.brand} className="ab-rowhover" style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 120px 120px 92px', gap: 14, alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer' }}>
              <span style={{ fontFamily: font.display, fontSize: 16, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.brand}</span>
              <div style={{ height: 7, background: c.surfaceDeep, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(num(b.fy) / bMax * 100).toFixed(0)}%`, background: b.up ? sage : clay, borderRadius: 3 }} />
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{b.fy}</span>
              <span style={{ fontFamily: font.mono, fontSize: 13, color: c.muted, textAlign: 'right' }}>{b.prev}</span>
              <span style={{ fontFamily: font.mono, fontSize: 13, color: b.up ? sage : clay, textAlign: 'right' }}>{b.yoy}</span>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* The 7 operational reports — previewable in the library on indicative data;
          live numbers still gated on the A-inputs each card names. */}
      <div style={{ marginTop: 44 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>Operational reports</span>
          <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.clay }}>Indicative previews — live numbers await the A-inputs</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
          {reporting.blocked.map((b) => {
            const libraryKey = BLOCKED_TO_LIBRARY[b.name]
            // A card that deep-links into a report this login is denied is a dead end:
            // the click only ever lands on a LockedPanel. Better it not invite the click.
            const open = Boolean(libraryKey) && canViewReport(access, libraryKey)
            return (
              <div key={b.name} onClick={open ? () => navigate(`/reporting/library?r=${libraryKey}`) : undefined}
                className={open ? 'ab-rowhover' : ''}
                style={{ border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '18px 20px', cursor: open ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {!open && <IconLock size={15} color={c.muted} />}
                  <span style={{ fontFamily: font.display, fontSize: 15.5, color: c.ink }}>{b.name}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{b.desc}</div>
                {open
                  ? <div style={{ marginTop: 10, fontSize: 11.5, color: c.accent }}>Preview in the report library →</div>
                  : libraryKey && <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.5, color: c.clay }}>{reportDenialReason(libraryKey)}</div>}
                <div style={{ marginTop: 12, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>Live numbers await</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {b.awaits.map((a) => (
                    <span key={a} style={{ fontFamily: font.mono, fontSize: 10.5, border: `1px solid ${c.line}`, borderRadius: 3, padding: '3px 8px', color: c.clay }}>{a}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {toast && <Toast>{toast}</Toast>}
    </>
  )
}
