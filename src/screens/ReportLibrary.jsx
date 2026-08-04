// Report Library — the twelve standing reports (R-01…R-12), parameterised and
// exportable. Implements Reports.dc.html. All figures indicative (fake-for-now);
// datasets live in data/reportLibrary.js, table shapes in utils/reportBuilders.js.
// What a login may read of them is decided in auth/reportPolicy.js, not here.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, Em, Eyebrow, StatusPill, Toast } from '../components/ui.jsx'
import { ReportingTabs } from '../components/reportingTabs.jsx'
import { REPORTS, REPORT_GROUP_ORDER, PERIODS, brandTypes, designSales } from '../data/reportLibrary.js'
import { buildReport, reportDef, exportRows } from '../utils/reportBuilders.js'
import { toCSV, downloadCSVFile, htmlTable, openPrintWindow } from '../utils/exporters.js'
import { useAccess } from '../auth/AuthContext.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { canViewReport, reportDenialReason, reportIsMasked, reportDesc } from '../auth/reportPolicy.js'

const SELECT_BG = '#F3EADF' // active rail / pill tint from the design ref (between paper & surface)

const FONT_MAP = { serif: font.display, mono: font.mono, ui: font.ui }
const DEFAULT_SIZE = { serif: 15, mono: 12.5, ui: 13 }

function Cell({ cell }) {
  if (cell.kind === 'pill') return <StatusPill tone={cell.tone}>{cell.t}</StatusPill>
  return (
    <div style={{ textAlign: cell.align, minWidth: 0 }}>
      <div style={{
        fontFamily: FONT_MAP[cell.font], fontSize: cell.size || DEFAULT_SIZE[cell.font],
        color: c[cell.color] || c.inkSoft, fontWeight: cell.weight, lineHeight: 1.45,
        whiteSpace: cell.wrap ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        display: cell.hex ? 'flex' : undefined, alignItems: cell.hex ? 'center' : undefined, gap: cell.hex ? 9 : undefined,
      }}>
        {/* R-12 only. The swatch is decoration on a cell that already carries the
            colourway's name and SKU, so nothing is lost in the CSV or the print sheet. */}
        {cell.hex && <span aria-hidden="true" style={{ flex: 'none', width: 11, height: 11, background: cell.hex, border: `1px solid ${c.line}`, borderRadius: 2 }} />}
        {cell.t}
      </div>
      {cell.sub && (
        <div style={{ marginTop: 2, fontSize: 10.5, color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.sub}</div>
      )}
    </div>
  )
}

function Pill({ label, on, onClick }) {
  return (
    <div onClick={onClick} className="ab-t" style={{
      padding: '6px 12px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: 4,
      cursor: 'pointer', fontSize: 12, fontFamily: font.ui,
      color: on ? c.accent : c.inkSoft, background: on ? SELECT_BG : 'transparent',
    }}>{label}</div>
  )
}

function PillGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginRight: 2 }}>{label}</span>
      {children}
    </div>
  )
}

// Stands where the table would be when the report is open to this login but has no
// rows to show it. Deliberately not a LockedPanel: nothing is being withheld here,
// the grain to answer the question is missing — and reading as "restricted" would
// blame the role for what is actually A6.
function EmptyPanel({ children }) {
  return (
    <div style={{ marginTop: 16, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '28px 30px' }}>
      <Eyebrow>Nothing to show</Eyebrow>
      <div style={{ marginTop: 10, maxWidth: 620, fontFamily: font.display, fontStyle: 'italic', fontSize: 14, lineHeight: 1.6, color: c.inkSoft }}>{children}</div>
    </div>
  )
}

