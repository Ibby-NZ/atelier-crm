// Price-list import — LIVE, wired to atelier-api's /admin/price-lists/import/*
// routes. This replaces the pre-API demo wizard (supplier cards, localStorage
// staging): an upload here lands in `price_list_items`, the same ledger
// `npm run import:pricing` writes, through the same parser, mappers and upsert.
//
//   POST /admin/price-lists/import/validate?filename=…  the dry run; writes nothing
//   POST /admin/price-lists/import/apply?filename=…     one transaction, all or none
//   GET  /admin/price-lists/imports                     who imported what, when
//
// Rules this screen exists to honour (each one stated in ./priceListImport.js,
// where the logic lives and is tested — there is no jsdom here, so this file
// is layout, the AdminProductSheet split):
//
//   - **The report comes before the write, structurally.** Two routes rather
//     than a ?dry_run= flag, and the Apply button does not exist until a dry
//     run has come back clean (canApply).
//   - **The apply posts the FILE again, never the report** — a list of rates
//     handed back by a client is a list the client could have edited. The
//     report is dropped the moment the file or a fallback changes, so what
//     was read is always what is applied.
//   - **A file with any row error is refused WHOLE**, both routes, in the same
//     words — there is no partial landing. The refusal is a report, not an
//     error line: row numbers are how a person finds the rows in Excel, and
//     the unmappable categories ("Leather") are called out apart from the
//     errors because they are a question for the client, not a typo.
//   - **The upload is the raw bytes with a stated content type** (the product
//     sheet's pattern, one MIME wider for .xlsx). The server sniffs the format
//     from the bytes; the type only has to get through its parser.
//   - **Finance-gated, not merely backoffice**: a dry run prints the old rate
//     beside the new, the same disclosure the rate history sits behind. A 403
//     carries the API's own sentence — on the history list it renders as the
//     standard masked note; on the buttons it is the inline error.

