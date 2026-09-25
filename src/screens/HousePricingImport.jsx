// "Pricing from Dynamics" on the Houses list: upload the tracking-options
// export ("Active Tracking Options <date>.xlsx") and apply each range's figures
// to its house.
//
//   POST /admin/pricing/houses/import/validate?overwrite=&filename=  → the dry run; writes nothing
//   POST /admin/pricing/houses/import/apply?overwrite=&filename=     → one transaction, all or none
//
// Choosing a file checks it straight away (the freight sheet's rule — the first
// question about a file is always "is this right?"), and the report says, house
// by house, what would be FILLED (blank here, stated in the export), REPLACED
// (only with the box ticked) or KEPT (the house already says something else).
// Ticking the box re-checks. Apply sends the FILE again and the API re-plans
// against the live data — never the report this screen holds.
//
// The panel sits on the list, not on a page of its own, because it is about
// the whole list (the Featured panel's reasoning) — and it only opens when
// asked, so the list stays the list. Finance-gated by the API: the refusal is
// its own sentence on the error line.
//
// Rules in ./housePricing.js; this file is layout.

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { apiFetch } from '../lib/api.js'
import { brandRoute } from './adminCatalogue.js'
import {
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelNote,
  Row,
  messageOf,
  monoText,
  mutedText,
} from '../admin/parts.jsx'
import {
  CHANGE_FIELD_LABELS,
  CHANGE_KIND_LABELS,
  XLSX_CONTENT_TYPE,
  canApply,
  changeValueText,
  fillSummaryText,
  groupChanges,
  houseReportRows,
  importFileProblem,
  importPath,
  importRefusal,
  importSummaryLine,
  reportSections,
} from './housePricing.js'

const CHANGE_COLUMNS = '1.2fr 1fr 1fr 130px'

const KIND_COLOURS = { fill: c.sage, replace: c.accentDeep, kept: c.clay }

// The list rows carry their own 20px gutter; everything else takes this one.
const gutter = { padding: '0 20px' }
// Report rows read at the panel's text size, not the list's.
const ROW_TEXT = { fontSize: 13, padding: '9px 20px', color: c.inkSoft }

export default function HousePricingImport({ onApplied, flash }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [overwrite, setOverwrite] = useState(false)
  const [result, setResult] = useState(null)
  const [refusal, setRefusal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const post = (step, chosen, replace) =>
    apiFetch(importPath(step, { overwrite: replace, filename: chosen.name }), {
      method: 'POST',
      // Stated, never forwarded from the file — the API parses this type as bytes.
      headers: { 'Content-Type': XLSX_CONTENT_TYPE },
      body: chosen,
    })

  const run = async (step, chosen, replace) => {
    const problem = importFileProblem(chosen)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    setRefusal(null)
    try {
      const body = await post(step, chosen, replace)
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
    if (chosen) run('validate', chosen, overwrite)
  }

  const toggleOverwrite = (event) => {
    const next = event.target.checked
    setOverwrite(next)
    if (file) run('validate', file, next)
  }

  const apply = async () => {
    const applied = await run('apply', file, overwrite)
    if (!applied) return
    flash?.(importSummaryLine(applied))
    // The file has landed; the next run starts from a fresh export.
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    onApplied?.()
  }

  const houses = groupChanges(result?.changes ?? [])
  const sections = reportSections(result?.reports)

  return (
    <div style={{ padding: '16px 0 22px', display: 'grid', gap: 14 }}>
      <p style={{ ...gutter, ...mutedText, margin: 0, lineHeight: 1.6, maxWidth: 800 }}>
        Upload the tracking-options export from Dynamics (<em>Active Tracking Options …xlsx</em>) as it
        arrives. Each range is matched to the house of the same name, and its duty, clearance,
        freight, discount, trade markup and surcharge land on that house&apos;s Pricing panel. Choosing
        the file only checks it; nothing is written until you apply.
      </p>
      <div style={{ ...gutter, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={choose}
          disabled={busy}
          aria-label="Dynamics tracking-options export"
          style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft }}>
          <input type="checkbox" checked={overwrite} onChange={toggleOverwrite} disabled={busy} />
          Replace figures a house already has when the export says otherwise
        </label>
      </div>
      <p style={{ ...gutter, ...mutedText, margin: 0, lineHeight: 1.6, maxWidth: 800 }}>
        Unticked, only blanks are filled and every disagreement is listed as <strong>kept</strong>. A
        blank in the export never clears anything, a house on a discount chain or tiers keeps them,
        and a replaced freight rate is added as a new dated rate — the old one stays as history.
      </p>

      <ErrorLine style={gutter}>{error}</ErrorLine>
      {busy && <PanelNote>Working…</PanelNote>}

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
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ ...gutter, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.inkSoft }}>
              {result.dry_run ? 'Check' : 'Applied'}
              {result.exported_at ? ` · export of ${result.exported_at.replace('T', ' ')}` : ''} ·{' '}
              {importSummaryLine(result)}
            </span>
            {canApply(result) && (
              <GhostButton tone="accent" disabled={busy} onClick={apply}>
                Apply to houses
              </GhostButton>
            )}
          </div>

          {houses.length === 0 ? (
            <PanelNote>Nothing to change — every house already says what the export says.</PanelNote>
          ) : (
            <div>
              <HeaderRow columns={CHANGE_COLUMNS} labels={['Figure', 'On the house', 'In the export', '']} />
              {houses.map((house) => {
                const { fills, decisions } = houseReportRows(house)
                return (
                  <div key={house.brand_id}>
                    <div style={{ padding: '12px 20px 4px', fontSize: 13.5, fontWeight: 500, color: c.ink }}>
                      <Link to={brandRoute(house.brand_id)} className="ab-link" style={{ color: 'inherit' }}>
                        {house.brand}
                      </Link>
                      {house.range !== house.brand && (
                        <span style={{ ...mutedText, fontWeight: 400, marginLeft: 8 }}>range {house.range}</span>
                      )}
                    </div>
                    {fills.length > 0 && (
                      <Row columns={CHANGE_COLUMNS} style={ROW_TEXT}>
                        <span>
                          {fills.length} blank{fills.length === 1 ? '' : 's'}
                        </span>
                        <span style={{ ...monoText, gridColumn: '2 / 4', lineHeight: 1.6 }}>{fillSummaryText(fills)}</span>
                        <span style={{ fontSize: 12, color: KIND_COLOURS.fill }}>{CHANGE_KIND_LABELS.fill}</span>
                      </Row>
                    )}
                    {decisions.map((line) => (
                      <Row key={`${line.field}-${line.kind}`} columns={CHANGE_COLUMNS} style={ROW_TEXT}>
                        <span>{CHANGE_FIELD_LABELS[line.field] ?? line.field}</span>
                        <span style={monoText}>{changeValueText(line, 'from')}</span>
                        <span style={monoText}>{changeValueText(line, 'to')}</span>
                        <span style={{ fontSize: 12, color: KIND_COLOURS[line.kind] ?? c.muted }}>
                          {CHANGE_KIND_LABELS[line.kind] ?? line.kind}
                        </span>
                      </Row>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {sections.map((section) => (
            <div key={section.key} style={gutter}>
              <div style={{ ...mutedText, color: c.inkSoft, marginBottom: 4 }}>
                {section.title} ({section.rows.length})
              </div>
              <div style={{ ...mutedText, lineHeight: 1.7 }}>{section.rows.map(section.line).join(' · ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
