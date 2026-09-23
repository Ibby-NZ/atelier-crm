// Freight rates — the append-only ledger behind the landed-cost waterfall,
// wired to atelier-api's /admin/freight/rates* (W16 US-008/US-009).
//
//   GET  /admin/freight/rates?supplier_id=&range_name=&category=&limit=
//                                       → { rates, meta: { total, …, note } }
//   GET  /admin/freight/rates/export.csv → the whole ledger, newest first
//   POST /admin/freight/rates/validate   → the dry run; writes nothing
//   POST /admin/freight/rates/apply      → one transaction, all or none
//
// **There is deliberately no Edit, no Archive and no Delete on this screen**,
// and that is the API's design, not an omission here (FR-192): a rate carries
// `effective_from` and a new rate never overwrites the old one — that is what
// makes the >=5% annual uplift auditable and what lets a 2024 landed cost be
// reconciled. A correction is a NEW row dated from the day it takes effect,
// and the resolver picks the newest dated rate at or before the day it is
// asked about. The ledger panel says so in the API's own words: the GET's
// `meta.note` is rendered as the copy, so the sentence cannot drift from what
// the routes actually do.
//
// The list is grouped by scope rather than paged: one rate per scope per year
// means the whole ledger fits one fetch at the API's own cap for years (see
// RATE_LEDGER_LIMIT), and the history under each scope IS the point of an
// append-only table.
//
// **Appending a rate is a page of its own** (AdminFreightRateNew,
// /admin/freight/new). The form dropped down above the ledger until the client
// asked for every data-entry form to open on a page instead (23 Sep 2026); the
// scope rules it carries (a supplier OR a range, exactly one — the schema's
// CHECK) went with it. This screen is the ledger, its filters and the yearly
// sheet — and nothing on it posts a single rate.
//
// Every rule with a wrong answer lives in ./adminFreight.js and is tested
// there; there is no jsdom in this repo, so this file is layout.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import { apiDownload, apiFetch } from '../lib/api.js'
import { buildListQuery, listPath } from '../admin/list.js'
import {
  APPLY_PATH,
  EXPORT_PATH,
  NEW_FREIGHT_RATE_ROUTE,
  RATES_PATH,
  RATE_LEDGER_LIMIT,
  REPORT,
  SHEET_CONTENT_TYPE,
  SUPPLIERS_PATH,
  SUPPLIER_PICKER_LIMIT,
  VALIDATE_PATH,
  appliedNote,
  canApply,
  cappedNote,
  categoryLabel,
  describeChange,
  fileProblem,
  filenameFrom,
  groupRates,
  ledgerNote,
  overflowNote,
  rateFigure,
  rateListFilters,
  readLedger,
  refusalFrom,
  summaryLine,
  supplierOptions } from './adminFreight.js'
import {
  Select,
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  useToast } from '../admin/parts.jsx'
import { useCategories } from '../admin/useCategories.js'

const RATE_COLUMNS = '0.9fr 1.2fr 130px 1.8fr'

