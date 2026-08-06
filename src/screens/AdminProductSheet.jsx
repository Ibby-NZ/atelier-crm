// Product categories — the spreadsheet round trip that lets the office fill in
// `products.category`, wired to atelier-api's /admin/product-sheet/* routes.
//
//   GET  /admin/product-sheet/export.csv?brand=<slug>  → the sheet, Category empty
//   POST /admin/product-sheet/validate                 → the dry run; writes nothing
//   POST /admin/product-sheet/apply                    → one transaction, all or none
//
// `products.category` (fabric | wallpaper | trimming | accessory) is the axis on
// which the catalogue and the supplier rate ledger become joinable. It is
// nullable with no default, so every design predates it and somebody has to look
// at each one — and that somebody is the office, not a developer. Hence a
// spreadsheet: one house at a time, because a designer works through one
// supplier's catalogue at a time and a single 19k-row file is not fillable.
//
// Three rules this screen exists to honour:
//   - **The report comes before the write, structurally.** The API is two routes
//     rather than one with a `?dry_run=` flag, and the Apply button does not
//     exist until the dry run has come back clean (`canApply`).
//   - **The apply posts the FILE again, never the report.** A list of updates
//     handed back by a client is a list the client could have edited, so the API
//     re-reads the bytes and recomputes the counts — which is also why the
//     numbers shown after an apply are its own and not the dry run's.
//   - **The sheet cannot state the four legal values** (a CSV has nowhere to put
//     a note Excel will not hand back as a data row), so this panel does.
//
// Every rule with a wrong answer lives in ./adminProductSheet.js and is tested
// there; there is no jsdom in this repo, so this file is layout.

import { useEffect, useRef, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiDownload, apiFetch } from '../lib/api.js'
import { useAdminList } from '../admin/useAdminList.js'
import {
  APPLY_PATH,
  CATEGORY_VALUES,
  HOUSE_LIST_LIMIT,
  HOUSE_LIST_PATH,
  REPORT,
  SHEET_CONTENT_TYPE,
  VALIDATE_PATH,
  appliedNote,
  brandOptions,
  canApply,
  cappedNote,
  describeChange,
  exportPath,
  fileProblem,
  filenameFrom,
  initialBrand,
  refusalFrom,
  summaryLine,
} from './adminProductSheet.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  useToast,
} from '../admin/parts.jsx'

// The download is a blob rather than a link because the session is an HttpOnly
// cookie on another origin: going through src/lib/api.js is what carries the
// credentials, and a refusal comes back as JSON the office can read rather than
// as a saved file containing an error message.
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

