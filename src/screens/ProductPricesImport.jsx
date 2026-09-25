// "Upload export" on Product prices: the Dynamics "Active Product Prices"
// export, checked, then applied.
//
//   POST /admin/product-prices/import/validate?filename=  → the dry run; writes nothing
//   POST /admin/product-prices/import/apply?filename=     → one transaction, all or none
//
// Choosing a file checks it straight away (the question about a file is
// always "is this right?"). The report says how many rows are new, changed or
// unchanged, which exchange rates the export implies and whether the platform
// already has them, which ranges have no house or are missing a figure, and —
// priced as it will be after applying — how many products agree with
// Dynamics' own trade sell. Apply sends the FILE again and the API re-plans
// against the live data; never the report this panel holds.
//
// NOTHING HERE TOUCHES THE ARCHIVE. The Dynamics archive keeps every column of
// its own copy; this lands in the platform's product prices only.
//
// Rules in ./productPrices.js; this file is layout.

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { apiFetch } from '../lib/api.js'
import { ErrorLine, GhostButton, HeaderRow, PanelNote, Row, messageOf, monoText, mutedText } from '../admin/parts.jsx'
import {
  XLSX_CONTENT_TYPE,
  canApply,
  catalogueLine,
  comparisonLine,
  fxLineText,
  houseLink,
  importFileProblem,
  importPath,
  importRefusal,
  importSummaryLine,
  rangeComparisonRows,
  rangeReportRows,
} from './productPrices.js'

const gutter = { padding: '0 20px' }
const RANGE_COLUMNS = '1.4fr 90px 90px 90px 90px'
const n = (value) => Number(value ?? 0).toLocaleString('en-NZ')