// The download is a blob rather than a link because the session is an HttpOnly
// cookie on another origin: going through src/lib/api.js is what carries the
// credentials, and a refusal comes back as JSON the office can read rather than
// as a saved file containing an error message. (Same rule as AdminProductSheet.)
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking in the same tick cancels the save in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function AdminFreight() {
  // The live vocabulary, for the ledger's category filter.
  // `supplier_freight_rates.category` references the same table
  // `products.category` does, so a category added on the Categories screen is
  // one the ledger can be narrowed to the minute it exists.
  const { values: categoryValues, labelFor: categoryName } = useCategories()

  // --- the supplier roster: the ledger's labels and its supplier filter ---
  // A rate row carries `supplier_id`, an integer nobody recognises, so the list
  // resolves it through this roster. Loaded once; archived houses are excluded
  // by the API's default — a rate for one still renders by number in the
  // ledger rather than as a blank.
  const [roster, setRoster] = useState({ status: 'loading', suppliers: [] })
  useEffect(() => {
    let active = true
    apiFetch(`${SUPPLIERS_PATH}?limit=${SUPPLIER_PICKER_LIMIT}`)
      .then((body) => {
        if (!active) return
        setRoster({
          status: 'ready',
          suppliers: Array.isArray(body?.suppliers) ? body.suppliers : [] })
      })
      .catch(() => {
        // The whole ledger still works without the roster; a supplier's rates
        // group under its number instead of its name.
        if (active) setRoster({ status: 'error', suppliers: [] })
      })
    return () => {
      active = false
    }
  }, [])
  const options = useMemo(() => supplierOptions(roster.suppliers), [roster.suppliers])
  const supplierNames = useMemo(
    () => new Map(options.map((option) => [option.id, option.name])),
    [options]
  )

  // --- the ledger ----------------------------------------------------------
  // Not useAdminList: that kit narrows the envelope to { rows, total } and
  // drops `meta`, whose `note` is this screen's explanatory copy. The shape it
  // would provide (paging) is also not wanted — the list groups by scope
  // instead, so it is one fetch at the API's own cap.
  const [supplierFilter, setSupplierFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [rangeDraft, setRangeDraft] = useState('')
  const [rangeFilter, setRangeFilter] = useState('')
  const [ledger, setLedger] = useState({
    status: 'loading',
    error: '',
    rates: [],
    total: 0,
    meta: null })

  const query = buildListQuery({
    ...rateListFilters({
      supplierId: supplierFilter,
      rangeName: rangeFilter,
      category: categoryFilter }),
    limit: RATE_LEDGER_LIMIT })

  const fetchLedger = useCallback(async () => apiFetch(listPath(RATES_PATH, query)), [query])

  useEffect(() => {
    // StrictMode mounts every effect twice in development, and a slow earlier
    // response must never overwrite a newer one — only the latest request may
    // write state.
    let active = true
    setLedger((held) => ({ ...held, status: 'loading', error: '' }))
    fetchLedger()
      .then((body) => {
        if (!active) return
        setLedger({ status: 'ready', error: '', ...readLedger(body) })
      })
      .catch((err) => {
        if (!active) return
        setLedger((held) => ({
          ...held,
          status: 'error',
          error: messageOf(err, 'We could not load the freight ledger.') }))
      })
    return () => {
      active = false
    }
  }, [fetchLedger])

  // For the sheet's apply: awaited by the caller, so it needs no flag.
  const reload = useCallback(async () => {
    const body = await fetchLedger()
    setLedger({ status: 'ready', error: '', ...readLedger(body) })
  }, [fetchLedger])

  const { message, flash } = useToast()

  // --- the CSV round trip --------------------------------------------------
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [report, setReport] = useState(null)
  const [sheetBusy, setSheetBusy] = useState(false)
  const [sheetError, setSheetError] = useState('')

  const clearFile = () => {
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const post = (path, chosen) =>
    apiFetch(path, {
      method: 'POST',
      // Stated, never forwarded from the file — the API registers a Buffer
      // parser for this type; text/plain belongs to the root instance.
      headers: { 'Content-Type': SHEET_CONTENT_TYPE },
      body: chosen })

  const download = async () => {
    setSheetBusy(true)
    setSheetError('')
    try {
      const { blob, disposition } = await apiDownload(EXPORT_PATH)
      saveBlob(blob, filenameFrom(disposition))
      flash('Ledger downloaded.')
    } catch (err) {
      setSheetError(messageOf(err, 'The ledger could not be downloaded.'))
    } finally {
      setSheetBusy(false)
    }
  }

  // A refusal is a report, not an error line: it carries a row number per
  // broken row, which is the only thing that lets a person find the row again
  // in Excel.
  const receive = (kind, body) => setReport({ kind, ...body })

  const refuse = (err, fallback) => {
    const refusal = refusalFrom(err)
    if (refusal) return receive(REPORT.refused, refusal)
    setSheetError(messageOf(err, fallback))
  }

  const runSheet = async (path, chosen, onDone) => {
    setSheetBusy(true)
    setSheetError('')
    try {
      onDone(await post(path, chosen))
      return true
    } catch (err) {
      refuse(err, 'That sheet could not be read.')
      return false
    } finally {
      setSheetBusy(false)
    }
  }

  // Checking on choose rather than behind a second button: the office's first
  // question about a sheet it has just filled in is always "is this right?".
  const choose = async (event) => {
    const chosen = event.target.files?.[0] ?? null
    setReport(null)
    setSheetError('')
    setFile(chosen)
    const problem = fileProblem(chosen)
    if (problem) return setSheetError(problem)
    await runSheet(VALIDATE_PATH, chosen, (body) => receive(REPORT.clean, body))
  }

  const applySheet = async () => {
    const problem = fileProblem(file)
    if (problem) return setSheetError(problem)
    const ok = await runSheet(APPLY_PATH, file, (body) => {
      receive(REPORT.applied, body)
      flash(appliedNote(body))
    })
    if (ok) {
      // The rates have landed, so the staged file goes — the next run starts
      // from a fresh download. The ledger below refreshes to show them; a
      // failed refresh keeps the last good rows (the next filter change
      // refetches) rather than turning a successful apply into an error.
      clearFile()
      try {
        await reload()
      } catch {
        /* see above */
      }
    }
  }

  const filterRange = (event) => {
    event.preventDefault()
    setRangeFilter(rangeDraft)
  }

  const groups = groupRates(ledger.rates, supplierNames)
  const capNote = overflowNote(ledger.total, ledger.rates.length)

  return (
    <div>
      <PageHeader
        eyebrow="Price lists · live"
        title="Freight rates"
        subtitle="What a consignment costs to land, quoted per supplier or per range. The ledger is append-only — an edit is a new dated rate, and the newest dated rate wins."
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, whiteSpace: 'nowrap' }}>
              {ledger.total.toLocaleString('en-NZ')} rate{ledger.total === 1 ? '' : 's'}
            </span>
            {/* Appending a rate is data entry, so it has a page of its own
                (23 Sep 2026); the ledger is where it comes back to. */}
            <Link to={NEW_FREIGHT_RATE_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">Append a rate</GhostButton>
            </Link>
          </div>
        }
      />
      <SectionTabs tabs={priceListTabs} active="freight" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="The ledger"
            right={
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                newest first
              </span>
            }
          />

          {/* The API's own sentence, from the GET's meta — one author for the
              append-only rule — plus the one thing a reader will look for and
              must not find: an edit button. */}
          <p style={{ ...mutedText, margin: 0, padding: '14px 20px', lineHeight: 1.6, borderBottom: `1px solid ${c.line}` }}>
            {ledgerNote(ledger.meta)} There is deliberately no edit and no delete on this screen —
            the dated trail is what makes the annual uplift auditable and a past landed cost
            reconcilable.
          </p>

          <form
            onSubmit={filterRange}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}
          >
            <Select
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
              aria-label="Filter by supplier"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 'auto' }}
            >
              <option value="">All suppliers</option>
              {options.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </Select>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filter by category"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 'auto' }}
            >
              <option value="">All categories</option>
              {categoryValues.map((category) => (
                <option key={category} value={category}>
                  {categoryName(category)}
                </option>
              ))}
            </Select>
            <input
              value={rangeDraft}
              onChange={(event) => setRangeDraft(event.target.value)}
              placeholder="Range (exact name)"
              aria-label="Filter by range"
              style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 200 }}
            />
            <GhostButton type="submit" disabled={ledger.status === 'loading'}>
              Filter
            </GhostButton>
          </form>

          {ledger.status === 'loading' && <PanelNote>Loading the ledger…</PanelNote>}
          {ledger.status === 'error' && <PanelNote tone="danger">{ledger.error}</PanelNote>}
          {ledger.status === 'ready' && ledger.rates.length === 0 && (
            <PanelNote>
              No rates on the ledger{query.includes('supplier_id') || query.includes('range_name') || query.includes('category') ? ' match those filters' : ' yet'} —
              nothing is seeded until the client resolves the rate grain, and a missing rate is
              named in the landed-cost preview rather than treated as zero.
            </PanelNote>
          )}

          {ledger.status === 'ready' && ledger.rates.length > 0 && (
            <>
              <HeaderRow columns={RATE_COLUMNS} labels={['Category', 'Rate', 'Effective from', 'Note']} numeric={[1]} />
              {groups.map((group) => (
                <div key={group.key}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      padding: '11px 20px 9px',
                      background: c.surface,
                      borderBottom: `1px solid ${c.line}` }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.ink }}>{group.label}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>
                      {group.kind}
                    </span>
                    <span style={{ ...monoText, fontSize: 10.5, marginLeft: 'auto' }}>
                      {group.rates.length} rate{group.rates.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {group.rates.map((rate) => (
                    <Row key={rate.id} columns={RATE_COLUMNS}>
                      <span style={mutedText}>{categoryLabel(rate.category)}</span>
                      <span style={{ ...monoText, textAlign: 'right' }}>{rateFigure(rate)}</span>
                      <span style={{ ...monoText, fontSize: 11.5 }}>{rate.effective_from}</span>
                      <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rate.note || '—'}
                      </span>
                    </Row>
                  ))}
                </div>
              ))}
              {capNote && <div style={{ padding: '12px 20px', ...mutedText }}>{capNote}</div>}
            </>
          )}
        </section>

        <section style={panel}>
          <PanelHead label="The yearly sheet · download" />
          <div style={{ padding: 20 }}>
            <GhostButton tone="accent" disabled={sheetBusy} onClick={download}>
              Download the ledger
            </GhostButton>
            <div style={{ ...monoText, marginTop: 8 }}>{filenameFrom(null)}</div>
            <p style={{ ...mutedText, marginTop: 14, lineHeight: 1.6, maxWidth: 720 }}>
              Every rate, newest first — the history is the document. Charlotte's annual uplift is a
              bulk edit off a carrier's letter, not fifty forms: add the new year's rows under the
              old ones with a later <strong style={{ color: c.ink }}>Effective From</strong>. Do not
              change the header row, and leave <strong style={{ color: c.ink }}>Supplier ID</strong>{' '}
              as the sheet exported it — the id is the key; the Supplier name beside it is for you.
              An empty ledger downloads as the header row alone, which is the true state until the
              rate grain is resolved.
            </p>
          </div>
        </section>

        <section style={panel}>
          <PanelHead
            label="The yearly sheet · upload"
            right={
              canApply(report) ? (
                <GhostButton tone="accent" disabled={sheetBusy} onClick={applySheet}>
                  Append these rates
                </GhostButton>
              ) : null
            }
          />
          <div style={{ padding: 20 }}>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              onChange={choose}
              disabled={sheetBusy}
              aria-label="Filled-in freight rate sheet"
              style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}
            />
            <p style={{ ...mutedText, marginTop: 12, lineHeight: 1.6, maxWidth: 720 }}>
              Save it out of Excel as “CSV (Comma delimited)”. Choosing a file checks it straight
              away and writes nothing; the button appears only once the check comes back clean, and
              appends the whole sheet in one transaction or not at all. A row that says what the
              ledger already says is skipped as unchanged; a row that contradicts it is refused —
              never an overwrite — and the fix the report names is a new row with a later date.
            </p>
            <ErrorLine style={{ marginTop: 14 }}>{sheetError}</ErrorLine>
            {sheetBusy && <PanelNote>Working…</PanelNote>}
          </div>
        </section>

        {report && <ReportPanel report={report} />}
      </div>

      <ToastLine message={message} />
    </div>
  )
}

