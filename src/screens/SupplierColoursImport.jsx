// "Upload colours" on the Products list: the Supplier Colours workbook
// (Supplier | Brand | Product Name | Code | Colour), checked, then applied —
// one design per product name under its house, one colourway per code.
//
// Choosing the file checks it (nothing is written); the report says how many
// designs and colourways would land and how many are new, how many of those
// designs have a product price behind them, and every row that cannot land —
// a brand with no house of that name is REPORTED, never created. Apply sends
// the FILE again. Director-only in the API.
//
// Rules in ./supplierColours.js; this file is layout.

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { apiFetch } from '../lib/api.js'
import { ErrorLine, GhostButton, HeaderRow, PanelNote, Row, messageOf, monoText, mutedText } from '../admin/parts.jsx'
import { brandRoute } from './adminCatalogue.js'
import {
  XLSX_CONTENT_TYPE,
  canApplyColours,
  coloursAppliedNote,
  coloursFileProblem,
  coloursImportPath,
  coloursRefusal,
  coloursSummaryLine,
  coloursWorklist,
} from './supplierColours.js'

const gutter = { padding: '0 20px' }
const HOUSE_COLUMNS = '1.4fr 100px 100px 110px 110px'
const n = (value) => Number(value ?? 0).toLocaleString('en-NZ')

export default function SupplierColoursImport({ onApplied, flash }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [refusal, setRefusal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (step, chosen) => {
    const problem = coloursFileProblem(chosen)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    setRefusal(null)
    try {
      const body = await apiFetch(coloursImportPath(step, chosen.name), {
        method: 'POST',
        // Stated, never forwarded from the file — the API parses this type as bytes.
        headers: { 'Content-Type': XLSX_CONTENT_TYPE },
        body: chosen,
      })
      setResult(body)
      return body
    } catch (err) {
      setResult(null)
      const refused = coloursRefusal(err)
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
    flash?.(coloursAppliedNote(applied))
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    onApplied?.()
  }

  const worklist = coloursWorklist(result)

  return (
    <div style={{ padding: '16px 0 22px', display: 'grid', gap: 14 }}>
      <p style={{ ...gutter, ...mutedText, margin: 0, lineHeight: 1.6, maxWidth: 820 }}>
        Upload the Supplier Colours workbook (<em>Supplier · Brand · Product Name · Code · Colour</em>). Each
        product name becomes a design under the house its Brand names, and each code a colourway of it, with a
        stock row at zero. A design already in the catalogue keeps everything it has; a brand with no house is
        listed, never created. Choosing the file only checks it.
      </p>
      <div style={gutter}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={choose}
          disabled={busy}
          aria-label="Supplier Colours workbook"
          style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}
        />
      </div>

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
              {result.applied ? 'Applied' : 'Check'} · {coloursSummaryLine(result)}
            </span>
            {canApplyColours(result) && (
              <GhostButton tone="accent" disabled={busy} onClick={apply}>
                Apply the colours
              </GhostButton>
            )}
          </div>

          {result.sample?.length > 0 && (
            <div style={gutter}>
              <div style={{ ...mutedText, color: c.inkSoft, marginBottom: 4 }}>
                {result.applied ? 'Landed' : 'Would land'} (first {result.sample.length})
              </div>
              <div style={{ ...monoText, lineHeight: 1.7 }}>
                {result.sample.map((line) => `${line.sku} — ${line.name}${line.is_new ? '' : ' (already there)'}`).join(' · ')}
              </div>
            </div>
          )}

          {result.houses?.length > 0 && (
            <div>
              <HeaderRow columns={HOUSE_COLUMNS} labels={['House', 'Designs', 'New', 'Colourways', 'Priced']} numeric={[1, 2, 3, 4]} />
              {result.houses.map((entry) => (
                <Row key={entry.house.id} columns={HOUSE_COLUMNS} style={{ fontSize: 13, padding: '8px 20px', color: c.inkSoft }}>
                  <Link to={brandRoute(entry.house.id)} className="ab-link" style={{ color: 'inherit' }}>
                    {entry.house.name}
                  </Link>
                  <span style={{ ...monoText, textAlign: 'right' }}>{n(entry.products)}</span>
                  <span style={{ ...monoText, textAlign: 'right' }}>{n(entry.products_new)}</span>
                  <span style={{ ...monoText, textAlign: 'right' }}>{n(entry.colourways)}</span>
                  <span style={{ ...monoText, textAlign: 'right' }}>{n(entry.priced)}</span>
                </Row>
              ))}
            </div>
          )}

          {worklist.length > 0 && (
            <div style={gutter}>
              <div style={{ ...mutedText, color: c.inkSoft, marginBottom: 4 }}>Not landed ({worklist.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: c.inkSoft, lineHeight: 1.7 }}>
                {worklist.map((line) => (
                  <li key={line.key}>{line.text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