export default function AdminProductSheet() {
  const houses = useAdminList({
    path: HOUSE_LIST_PATH,
    key: 'brands',
    limit: HOUSE_LIST_LIMIT,
  })
  const options = brandOptions(houses.rows)

  const inputRef = useRef(null)
  const [brand, setBrand] = useState('')
  const [file, setFile] = useState(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { message, flash } = useToast()

  // Keyed on the rows the list returned, not on `options` — an array built
  // during render has a new identity every time and an effect keyed on it would
  // never settle. Only ever fills a blank selector, so a house the office picked
  // survives a reload of the list.
  useEffect(() => {
    setBrand((current) => (current === '' ? initialBrand(brandOptions(houses.rows)) : current))
  }, [houses.rows])

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
      body: chosen,
    })

  const download = async () => {
    const path = exportPath(brand)
    if (path === null) return setError('Choose a house first.')
    setBusy(true)
    setError('')
    try {
      const { blob, disposition } = await apiDownload(path)
      saveBlob(blob, filenameFrom(disposition, brand))
      flash('Sheet downloaded.')
    } catch (err) {
      setError(messageOf(err, 'That sheet could not be downloaded.'))
    } finally {
      setBusy(false)
    }
  }

  // A refusal is a report, not an error line: it carries a row number per broken
  // row, which is the only thing that lets a person find the row in Excel.
  const receive = (kind, body) => setReport({ kind, ...body })

  const refuse = (err, fallback) => {
    const refusal = refusalFrom(err)
    if (refusal) return receive(REPORT.refused, refusal)
    setError(messageOf(err, fallback))
  }

  const run = async (path, chosen, onDone) => {
    setBusy(true)
    setError('')
    try {
      onDone(await post(path, chosen))
      return true
    } catch (err) {
      refuse(err, 'That sheet could not be read.')
      return false
    } finally {
      setBusy(false)
    }
  }

  // Checking on choose rather than behind a second button: the office's first
  // question about a sheet it has just filled in is always "is this right?".
  const choose = async (event) => {
    const chosen = event.target.files?.[0] ?? null
    setReport(null)
    setError('')
    setFile(chosen)
    const problem = fileProblem(chosen)
    if (problem) return setError(problem)
    await run(VALIDATE_PATH, chosen, (body) => receive(REPORT.clean, body))
  }

  const apply = async () => {
    const problem = fileProblem(file)
    if (problem) return setError(problem)
    const ok = await run(APPLY_PATH, file, (body) => {
      receive(REPORT.applied, body)
      flash(appliedNote(body))
    })
    // The sheet has landed, so the staged file goes: uploading it again is
    // harmless but says nothing, and the next run starts from a fresh download.
    if (ok) clearFile()
  }

  const houseName = options.find((option) => option.slug === brand)?.name ?? ''

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue · live"
        title="Product categories"
        subtitle="Download a house's designs as a spreadsheet, type a category beside each one, and upload it back. Nothing is written until you have read what the upload would do."
        right={
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, whiteSpace: 'nowrap' }}>
            {options.length} house{options.length === 1 ? '' : 's'}
          </span>
        }
      />
      <SectionTabs tabs={catalogueTabs} active="categories" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30, maxWidth: 1080 }}>
        <section style={panel}>
          <PanelHead label="1 · Download a sheet" />
          <div style={{ padding: 20 }}>
            {houses.status === 'loading' && <PanelNote>Loading houses…</PanelNote>}
            {houses.status === 'error' && <PanelNote tone="danger">{houses.error}</PanelNote>}
            {houses.status === 'ready' && (
              <div
                style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'end' }}
                className="r-grid-2"
              >
                <Field
                  label="House"
                  hint="Every house uses the same sheet — the same five columns, with Category empty. One house at a time, because a designer works through one supplier's catalogue at a time."
                >
                  <select
                    value={brand}
                    disabled={busy || options.length === 0}
                    onChange={(event) => setBrand(event.target.value)}
                    style={inputStyle}
                  >
                    {options.length === 0 && <option value="">No houses</option>}
                    {options.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div>
                  <GhostButton tone="accent" disabled={busy || brand === ''} onClick={download}>
                    Download {houseName || 'sheet'}
                  </GhostButton>
                  <div style={{ ...monoText, marginTop: 8 }}>{filenameFrom(null, brand || '…')}</div>
                </div>
              </div>
            )}
            <p style={{ ...mutedText, marginTop: 18, lineHeight: 1.6, maxWidth: 720 }}>
              Fill in the <strong style={{ color: c.ink }}>Category</strong> column only, with one of{' '}
              {CATEGORY_VALUES.join(', ')}. Leave a row blank and it is left alone — that is how a
              part-finished sheet is safe to upload. Do not change the header row or the Product ID
              column: the Product ID is what matches a row back to a design, so the sheet can be
              sorted, split or pasted between files and still land correctly.
            </p>
          </div>
        </section>

        <section style={panel}>
          <PanelHead
            label="2 · Upload the filled-in sheet"
            right={
              canApply(report) ? (
                <GhostButton tone="accent" disabled={busy} onClick={apply}>
                  Apply these categories
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
              disabled={busy}
              aria-label="Filled-in product sheet"
              style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}
            />
            <p style={{ ...mutedText, marginTop: 12, lineHeight: 1.6, maxWidth: 720 }}>
              Save it out of Excel as “CSV (Comma delimited)”. Choosing a file checks it straight
              away and writes nothing; the Apply button appears only once the check comes back
              clean, and applies the whole sheet in one go or not at all.
            </p>
            <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
            {busy && <PanelNote>Working…</PanelNote>}
          </div>
        </section>

        {report && <ReportPanel report={report} />}
      </div>

      <ToastLine message={message} />
    </div>
  )
}

// --- the report -----------------------------------------------------------

// One renderer for all three states, because the two routes refuse a broken
// sheet in exactly the same words — asserting that in the API's own tests is
// what lets one panel serve both buttons.
function ReportPanel({ report }) {
  const refused = report.kind === REPORT.refused
  const changes = Array.isArray(report.changes) ? report.changes : []
  const errors = Array.isArray(report.errors) ? report.errors : []
  const changesNote = cappedNote(changes.length, report.summary?.changed, 'change')
  const errorsNote = cappedNote(errors.length, report.errorCount, 'row')

  return (
    <section style={panel}>
      <PanelHead
        label={refused ? 'The sheet was refused' : report.kind === REPORT.applied ? 'Applied' : 'What this sheet would do'}
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
        <PanelNote>
          Nothing to change — every category on the sheet already matches the catalogue.
        </PanelNote>
      )}

      {!refused && changes.length > 0 && (
        <>
          <ul style={{ margin: 0, padding: '16px 20px 12px 36px', ...mutedText, lineHeight: 1.7 }}>
            {changes.map((change, index) => (
              <li key={`${change.id}-${index}`} style={{ color: c.inkSoft }}>
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
