// Report Library — the standing reports (R-01…R-13), parameterised and
// exportable. Implements Reports.dc.html. Table shapes live in
// utils/reportBuilders.js. What a login may read of them is decided in
// auth/reportPolicy.js, not here.
//
// FOUR OF THE THIRTEEN ARE LIVE NOW (R-05, R-10, R-11, R-13): they are fetched
// from atelier-api rather than built from data/reportLibrary.js, and everything
// about them — which columns exist, which were withheld, what the figures cover
// — is the server's answer. The rest are still the indicative fixtures, and R-13
// is the one with no fixture at all.
//
// A LIVE REPORT DRAWS NO DEMO CONTROL. The Period, View, Brand and Design pills
// parameterise a fixture and reach nothing on the server, so they are hidden
// rather than left live: a pill that visibly does nothing reads as a broken
// control, which is the same rule that hides the period pills on R-12's year
// view. What a live report draws instead is the LIVE filter bar below —
// category, a date range, brand code and range, sent to the API as a
// querystring (utils/reportFilters.js builds it). ONE bar serves every
// live report, which is the API's own design: a filter a report cannot honour
// is declined server-side and named in `meta.ignored_filters`, which liveNote()
// prints under the table — so the stock snapshot ignoring a date range is said,
// never silent. Filters are APPLIED, not sent per keystroke: the report routes
// are rate-limited and a free-text filter would otherwise spend the bucket one
// letter at a time.
//
// ROWS LEAD SOMEWHERE (Userback 8287873). A live row that has an order behind it
// is a link — to the order desk filtered to it, or, from an aggregate row, to
// R-13 with that row's dimension applied. Where it leads is decided in
// reportBuilders.js off the row the API sent, so this file only asks whether a
// row has a link. The report and the APPLIED filters therefore live in the
// URL rather than in state: this screen is usually already mounted when one of
// its own rows is clicked, and a filter held in state would let the address bar
// change while the table stayed as it was.
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, Em, StatusPill, Toast } from '../components/ui.jsx'
import { ReportingTabs } from '../components/reportingTabs.jsx'
import { ReportTable, StatePanel } from '../components/reportTable.jsx'
import { insightRoute } from '../utils/insight.js'
import { REPORTS, REPORT_GROUP_ORDER, PERIODS, brandTypes, designSales } from '../data/reportLibrary.js'
import { buildReport, buildLiveReport, liveReportPath, reportDef, exportRows } from '../utils/reportBuilders.js'
import {
  EMPTY_REPORT_FILTERS,
  REPORT_CATEGORIES,
  buildReportQuery,
  hasReportFilters,
  reportFilterError,
  reportFiltersFromParams,
  reportSearchParams,
} from '../utils/reportFilters.js'
import { toCSV, downloadCSVFile, htmlTable, openPrintWindow } from '../utils/exporters.js'
import { apiGet } from '../lib/api.js'
import { useAccess } from '../auth/AuthContext.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { canViewReport, reportDenialReason, reportIsMasked, reportDesc } from '../auth/reportPolicy.js'

const SELECT_BG = '#F3EADF' // active rail / pill tint from the design ref (between paper & surface)

// Cell, ReportRow, ReportTable and StatePanel live in components/reportTable.jsx
// now — the Insight view draws the same descriptor.

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

// The live filter bar's controls, kept visually beside the pill groups they
// replace on a live report: same eyebrow label, a real input underneath.
const filterControl = {
  height: 32, padding: '0 10px', border: `1px solid ${c.line}`, borderRadius: 4,
  background: c.paper, color: c.ink, fontSize: 12.5, fontFamily: font.ui,
}
const filterButton = {
  height: 32, padding: '0 14px', background: 'transparent', color: c.accent,
  border: `1px solid ${c.accent}`, borderRadius: 4, fontSize: 12, fontFamily: font.ui, cursor: 'pointer',
}

function FilterField({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{label}</span>
      {children}
    </label>
  )
}