export default function ReportLibrary() {
  const [params] = useSearchParams()
  const access = useAccess()
  const requested = params.get('r')
  // A deep link to a report this login cannot read keeps its key and locks: silently
  // landing them on R-01 instead would answer a question they didn't ask.
  const initialKey = REPORTS.some((r) => r.key === requested) ? requested : 'owner'

  const [report, setReport] = useState(initialKey)
  const [period, setPeriod] = useState('FY')
  const [dim, setDim] = useState(() => { const d = reportDef(initialKey); return d.dims ? d.dims[0][0] : null })
  const [brand, setBrand] = useState(brandTypes[0].brand)
  const [design, setDesign] = useState(designSales[0].design)
  const [pressed, setPressed] = useState(null)
  const [toast, setToast] = useState(null)

  const selectReport = (key) => {
    const d = reportDef(key)
    setReport(key)
    setDim(d.dims ? d.dims[0][0] : null)
  }
  const press = (k) => {
    setPressed(k)
    setTimeout(() => setPressed((p) => (p === k ? null : p)), 220)
  }
  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  const def = reportDef(report)
  // A denied report is never built. buildReport() only masks columns — a whole-report
  // denial that reached the builder would render nothing but still hand its rows to
  // the export buttons below.
  const allowed = canViewReport(access, report)
  const table = allowed ? buildReport({ report, period, dim, brand, design }, access) : null
  const masked = allowed && reportIsMasked(access, report)
  const showTable = allowed && !table.empty
  const showBrands = def.key === 'brandtype' && dim === 'within'
  const showDesigns = def.key === 'designsales' && dim !== 'design'
  // A report may carry periods on some views and not others (R-12's year view IS the
  // period axis) — a pill that visibly does nothing reads as a broken control.
  const showPeriods = def.periods && (!def.periodDims || def.periodDims.includes(dim))
  const periodLabel = (table && table.periodLabel) || (showPeriods ? (PERIODS.find((p) => p.key === period) || PERIODS[2]).label : 'FY2026')
  // A single-subject view must name its subject in the export, or the CSV of "Nuage,
  // by year" is filed under a title that could be any of the seven designs.
  const subject = showDesigns ? ` · ${design}` : showBrands ? ` · ${brand}` : ''
  const exportTitle = `${def.code} ${def.name}${subject} — ${periodLabel}`

  const onExcel = () => {
    press('excel')
    const { head, rows } = exportRows(table)
    downloadCSVFile(`atelier-${def.code.toLowerCase()}-${def.key}.csv`, `${exportTitle}\r\n` + toCSV(head, rows))
    flash(`${def.code} exported to Excel (CSV).`)
  }
  const onPDF = () => {
    press('pdf')
    const { head, rows } = exportRows(table)
    const ok = openPrintWindow(`Atelier — ${exportTitle}`, htmlTable(exportTitle, head, rows))
    flash(ok ? `${def.code} opened for PDF / print.` : 'Allow pop-ups to export the PDF.')
  }

  const groups = REPORT_GROUP_ORDER
    .map((label) => ({ label, items: REPORTS.filter((r) => r.group === label && canViewReport(access, r.key)) }))
    .filter((g) => g.items.length)
  const gridCols = showTable ? table.cols.map((cl) => cl.w).join(' ') : ''

  const exportBtn = (key, label, onClick) => (
    <button onClick={onClick} className="ab-t" style={{
      height: 38, padding: '0 16px', whiteSpace: 'nowrap',
      background: pressed === key ? c.surfaceDeep : c.paper, color: c.ink,
      border: `1px solid ${c.ink}`, borderRadius: 4, fontSize: 12.5, fontWeight: 500, fontFamily: font.ui, cursor: 'pointer',
    }}>{label}</button>
  )

  return (
    <>
      <PageHeader
        eyebrow="Reporting · FY2026"
        title={<>The Report <Em>Library</Em></>}
        subtitle="Twelve standing reports — parameterised, previewed, exported. All figures indicative."
      />
      <ReportingTabs active="library" />

      <div className="rl-grid" style={{ marginTop: 30, display: 'grid', gridTemplateColumns: '308px 1fr', gap: 40, alignItems: 'start' }}>

        {/* Report rail */}
        <div className="rl-rail">
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, padding: '0 14px 8px' }}>{g.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {g.items.map((it) => {
                  const on = it.key === report
                  return (
                    <div key={it.key} onClick={() => selectReport(it.key)} className={on ? '' : 'ab-rowhover'} style={{
                      display: 'flex', gap: 12, padding: '11px 14px', borderRadius: 4, cursor: 'pointer',
                      background: on ? SELECT_BG : 'transparent',
                    }}>
                      <div style={{ width: 2, flex: 'none', alignSelf: 'stretch', background: on ? c.accent : 'transparent', borderRadius: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink, fontWeight: on ? 600 : 400 }}>{it.name}</div>
                        <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.4, color: c.muted }}>{reportDesc(it, access)}</div>
                      </div>
                      <span style={{ flex: 'none', fontFamily: font.mono, fontSize: 10, color: c.brass, paddingTop: 3 }}>{it.code}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Report panel */}
        <section style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: c.brass }}>{def.code}</span>
            <div>
              <h2 style={{ margin: 0, fontFamily: font.display, fontWeight: 500, fontSize: 25, color: c.ink }}>{def.name}</h2>
              <div style={{ marginTop: 5, fontSize: 12.5, color: c.muted }}>{reportDesc(def, access)}</div>
            </div>
          </div>

          {!allowed && (
            <div style={{ marginTop: 20 }}>
              <LockedPanel reason={reportDenialReason(report)} />
            </div>
          )}

          {/* Parameters — kept for an empty report: it is available to this login,
              it simply has no rows, and hiding its controls would read as broken. */}
          {allowed && (
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap', minHeight: 32 }}>
              {showPeriods && (
                <PillGroup label="Period">
                  {PERIODS.map((p) => <Pill key={p.key} label={p.label} on={period === p.key} onClick={() => setPeriod(p.key)} />)}
                </PillGroup>
              )}
              {showBrands && (
                <PillGroup label="Brand">
                  {brandTypes.map((b) => <Pill key={b.brand} label={b.brand} on={brand === b.brand} onClick={() => setBrand(b.brand)} />)}
                </PillGroup>
              )}
              {showDesigns && (
                <PillGroup label="Design">
                  {designSales.map((d) => <Pill key={d.design} label={d.design} on={design === d.design} onClick={() => setDesign(d.design)} />)}
                </PillGroup>
              )}
              {def.dims && (
                <PillGroup label="View">
                  {def.dims.map(([k, label]) => <Pill key={k} label={label} on={dim === k} onClick={() => setDim(k)} />)}
                </PillGroup>
              )}
            </div>
          )}

          {allowed && !showTable && <EmptyPanel>{table.emptyReason}</EmptyPanel>}

          {showTable && (
            <>
              {/* Says the table is short of columns before it is read — an unannounced
                  mask is worse than a locked report, because it looks complete. */}
              {masked && (
                <div style={{ marginTop: 14, fontSize: 12, color: c.muted }}>
                  Cost and margin columns are not shown on your access — this table is partial.
                </div>
              )}

              {/* Preview table */}
              <div style={{ marginTop: 16, border: `1px solid ${c.line}`, borderRadius: 4, overflowX: 'auto' }}>
                <div style={{ minWidth: table.minW }}>
                  <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, padding: '11px 18px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
                    {table.cols.map((cl) => (
                      <div key={cl.t} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, textAlign: cl.align, whiteSpace: 'nowrap' }}>{cl.t}</div>
                    ))}
                  </div>
                  {table.rows.map((r, i) => (
                    <div key={i} className={r.total ? '' : 'ab-rowhover'} style={{
                      display: 'grid', gridTemplateColumns: gridCols, gap: 14, alignItems: 'center',
                      padding: '14px 18px', borderBottom: `1px solid ${c.line}`,
                      background: r.total ? c.surface : 'transparent',
                    }}>
                      {r.cells.map((cell, j) => <Cell key={j} cell={cell} />)}
                    </div>
                  ))}
                </div>
              </div>

              {table.note && (
                <div style={{ marginTop: 12, fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.muted, lineHeight: 1.5 }}>{table.note}</div>
              )}

              {/* Footer */}
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: c.muted }}>
                  <span style={{ fontFamily: font.mono, color: c.inkSoft }}>{table.rows.length}</span> rows · Indicative · Synced with the back office
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  {exportBtn('excel', 'Export to Excel', onExcel)}
                  {exportBtn('pdf', 'Export to PDF', onPDF)}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {toast && <Toast>{toast}</Toast>}
    </>
  )
}