// --- the report -----------------------------------------------------------

// One renderer for all three states, because validate and apply refuse a broken
// sheet in exactly the same 422 words — which is what lets one panel serve both
// buttons.
function ReportPanel({ report }) {
  const refused = report.kind === REPORT.refused
  const changes = Array.isArray(report.changes) ? report.changes : []
  const errors = Array.isArray(report.errors) ? report.errors : []
  const changesNote = cappedNote(changes.length, report.summary?.created, 'rate')
  const errorsNote = cappedNote(errors.length, report.errorCount, 'row')

  return (
    <section style={panel}>
      <PanelHead
        label={
          refused
            ? 'The sheet was refused'
            : report.kind === REPORT.applied
              ? 'Appended'
              : 'What this sheet would append'
        }
        right={
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
            {summaryLine(report.summary)}
          </span>
        }
      />

      {refused && (
        <>
          <div style={{ padding: '16px 20px 0', fontSize: 13, color: c.danger, fontFamily: font.ui }} role="alert">
            {report.message}
          </div>
          <ul style={{ margin: 0, padding: '12px 20px 16px 36px', ...mutedText, lineHeight: 1.7 }}>
            {errors.map((entry, index) => (
              <li key={`${entry.row}-${index}`} style={{ color: c.inkSoft }}>
                <span style={{ fontFamily: font.mono, fontSize: 11.5 }}>Row {entry.row}</span> —{' '}
                {entry.message}
              </li>
            ))}
          </ul>
          {errorsNote && <div style={{ padding: '0 20px 16px', ...mutedText }}>{errorsNote}</div>}
        </>
      )}

      {report.kind === REPORT.applied && (
        <div style={{ padding: '16px 20px 0', fontSize: 13, color: c.sage, fontFamily: font.ui }} role="status">
          {appliedNote(report)}
        </div>
      )}

      {!refused && changes.length === 0 && (
        <PanelNote>Nothing to append — every rate on the sheet is already on the ledger.</PanelNote>
      )}

      {!refused && changes.length > 0 && (
        <>
          <ul style={{ margin: 0, padding: '16px 20px 12px 36px', ...mutedText, lineHeight: 1.7 }}>
            {changes.map((change, index) => (
              <li key={`${change.row}-${index}`} style={{ color: c.inkSoft }}>
                {describeChange(change)}
              </li>
            ))}
          </ul>
          {changesNote && <div style={{ padding: '0 20px 16px', ...mutedText }}>{changesNote}</div>}
        </>
      )}
    </section>
  )
}