const LIVE_IDLE = { loading: false, error: '', payload: null }
const LIVE_ERROR = 'We could not reach the platform for this report. Check the API is running and try again.'
// The demo tables' mask is REPORT_POLICY's; a live table's is the API's, and the
// two never speak about the same report.
const DEMO_MASK_NOTE = 'Cost and margin columns are not shown on your access — this table is partial.'

export default function ReportLibrary() {
  const [params, setParams] = useSearchParams()
  const access = useAccess()
  const requested = params.get('r')
  // A deep link to a report this login cannot read keeps its key and locks: silently
  // landing them on R-01 instead would answer a question they didn't ask.
  const report = REPORTS.some((r) => r.key === requested) ? requested : 'owner'
  // The applied filters, read from the same URL. What is being TYPED stays in
  // state below: the report routes are rate-limited, so the draft reaches the
  // URL — and the API — only when Apply is pressed.
  const applied = reportFiltersFromParams(params)

  const [period, setPeriod] = useState('FY')
  const [dim, setDim] = useState(() => { const d = reportDef(report); return d.dims ? d.dims[0][0] : null })
  const [brand, setBrand] = useState(brandTypes[0].brand)
  const [design, setDesign] = useState(designSales[0].design)
  const [pressed, setPressed] = useState(null)
  const [toast, setToast] = useState(null)
  const [live, setLive] = useState(LIVE_IDLE)
  // The live filter bar: what is being typed. The querystring actually in flight
  // is `appliedQuery`, built from the URL — one bar, one filter set, and it
  // survives switching between the live reports, because selectReport carries it
  // across (the API declares per report what it ignored).
  const [filterDraft, setFilterDraft] = useState(() => reportFiltersFromParams(params))
  const [filterError, setFilterError] = useState('')
  const appliedQuery = buildReportQuery(applied)

  const selectReport = (key) => setParams(reportSearchParams(key, applied), { replace: true })
  const press = (k) => {
    setPressed(k)
    setTimeout(() => setPressed((p) => (p === k ? null : p)), 220)
  }
  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  const def = reportDef(report)
  // A denied report is never built or fetched. buildReport() only masks columns — a
  // whole-report denial that reached the builder would render nothing but still hand
  // its rows to the export buttons below — and a fetch would only collect the API's
  // own 403 to print.
  const allowed = canViewReport(access, report)
  const livePath = allowed ? liveReportPath(report) : null
  // Path plus the APPLIED filters — the one string the fetch below keys on, so
  // applying, clearing, or switching live reports each land as exactly one
  // request, and an unapplied draft lands as none.
  const liveUrl = livePath ? `${livePath}${appliedQuery}` : null

  // The live read. Keyed on the URL, which is a primitive: an effect keyed on an
  // object literal takes a new identity every render and refetches for ever. The
  // `active` flag is the house pattern — StrictMode double-mounts in dev.
  useEffect(() => {
    if (!liveUrl) {
      setLive(LIVE_IDLE)
      return undefined
    }
    let active = true
    setLive({ loading: true, error: '', payload: null })
    apiGet(liveUrl)
      .then((payload) => {
        if (active) setLive({ loading: false, error: '', payload })
      })
      .catch((err) => {
        // The API phrases its own refusals well (a 403 says why, a 400 names the
        // filter); messageOf's job here is only to stand in for a network drop.
        if (active) setLive({ loading: false, error: (err && err.message) || LIVE_ERROR, payload: null })
      })
    return () => {
      active = false
    }
  }, [liveUrl])

  // The View pills belong to the report on screen, and the report can now change
  // without a click on the rail — a row link, or the back button. Resetting them
  // with it is what stops the strip highlighting a view the new report has not
  // got. Keyed on a primitive, like every effect here.
  useEffect(() => {
    const d = reportDef(report)
    setDim(d.dims ? d.dims[0][0] : null)
  }, [report])

  // A report arrived at WITH filters — a drill-down from another report's row —
  // has to fill the boxes as well as narrow the table. A bar reading empty over
  // a narrowed table says those rows are all there are.
  useEffect(() => {
    setFilterDraft(reportFiltersFromParams(new URLSearchParams(appliedQuery)))
    setFilterError('')
  }, [appliedQuery])

  const setFilter = (key) => (event) => {
    setFilterError('')
    const value = event.target.value
    setFilterDraft((d) => ({ ...d, [key]: value }))
  }
  const applyFilters = (event) => {
    event.preventDefault()
    // The one mistake worth refusing before a round trip — a backwards range's
    // only other symptom is an empty report, which reads as "no trade".
    const refused = reportFilterError(filterDraft)
    setFilterError(refused)
    if (!refused) setParams(reportSearchParams(report, filterDraft), { replace: true })
  }
  // The draft is cleared here as well as through the effect: clearing a bar that
  // was typed into but never applied moves no filter in the URL, so the effect
  // would not run and the boxes would keep what was in them.
  const clearFilters = () => {
    setFilterError('')
    setFilterDraft({ ...EMPTY_REPORT_FILTERS })
    setParams(reportSearchParams(report, EMPTY_REPORT_FILTERS), { replace: true })
  }

  const table = livePath
    ? (live.payload ? buildLiveReport(live.payload) : null)
    : (allowed ? buildReport({ report, period, dim, brand, design }, access) : null)
  // A live table was masked by the API before this screen existed, so the note is
  // the server's own list of what it withheld; a demo table's comes from
  // REPORT_POLICY. One report, one authority — running the CRM's policy over a
  // live table would act on labels that are not there.
  const maskedNote = livePath
    ? (table ? table.masked : '')
    : (allowed && reportIsMasked(access, report) ? DEMO_MASK_NOTE : '')
  const showTable = Boolean(table) && !table.empty
  // Every demo control is hidden on a live report: none of them reaches the server.
  const showBrands = !livePath && def.key === 'brandtype' && dim === 'within'
  const showDesigns = !livePath && def.key === 'designsales' && dim !== 'design'
  // A report may carry periods on some views and not others (R-12's year view IS the
  // period axis) — a pill that visibly does nothing reads as a broken control.
  const showPeriods = !livePath && def.periods && (!def.periodDims || def.periodDims.includes(dim))
  const periodLabel = (table && table.periodLabel) || (showPeriods ? (PERIODS.find((p) => p.key === period) || PERIODS[2]).label : 'FY2026')
  // A single-subject view must name its subject in the export, or the CSV of "Nuage,
  // by year" is filed under a title that could be any of the seven designs.
  const subject = showDesigns ? ` · ${design}` : showBrands ? ` · ${brand}` : ''
  // A live file is titled by the report the SERVER answered with, and says so: the
  // two are different documents and a reader opening one a week later has only the
  // title to tell them apart.
  const exportTitle = livePath && live.payload
    ? `${def.code} ${live.payload.title} — live`
    : `${def.code} ${def.name}${subject} — ${periodLabel}`
  const description = livePath && live.payload ? live.payload.title : reportDesc(def, access)

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
  // The whole platform's insight under the bar's applied context — the door
  // beside the filters, for a reader who wants every angle rather than one table.
  const insightHref = insightRoute(applied)

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
        subtitle="Thirteen standing reports — parameterised, previewed, exported. All figures indicative."
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontFamily: font.display, fontWeight: 500, fontSize: 25, color: c.ink }}>{def.name}</h2>
                {/* Which of the two kinds of figure this is, said before it is read:
                    the rest of the library is indicative and this one is not. */}
                {livePath && <StatusPill tone="sage">Live</StatusPill>}
              </div>
              <div style={{ marginTop: 5, fontSize: 12.5, color: c.muted }}>{description}</div>
            </div>
          </div>

          {!allowed && (
            <div style={{ marginTop: 20 }}>
              <LockedPanel reason={reportDenialReason(report)} />
            </div>
          )}

          {/* The LIVE filter bar — the querystring the API's report routes take.
              Drawn only on a live report: on a fixture nothing it sends would be
              read. It is a <form>, so Enter in a text input applies. The bar
              does not vary per report on purpose: the API declares per report
              which filters it ignored, and liveNote() prints that under the
              table — hiding the date inputs on the stock snapshot would hide
              the very sentence that teaches why they do nothing there. */}
          {allowed && livePath && (
            <form
              onSubmit={applyFilters}
              style={{ marginTop: 20, display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}
            >
              <FilterField label="Category">
                <select
                  value={filterDraft.category}
                  onChange={setFilter('category')}
                  style={{ ...filterControl, minWidth: 130 }}
                >
                  <option value="">All</option>
                  {REPORT_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="From">
                <input type="date" value={filterDraft.from} onChange={setFilter('from')} style={filterControl} />
              </FilterField>
              <FilterField label="To">
                <input type="date" value={filterDraft.to} onChange={setFilter('to')} style={filterControl} />
              </FilterField>
              <FilterField label="Brand code">
                <input
                  value={filterDraft.brand_code}
                  onChange={setFilter('brand_code')}
                  placeholder="e.g. CF"
                  style={{ ...filterControl, width: 110 }}
                />
              </FilterField>
              <FilterField label="Range">
                <input
                  value={filterDraft.range}
                  onChange={setFilter('range')}
                  placeholder="e.g. PIERRE FREY"
                  style={{ ...filterControl, width: 170 }}
                />
              </FilterField>
              <button type="submit" className="ab-t" style={filterButton}>Apply</button>
              {(hasReportFilters(filterDraft) || appliedQuery) && (
                <button type="button" className="ab-t" onClick={clearFilters} style={{ ...filterButton, borderColor: c.line, color: c.inkSoft }}>
                  Clear
                </button>
              )}
              {canViewReport(access, 'insight') && (
                <Link to={insightHref} className="ab-t" style={{ ...filterButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', marginLeft: 'auto' }}>
                  Explore every angle →
                </Link>
              )}
            </form>
          )}
          {/* A refused filter set is named here and never sent — the same line a
              400 from the API would land on, so the two mistakes read alike. */}
          {allowed && livePath && filterError && (
            <div style={{ marginTop: 10, fontSize: 12, color: c.clay }}>{filterError}</div>
          )}

          {/* Parameters — kept for an empty report: it is available to this login,
              it simply has no rows, and hiding its controls would read as broken.
              A live report has none of them; see the file header. */}
          {allowed && !livePath && (
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

          {/* Both keyed on livePath as well as on the state: the effect clears
              `live` when the selection moves to a fixture report, and it runs one
              render after the click. */}
          {livePath && live.loading && (
            <StatePanel eyebrow="Reading the platform">
              Fetching this report from the live data…
            </StatePanel>
          )}

          {/* An API that refused or could not be reached says so in its own words.
              Rendering an empty table instead would present "we could not ask" as
              "there is nothing there", which are opposite answers. */}
          {livePath && live.error && <StatePanel eyebrow="Could not load">{live.error}</StatePanel>}

          {allowed && table && !showTable && (
            <StatePanel eyebrow="Nothing to show">{table.emptyReason}</StatePanel>
          )}

          {showTable && (
            <>
              {/* Says the table is short of columns before it is read — an unannounced
                  mask is worse than a locked report, because it looks complete. */}
              {maskedNote && (
                <div style={{ marginTop: 14, fontSize: 12, color: c.muted }}>{maskedNote}</div>
              )}

              {/* Preview table */}
              <div style={{ marginTop: 16 }}>
                <ReportTable table={table} />
              </div>

              {table.note && (
                <div style={{ marginTop: 12, fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.muted, lineHeight: 1.5 }}>{table.note}</div>
              )}

              {/* Footer */}
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: c.muted }}>
                  <span style={{ fontFamily: font.mono, color: c.inkSoft }}>{table.rows.length}</span>
                  {livePath ? ' rows · Live from the platform' : ' rows · Indicative · Synced with the back office'}
                  {/* Said once, where the row count is, rather than on every row:
                      the hover already shows a row is a target, but nothing says
                      what is on the other side of it. */}
                  {table.rows.some((r) => r.link) && ' · Open a row to see everything behind it'}
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
