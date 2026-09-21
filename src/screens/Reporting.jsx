// Reporting · Overview — LIVE as of 16 Sep 2026.
//
// This screen used to be the demo's invented roll-up: a fictional FY, a region
// split that summed to a headline nobody earned, a wall of "blocked" reports.
// The client asked for it to read the platform and to work with the rest of
// Reporting, so it now draws three things and every one of them is the API's
// own answer:
//
//   · the same KPIs the dashboard shows (`mtdKpi`/`openKpi`/`inboundKpi` from
//     ./dashboard.js, reused rather than re-derived — the landing tiles and this
//     page cannot disagree about month-to-date sales),
//   · two live report tables, fetched from /admin/reports/* and rendered by the
//     same buildLiveReport + <ReportTable> the Report Library uses, so a row
//     here drills down exactly as a row there does, and
//   · the library's own filter bar, held in the URL. Apply a period here and
//     "Open the full report" carries it into the library; a drill-down carries
//     it into the order desk. That is what makes the three Reporting screens one
//     tool.
//
// Every rule lives in ./reportingOverview.js with its test beside it; this file
// is layout and effects. The fixtures in src/data/atelier.js are no longer read
// by this screen.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font, radius } from '../theme.js'
import { PageHeader, Em, Indicative, Toast, StatusPill } from '../components/ui.jsx'
import { ReportingTabs } from '../components/reportingTabs.jsx'
import { InsightSection } from './ReportInsight.jsx'
import { ReportTable, StatePanel } from '../components/reportTable.jsx'
import { useAccess } from '../auth/AuthContext.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { canViewReport, reportDenialReason } from '../auth/reportPolicy.js'
import { apiFetch } from '../lib/api.js'
import { buildLiveReport, liveMaskedNote, liveNote } from '../utils/reportBuilders.js'
import {
  EMPTY_REPORT_FILTERS,
  categoryOptionsFor,
  hasReportFilters,
  reportFilterError,
  reportFiltersFromParams,
  reportSearchParams,
} from '../utils/reportFilters.js'
import { useCategories } from '../admin/useCategories.js'
import { toCSV, downloadCSVFile, htmlTable, openPrintWindow } from '../utils/exporters.js'
import { DASHBOARD_PATH, inboundKpi, mtdKpi, openKpi } from './dashboard.js'
import {
  OVERVIEW_PANELS,
  overviewExportSections,
  overviewFetchPath,
  overviewReportHref,
  periodLabel,
} from './reportingOverview.js'
import { Field, Select, cellInput, messageOf } from '../admin/parts.jsx'

const filterControl = { ...cellInput, width: 'auto' }
const filterButton = {
  height: cellInput.height, padding: '0 14px', background: 'transparent', color: c.accent,
  border: `1px solid ${c.accent}`, borderRadius: 4, fontSize: 12, fontFamily: font.ui, cursor: 'pointer',
}
const exportButton = (pressed) => ({
  height: 38, padding: '0 16px', whiteSpace: 'nowrap', background: pressed ? c.surfaceDeep : c.paper,
  color: c.ink, border: `1px solid ${c.ink}`, borderRadius: 4, fontSize: 12.5, fontWeight: 500,
  fontFamily: font.ui, cursor: 'pointer',
})

const PANEL_ERROR = 'We could not reach the platform for this report. Check the API is running and try again.'