export default function ProductPricesImport({ onApplied, flash }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [refusal, setRefusal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showRanges, setShowRanges] = useState(false)

  const run = async (step, chosen) => {
    const problem = importFileProblem(chosen)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    setRefusal(null)
    try {
      const body = await apiFetch(importPath(step, chosen.name), {
        method: 'POST',
        // Stated, never forwarded from the file — the API parses this type as bytes.
        headers: { 'Content-Type': XLSX_CONTENT_TYPE },
        body: chosen,
      })
      setResult(body)
      return body
    } catch (err) {
      setResult(null)
      const refused = importRefusal(err)
      if (refused) setRefusal(refused)
      else setError(messageOf(err, 'That file could not be checked.'))
      return null
    } finally {
      setBusy(false)
    }
  }

  const choose = (event) => {
    const chosen = event.target.files?.[0] ?? null
    setFile(chosen)
    setResult(null)
    if (chosen) run('validate', chosen)
  }

  const apply = async () => {
    const applied = await run('apply', file)
    if (!applied) return
    flash?.(`Imported — ${importSummaryLine(applied)}.${applied.catalogue ? ` ${catalogueLine(applied.catalogue)}.` : ''}`)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    onApplied?.()
  }

  const attention = rangeReportRows(result?.comparison)

  return (
    <div style={{ padding: '16px 0 22px', display: 'grid', gap: 14 }}>
      <p style={{ ...gutter, ...mutedText, margin: 0, lineHeight: 1.6, maxWidth: 820 }}>
        Upload the product prices export from Dynamics (<em>Active Product Prices …xlsx</em>) as it arrives. Each
        product is matched to the house its range names, and priced with that house&apos;s duty, freight,
        clearance, discount and trade markup — import the ranges on the Houses list first. Choosing the file only
        checks it; nothing is written until you apply. The Dynamics archive is not touched.
      </p>
      <div style={gutter}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={choose}
          disabled={busy}
          aria-label="Dynamics product prices export"
          style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}
        />
      </div>

      <ErrorLine style={gutter}>{error}</ErrorLine>
      {busy && <PanelNote>Working — twenty thousand rows take a few seconds…</PanelNote>}

      {refusal && (
        <div role="alert" style={{ ...gutter, fontSize: 13, color: c.danger, fontFamily: font.ui, lineHeight: 1.6 }}>
          {refusal.message}
          {refusal.errors.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, ...monoText }}>
              {refusal.errors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {refusal.errorCount > refusal.errors.length && (
            <div style={mutedText}>…and {n(refusal.errorCount - refusal.errors.length)} more.</div>
          )}
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...gutter, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.inkSoft }}>
              {result.import_id ? 'Applied' : 'Check'}
              {result.exported_at ? ` · export of ${result.exported_at.replace('T', ' ')}` : ''} · {importSummaryLine(result)}
            </span>
            {canApply(result) && (
              <GhostButton tone="accent" disabled={busy} onClick={apply}>
                Apply the export
              </GhostButton>
            )}
          </div>

          {result.catalogue && (
            <div style={{ ...gutter, fontSize: 13, color: c.inkSoft, lineHeight: 1.6 }}>
              <strong style={{ color: c.ink, fontWeight: 500 }}>On the catalogue:</strong> {catalogueLine(result.catalogue)}.
            </div>
          )}

          <div style={gutter}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: c.ink }}>{comparisonLine(result.comparison)}</div>
            <div style={{ ...mutedText, marginTop: 4, lineHeight: 1.6, maxWidth: 820 }}>
              A product differs where Dynamics charged freight by its letter (wallpaper and trimmings mostly) while
              the platform charges the house&apos;s one freight rate — or where a range&apos;s figures have moved since
              Dynamics last priced it. Each product&apos;s page shows both.
            </div>
          </div>

          <div style={gutter}>
            <div style={{ ...mutedText, color: c.inkSoft, marginBottom: 4 }}>Exchange rates</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: c.inkSoft, lineHeight: 1.7 }}>
              {result.fx.map((line) => (
                <li key={line.currency}>{fxLineText(line)}</li>
              ))}
            </ul>
            {result.fx_filled?.length > 0 && (
              <div style={{ ...mutedText, marginTop: 4 }}>Set on the platform: {result.fx_filled.join(', ')}.</div>
            )}
          </div>

          {attention.length > 0 && (
            <div style={gutter}>
              <div style={{ ...mutedText, color: c.inkSoft, marginBottom: 4 }}>Ranges that cannot price yet ({attention.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: c.inkSoft, lineHeight: 1.7 }}>
                {attention.map((row) => (
                  <li key={row.range}>
                    {row.house ? (
                      <Link to={houseLink(row.house)} className="ab-link" style={{ color: 'inherit' }}>
                        {row.range}
                      </Link>
                    ) : (
                      row.range
                    )}{' '}
                    ({n(row.products)}) — {row.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.wholesale_change_count > 0 && (
            <div style={gutter}>
              <div style={{ ...mutedText, color: c.inkSoft, marginBottom: 4 }}>
                Wholesale rates that move ({n(result.wholesale_change_count)}
                {result.wholesale_change_count > result.wholesale_changes.length ? `, first ${result.wholesale_changes.length} shown` : ''})
              </div>
              <div style={{ ...monoText, lineHeight: 1.7 }}>
                {result.wholesale_changes
                  .map((change) => `${change.range_name} ${change.code}: ${change.from} ${change.from_currency} → ${change.to} ${change.currency}`)
                  .join(' · ')}
              </div>
            </div>
          )}

          <div>
            <div style={gutter}>
              <GhostButton onClick={() => setShowRanges((open) => !open)}>
                {showRanges ? 'Hide the comparison by range' : 'Show the comparison by range'}
              </GhostButton>
            </div>
            {showRanges && (
              <div style={{ marginTop: 10 }}>
                <HeaderRow columns={RANGE_COLUMNS} labels={['Range', 'Products', 'Priced', 'Agree', 'Differ']} numeric={[1, 2, 3, 4]} />
                {rangeComparisonRows(result.comparison).map((row) => (
                  <Row key={row.range} columns={RANGE_COLUMNS} style={{ fontSize: 13, padding: '8px 20px', color: c.inkSoft }}>
                    <span>
                      {row.house ? (
                        <Link to={houseLink(row.house)} className="ab-link" style={{ color: 'inherit' }}>
                          {row.range}
                        </Link>
                      ) : (
                        <span style={{ color: c.clay }}>{row.range} · no house</span>
                      )}
                    </span>
                    <span style={{ ...monoText, textAlign: 'right' }}>{n(row.products)}</span>
                    <span style={{ ...monoText, textAlign: 'right' }}>{n(row.priced)}</span>
                    <span style={{ ...monoText, textAlign: 'right', color: c.sage }}>{n(row.agree)}</span>
                    <span style={{ ...monoText, textAlign: 'right', color: row.differ > 0 ? c.clay : c.inkSoft }}>{n(row.differ)}</span>
                  </Row>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
