// "Upload stock" on the Products list: Dynamics' Stock View, checked, then
// applied onto the variations it matches. Rules in ./stockLevels.js; this file
// is layout.

import { useRef, useState } from 'react'
import { c, font } from '../theme.js'
import { apiFetch } from '../lib/api.js'
import { ErrorLine, GhostButton, HeaderRow, PanelNote, Row, messageOf, monoText, mutedText } from '../admin/parts.jsx'
import {
  XLSX_CONTENT_TYPE,
  canApplyStock,
  stockAppliedNote,
  stockFileProblem,
  stockLevelsPath,
  stockRefusal,
  stockSummaryLine,
  stockWorklist,
  stockWorklistCsv,
} from './stockLevels.js'

const gutter = { padding: '0 20px' }
const COLUMNS = '1fr 1fr 1.6fr 90px 1.6fr'

export default function StockLevelsImport({ onApplied, flash }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [refusal, setRefusal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (step, chosen) => {
    const problem = stockFileProblem(chosen)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    setRefusal(null)
    try {
      const body = await apiFetch(stockLevelsPath(step, chosen.name), {
        method: 'POST',
        headers: { 'Content-Type': XLSX_CONTENT_TYPE },
        body: chosen,
      })
      setResult(body)
      return body
    } catch (err) {
      setResult(null)
      const refused = stockRefusal(err)
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
    flash?.(stockAppliedNote(applied))
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    onApplied?.()
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([stockWorklistCsv(result)], { type: 'text/csv' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: 'stock-not-placed.csv' })
    link.click()
    URL.revokeObjectURL(url)
  }

  const worklist = stockWorklist(result)

  return (
    <div style={{ padding: '16px 0 22px', display: 'grid', gap: 14 }}>
      <p style={{ ...gutter, ...mutedText, margin: 0, lineHeight: 1.6, maxWidth: 820 }}>
        Upload Dynamics&apos; Stock View. Each item&apos;s <em>Stock On Hand</em> goes onto the variation whose code it
        carries, in its house; an item naming one product with no such variation becomes a new variation of it.
        What is reserved is never changed. Anything that matches several, or nothing, is listed and left alone.
        Choosing the file only checks it.
      </p>
      <div style={gutter}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={choose}
          disabled={busy}
          aria-label="Stock View export"
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
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...gutter, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.inkSoft }}>
              {result.applied ? 'Applied' : 'Check'} · {stockSummaryLine(result)}
            </span>
            {canApplyStock(result) && (
              <GhostButton tone="accent" disabled={busy} onClick={apply}>
                Apply the stock
              </GhostButton>
            )}
          </div>
          {worklist.length > 0 && (
            <div>
              <div style={{ ...gutter, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ ...mutedText, color: c.inkSoft }}>
                  Not placed — {worklist.length} stocked item(s), {Number(result.units_not_applied).toLocaleString('en-NZ')} units
                </span>
                <GhostButton onClick={download}>Download the list</GhostButton>
              </div>
              <HeaderRow columns={COLUMNS} labels={['Range', 'Item code', 'Name', 'On hand', 'Why']} numeric={[3]} />
              {worklist.map((row) => (
                <Row key={row.key} columns={COLUMNS} style={{ fontSize: 12.5, padding: '7px 20px', color: c.inkSoft }}>
                  <span>{row.range}</span>
                  <span style={monoText}>{row.code}</span>
                  <span>{row.name}</span>
                  <span style={{ ...monoText, textAlign: 'right' }}>{row.onHand}</span>
                  <span>{row.why}</span>
                </Row>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