import { useEffect, useRef, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import { apiFetch } from '../lib/api.js'
import { dayOf, isDenied } from '../admin/priceHistory.js'
import {
  APPLY_PATH,
  IMPORTS_PATH,
  IMPORT_CATEGORIES,
  MAX_REPORTED_ERRORS,
  REPORT,
  VALIDATE_PATH,
  appliedNote,
  canApply,
  cappedNote,
  describeRateChange,
  fileLine,
  importContentType,
  importFileProblem,
  importQuery,
  refusalFrom,
  runLine,
  summaryLine,
} from './priceListImport.js'
import {
  Select,
  ErrorLine,
  Field,
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
  useToast,
} from '../admin/parts.jsx'

const RUN_COLUMNS = '90px 1.7fr 60px 1.6fr 1fr'

export default function PriceListImport() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState('')
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [runs, setRuns] = useState({ status: 'loading', imports: [], note: '' })
  const [runsTick, setRunsTick] = useState(0)
  const { message, flash } = useToast()

  // The applied-imports log. Reloaded after every apply (runsTick) so the run
  // that just landed is on screen — the reload-not-reconcile rule.
  useEffect(() => {
    let active = true
    setRuns({ status: 'loading', imports: [], note: '' })
    apiFetch(IMPORTS_PATH)
      .then((body) => {
        if (active) setRuns({ status: 'ready', imports: body.imports ?? [], note: '' })
      })
      .catch((err) => {
        if (!active) return
        setRuns({
          status: isDenied(err) ? 'denied' : 'error',
          imports: [],
          note: messageOf(err, 'Could not load the import history.'),
        })
      })
    return () => {
      active = false
    }
  }, [runsTick])

  const choose = (event) => {
    setFile(event.target.files?.[0] ?? null)
    // A report about the previous file is a report about the wrong file.
    setReport(null)
    setError('')
  }

  // Editing a fallback invalidates the report the same way a new file does:
  // the querystring is part of what was checked.
  const setFallback = (setter) => (event) => {
    setter(event.target.value)
    setReport(null)
  }

  const post = async (base, onDone) => {
    const problem = importFileProblem(file)
    if (problem) return setError(problem)
    const built = importQuery({ filename: file.name, supplier, category })
    if (built.error) return setError(built.error)
    setBusy(true)
    setError('')
    try {
      onDone(
        await apiFetch(`${base}${built.query}`, {
          method: 'POST',
          // Stated from the extension, never forwarded from the browser — see
          // importContentType. The server sniffs the bytes regardless.
          headers: { 'Content-Type': importContentType(file.name) },
          body: file,
        })
      )
    } catch (err) {
      const refusal = refusalFrom(err)
      if (refusal) setReport({ kind: REPORT.refused, ...refusal })
      else setError(messageOf(err, 'That file could not be read.'))
    } finally {
      setBusy(false)
    }
  }

  const check = () => post(VALIDATE_PATH, (body) => setReport({ kind: REPORT.clean, ...body }))

  const apply = () =>
    post(APPLY_PATH, (body) => {
      setReport({ kind: REPORT.applied, ...body })
      flash(appliedNote(body))
      setRunsTick((tick) => tick + 1)
      // The file has landed; the next run starts from a fresh drop. Re-posting
      // it would be idempotent but says nothing.
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    })

  return (
    <div>
      <PageHeader
        eyebrow="Price lists · live"
        title="Import a supplier price list"
        subtitle="The same pipeline as npm run import:pricing, behind an upload: check the file first — the dry run writes nothing — then apply it in one transaction, all or none."
      />
      <SectionTabs tabs={priceListTabs} active="import" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30, maxWidth: 1080 }}>
        <section style={panel}>
          <PanelHead label="1 · The supplier's file" />
          <div style={{ padding: 20 }}>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={choose}
              disabled={busy}
              aria-label="Supplier price list"
              style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}
            />
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}
              className="r-grid-2"
            >
              <Field
                label="Supplier (fallback)"
                hint="A v3 file's own Supplier cell wins per row. The original 14-column layout has no Supplier column at all, so for one of those this must be filled in."
              >
                <input
                  value={supplier}
                  disabled={busy}
                  onChange={setFallback(setSupplier)}
                  style={inputStyle}
                />
              </Field>
              <Field
                label="Category (fallback)"
                hint="Fills a BLANK Item Type cell only. A cell that says something unmappable — “Leather” — is reported with its row number, never absorbed."
              >
                <Select
                  value={category}
                  disabled={busy}
                  onChange={setFallback(setCategory)}
                >
                  <option value="">No fallback</option>
                  {IMPORT_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p style={{ ...mutedText, marginTop: 16, lineHeight: 1.6, maxWidth: 720 }}>
              Both accepted layouts are matched on their header row — the 14-column layout every
              existing drop uses, and the 17-column template the client ratified in August. A file
              with any broken row is refused whole, in the same words, whichever button you press:
              there is no partial landing.
            </p>
            <div style={{ marginTop: 16 }}>
              <GhostButton tone="accent" disabled={busy || !file} onClick={check}>
                Check the file — writes nothing
              </GhostButton>
            </div>
            <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
            {busy && <PanelNote>Working…</PanelNote>}
          </div>
        </section>

        {report && (
          <ImportReport
            report={report}
            action={
              canApply(report) ? (
                <GhostButton tone="accent" disabled={busy} onClick={apply}>
                  Apply to the rate ledger
                </GhostButton>
              ) : null
            }
          />
        )}

        <section style={panel}>
          <PanelHead
            label="Previous imports"
            right={
              runs.status === 'ready' ? (
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {runs.imports.length} logged
                </span>
              ) : null
            }
          />
          {runs.status === 'loading' && <PanelNote>Loading the import history…</PanelNote>}
          {/* The finance gate, as the standard masked note — muted, the API's
              own sentence, the report library's treatment. */}
          {runs.status === 'denied' && <PanelNote>{runs.note}</PanelNote>}
          {runs.status === 'error' && <PanelNote tone="danger">{runs.note}</PanelNote>}
          {runs.status === 'ready' && runs.imports.length === 0 && (
            <PanelNote>
              No imports logged yet. Only applied imports appear here — a refused upload writes
              nothing and leaves no trace.
            </PanelNote>
          )}
          {runs.status === 'ready' && runs.imports.length > 0 && (
            <>
              <HeaderRow columns={RUN_COLUMNS} labels={['When', 'File', 'Layout', 'Rows', 'By']} />
              {runs.imports.map((run) => (
                <Row key={run.id} columns={RUN_COLUMNS}>
                  <span style={{ ...monoText, fontSize: 11.5 }}>{dayOf(run.created_at)}</span>
                  <span style={{ ...monoText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {run.filename}
                  </span>
                  <span style={monoText}>{run.template_version}</span>
                  <span style={{ ...mutedText, minWidth: 0 }}>{runLine(run)}</span>
                  <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {run.imported_by_name ?? '—'}
                  </span>
                </Row>
              ))}
            </>
          )}
        </section>
      </div>

      <ToastLine message={message} />
    </div>
  )
}

// --- the report -----------------------------------------------------------

// One renderer for all three states, because the two routes refuse a broken
// file in exactly the same words (the API's refusalBody) — one report is what
// the office reads whichever button it pressed.
function ImportReport({ report, action }) {
  const refused = report.kind === REPORT.refused
  const changes = Array.isArray(report.changes) ? report.changes : []
  const skipped = Array.isArray(report.skipped) ? report.skipped : []
  const errors = Array.isArray(report.errors) ? report.errors : []
  const unmappable = Array.isArray(report.unmappable) ? report.unmappable : []
  const changesNote = cappedNote(changes.length, report.summary?.changed, 'rate change')
  const skippedNote = cappedNote(skipped.length, report.summary?.skipped, 'unpriced row')
  const errorsNote = cappedNote(errors.length, report.errorCount, 'row error')
  const unmappableNote = cappedNote(
    Math.min(unmappable.length, MAX_REPORTED_ERRORS),
    report.unmappableCount,
    'unmappable row'
  )

  return (
    <section style={panel}>
      <PanelHead
        label={
          refused
            ? 'The file was refused'
            : report.kind === REPORT.applied
              ? 'Applied'
              : 'What this file would do'
        }
        right={action}
      />

      {/* File and layout first — the header row IS the version — then a line
          that accounts for every row of the file. */}
      <div style={{ padding: '14px 20px 0', fontFamily: font.mono, fontSize: 11.5, color: c.muted, lineHeight: 1.7 }}>
        {[fileLine(report.summary), summaryLine(report.summary)].filter(Boolean).join(' — ')}
      </div>

      {refused && (
        <>
          <div
            style={{ padding: '14px 20px 0', fontSize: 13, color: c.danger, fontFamily: font.ui, lineHeight: 1.55 }}
            role="alert"
          >
            {report.message}
          </div>

          {unmappable.length > 0 && (
            <div style={{ padding: '14px 20px 0' }}>
              {/* US-004, kept apart from the row errors: whether the four-word
                  category vocabulary grows a fifth is the client's decision,
                  and this list is what asks them. */}
              <div style={{ fontSize: 12.5, color: c.inkSoft, fontFamily: font.ui }}>
                Categories this catalogue has no word for:
              </div>
              <ul style={{ margin: 0, padding: '8px 0 0 16px', ...mutedText, lineHeight: 1.7 }}>
                {unmappable.map((entry, index) => (
                  <li key={`${entry.row}-${index}`} style={{ color: c.inkSoft }}>
                    <span style={{ fontFamily: font.mono, fontSize: 11.5 }}>Row {entry.row}</span>{' '}
                    — “{entry.value}”
                  </li>
                ))}
              </ul>
              {unmappableNote && <div style={{ paddingTop: 8, ...mutedText }}>{unmappableNote}</div>}
            </div>
          )}

          <ul style={{ margin: 0, padding: '14px 20px 16px 36px', ...mutedText, lineHeight: 1.7 }}>
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
        <div
          style={{ padding: '14px 20px 0', fontSize: 13, color: c.sage, fontFamily: font.ui }}
          role="status"
        >
          {appliedNote(report)}
        </div>
      )}

      {!refused && changes.length === 0 && (
        <PanelNote>
          No held rate moves — every mapped code either lands new or restates what the ledger
          already holds.
        </PanelNote>
      )}

      {!refused && changes.length > 0 && (
        <>
          <ul style={{ margin: 0, padding: '14px 20px 12px 36px', ...mutedText, lineHeight: 1.7 }}>
            {changes.map((change, index) => (
              <li key={`${change.row}-${index}`} style={{ color: c.inkSoft }}>
                {describeRateChange(change)}
              </li>
            ))}
          </ul>
          {changesNote && <div style={{ padding: '0 20px 12px', ...mutedText }}>{changesNote}</div>}
        </>
      )}

      {!refused && skipped.length > 0 && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ fontSize: 12.5, color: c.inkSoft, fontFamily: font.ui }}>
            Unpriced rows (rate 0 — price on application; skipped, never fatal):
          </div>
          <ul style={{ margin: 0, padding: '8px 0 0 16px', ...mutedText, lineHeight: 1.7 }}>
            {skipped.map((entry, index) => (
              <li key={`${entry.row}-${index}`}>
                <span style={{ fontFamily: font.mono, fontSize: 11.5 }}>Row {entry.row}</span> —{' '}
                {entry.message}
              </li>
            ))}
          </ul>
          {skippedNote && <div style={{ paddingTop: 8, ...mutedText }}>{skippedNote}</div>}
        </div>
      )}
    </section>
  )
}