export default function Reporting() {
  const access = useAccess()
  // The category select draws the live vocabulary — the office adds categories
  // on Catalogue → Categories, and a report that cannot be filtered by one is a
  // report about a catalogue the office no longer has.
  const { options: categoryOptions } = useCategories()
  const [params, setParams] = useSearchParams()
  // The APPLIED filters live in the URL — the library's rule, for the library's
  // reason: the report routes are rate-limited, so what is being typed stays in
  // state and only Apply reaches the API. It is also what lets one link carry a
  // period from here into the library.
  const applied = reportFiltersFromParams(params)
  const [draft, setDraft] = useState(() => reportFiltersFromParams(params))
  const [filterError, setFilterError] = useState('')
  const [pressed, setPressed] = useState(null)
  const [toast, setToast] = useState(null)

  const [kpis, setKpis] = useState({ payload: null, error: '' })
  // One entry per panel, keyed by its report key: { loading, error, payload }.
  const [live, setLive] = useState({})

  const flash = (message) => {
    setToast(message)
    setTimeout(() => setToast(null), 2600)
  }
  const press = (key) => {
    setPressed(key)
    setTimeout(() => setPressed((current) => (current === key ? null : current)), 220)
  }

  // The dashboard read. Same endpoint the landing page uses, so the two agree by
  // construction. StrictMode double-mounts; the active flag keeps the stale pass
  // silent.
  useEffect(() => {
    let active = true
    apiFetch(DASHBOARD_PATH)
      .then((payload) => active && setKpis({ payload, error: '' }))
      .catch((err) => active && setKpis({ payload: null, error: messageOf(err, 'The figures could not be loaded.') }))
    return () => {
      active = false
    }
  }, [])

  // The live panels. Keyed on the serialised applied filters — a primitive, so
  // an effect keyed on it fires once per Apply rather than for ever (the rule
  // useAdminList states for its own dependencies).
  const appliedKey = params.toString()
  useEffect(() => {
    let active = true
    const filters = reportFiltersFromParams(new URLSearchParams(appliedKey))
    for (const panel of OVERVIEW_PANELS) {
      if (!canViewReport(access, panel.key)) continue
      setLive((current) => ({ ...current, [panel.key]: { loading: true, error: '', payload: null } }))
      apiFetch(overviewFetchPath(panel.path, filters))
        .then((payload) => {
          if (active) setLive((current) => ({ ...current, [panel.key]: { loading: false, error: '', payload } }))
        })
        .catch((err) => {
          if (!active) return
          setLive((current) => ({
            ...current,
            [panel.key]: { loading: false, error: messageOf(err, PANEL_ERROR), payload: null },
          }))
        })
    }
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey, access])

  const applyFilters = (event) => {
    event.preventDefault()
    const invalid = reportFilterError(draft)
    if (invalid) {
      setFilterError(invalid)
      return
    }
    setFilterError('')
    // `r` is the library's key and means nothing here; reportSearchParams is
    // reused for one vocabulary across the three screens, and the overview
    // simply drops it.
    const { r, ...rest } = reportSearchParams('overview', draft)
    setParams(rest, { replace: true })
  }

  const clearFilters = () => {
    setFilterError('')
    setDraft(EMPTY_REPORT_FILTERS)
    setParams({}, { replace: true })
  }

  const setFilter = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }))

  // The tables, built the moment their payload lands. A panel the login may not
  // read is absent rather than empty: an empty table under a heading reads as
  // "nothing sold".
  const panels = OVERVIEW_PANELS.map((panel) => {
    const allowed = canViewReport(access, panel.key)
    const state = live[panel.key] ?? { loading: allowed, error: '', payload: null }
    const table = state.payload ? buildLiveReport(state.payload, { hide: panel.hide }) : null
    return { ...panel, allowed, state, table }
  })

  const exportSections = overviewExportSections(panels)
  const onExcel = () => {
    press('excel')
    if (!exportSections.length) return flash('Nothing to export yet.')
    const csv = exportSections.map((s) => `${s.title}\r\n` + toCSV(s.head, s.rows)).join('\r\n\r\n')
    downloadCSVFile('atelier-reporting-overview.csv', csv)
    flash('Overview exported to Excel (CSV).')
  }
  const onPDF = () => {
    press('pdf')
    if (!exportSections.length) return flash('Nothing to export yet.')
    const html = exportSections.map((s) => htmlTable(s.title, s.head, s.rows)).join('')
    flash(
      openPrintWindow('Atelier reporting — overview', html)
        ? 'Overview opened for PDF / print.'
        : 'Allow pop-ups to export the PDF.'
    )
  }

  const kpiCards = [
    { label: 'Sales · MTD', ...mtdKpi(kpis.payload?.sales_mtd ?? null, { allAccess: access.all }), key: true },
    { label: 'Open orders', ...openKpi(kpis.payload?.open_orders ?? null) },
    { label: 'Inbound shipments', ...inboundKpi(kpis.payload?.inbound ?? null) },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Reporting · live"
        title={<>The view from <Em>here</Em></>}
        subtitle={`Read straight from the platform — ${periodLabel(applied)}. Narrow it below and the same period follows you into the report library.`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onExcel} className="ab-t" style={exportButton(pressed === 'excel')}>
              Export to Excel
            </button>
            <button onClick={onPDF} className="ab-t" style={exportButton(pressed === 'pdf')}>
              Export to PDF
            </button>
          </div>
        }
      />
      <ReportingTabs active="overview" />

      {/* The live filter bar — the same five the report library sends, so a
          period applied here is the period the full report opens on. */}
      <form
        onSubmit={applyFilters}
        style={{ marginTop: 24, display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}
      >
        <Field label="Category">
          <Select value={draft.category} onChange={setFilter('category')} style={{ ...filterControl, minWidth: 130 }}>
            <option value="">All</option>
            {categoryOptionsFor(categoryOptions, draft.category).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <input type="date" value={draft.from} onChange={setFilter('from')} style={filterControl} />
        </Field>
        <Field label="To">
          <input type="date" value={draft.to} onChange={setFilter('to')} style={filterControl} />
        </Field>
        <Field label="Brand code">
          <input value={draft.brand_code} onChange={setFilter('brand_code')} placeholder="e.g. CF" style={{ ...filterControl, width: 110 }} />
        </Field>
        <Field label="Range">
          <input value={draft.range} onChange={setFilter('range')} placeholder="e.g. PIERRE FREY" style={{ ...filterControl, width: 170 }} />
        </Field>
        <button type="submit" className="ab-t" style={filterButton}>Apply</button>
        {(hasReportFilters(draft) || hasReportFilters(applied)) && (
          <button type="button" className="ab-t" onClick={clearFilters} style={{ ...filterButton, borderColor: c.line, color: c.inkSoft }}>
            Clear
          </button>
        )}
      </form>
      {filterError && <div style={{ marginTop: 10, fontSize: 12, color: c.clay }}>{filterError}</div>}

      {/* The KPIs the dashboard shows, on the same read. The filter bar does not
          touch them — they are month-to-date and the open book by definition,
          and narrowing them to a typed range would make two figures called
          "MTD" on two screens mean different things. */}
      <div
        className="r-kpi-4"
        style={{ marginTop: 26, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}
      >
        {kpiCards.map((kpi) => (
          <div key={kpi.label} style={{ minWidth: 0, padding: 20, borderRadius: radius.md, background: c.paper, border: `1px solid ${c.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.inkSoft }}>
                {kpi.label}
              </span>
              {kpi.indicative && <Indicative />}
            </div>
            <div
              title={kpi.withheld ? 'Company-wide sales — not available on your access' : undefined}
              style={{ marginTop: 14, fontFamily: font.mono, fontWeight: 500, fontSize: 29, letterSpacing: '-0.01em', overflowWrap: 'anywhere', color: kpi.withheld ? c.muted : (kpi.key ? c.accent : c.ink) }}
            >
              {kpi.value}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5, color: c.muted }}>{kpi.note}</div>
          </div>
        ))}
      </div>
      {kpis.error && <div style={{ marginTop: 10, fontSize: 12, color: c.clay }}>{kpis.error}</div>}

      {/* The live tables. Same renderer as the report library, so a row that can
          be opened is opened the same way. */}
      {panels.map((panel) => (
        <section key={panel.key} style={{ marginTop: 34 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontFamily: font.display, fontWeight: 500, fontSize: 22, color: c.ink }}>{panel.title}</h2>
                <StatusPill tone="sage">Live</StatusPill>
              </div>
              <div style={{ marginTop: 5, fontSize: 12.5, color: c.muted }}>{panel.blurb}</div>
            </div>
            {panel.allowed && (
              <Link
                to={overviewReportHref(panel.key, applied)}
                className="ab-t"
                style={{ ...filterButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
              >
                Open the full report →
              </Link>
            )}
          </div>

          {!panel.allowed && (
            <div style={{ marginTop: 16 }}>
              <LockedPanel reason={reportDenialReason(panel.key)} />
            </div>
          )}
          {panel.allowed && panel.state.loading && (
            <StatePanel eyebrow="Reading the platform">Fetching this report from the live data…</StatePanel>
          )}
          {panel.allowed && panel.state.error && (
            <StatePanel eyebrow="Could not load">{panel.state.error}</StatePanel>
          )}
          {panel.allowed && panel.table && panel.table.empty && (
            <StatePanel eyebrow="Nothing to show">{panel.table.emptyReason}</StatePanel>
          )}
          {panel.allowed && panel.table && !panel.table.empty && (
            <>
              {liveMaskedNote(panel.state.payload?.meta ?? {}) && (
                <div style={{ marginTop: 14, fontSize: 12, color: c.muted }}>
                  {liveMaskedNote(panel.state.payload?.meta ?? {})}
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <ReportTable table={panel.table} />
              </div>
              {liveNote(panel.state.payload?.meta ?? {}) && (
                <div style={{ marginTop: 12, fontFamily: font.display, fontStyle: 'italic', fontSize: 13, color: c.muted, lineHeight: 1.5 }}>
                  {liveNote(panel.state.payload?.meta ?? {})}
                </div>
              )}
            </>
          )}
        </section>
      ))}

      {/* Live insight — one subject, every angle — shares the overview page. */}
      <InsightSection />

      {toast && <Toast>{toast}</Toast>}
    </>
  )
}
