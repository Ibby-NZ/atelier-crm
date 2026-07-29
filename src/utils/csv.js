// Hand-rolled CSV parser — the inbound mirror of PriceLists' toCSV conventions (RFC 4180
// quotes, "" escapes, CRLF). This is the demo's main input boundary, so it NEVER throws:
// structural problems come back as { line, message } entries alongside the best-effort parse.
// Accepts \r\n, \n or \r line endings; strips a leading BOM; skips blank lines; trims
// unquoted fields (quoted fields keep their whitespace and may contain commas/newlines).

export function parseCSV(text) {
  const src = String(text == null ? '' : text)
  const clean = src.charCodeAt(0) === 0xfeff ? src.slice(1) : src
  const errors = []
  if (!clean.trim()) return { header: [], rows: [], errors: [{ line: 0, message: 'No data' }] }

  const records = [] // { line, cells: [{ text, quoted }] }
  let field = ''
  let quoted = false // current field opened with a quote
  let inQuotes = false
  let cells = []
  let line = 1
  let recordLine = 1

  const pushField = () => {
    cells.push({ text: field, quoted })
    field = ''
    quoted = false
  }
  const pushRecord = () => {
    const blank = cells.length === 1 && cells[0].text === '' && !cells[0].quoted
    if (!blank) records.push({ line: recordLine, cells })
    cells = []
  }

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
        if (ch === '\n') line++
      }
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      quoted = true
      continue
    }
    if (ch === ',') {
      pushField()
      continue
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      pushField()
      pushRecord()
      line++
      recordLine = line
      continue
    }
    field += ch
  }
  if (inQuotes) errors.push({ line, message: `Line ${line}: unterminated quoted field` })
  if (field !== '' || quoted || cells.length) {
    pushField()
    pushRecord()
  }

  if (!records.length) return { header: [], rows: [], errors: [...errors, { line: 0, message: 'No data' }] }

  const finish = (cell) => (cell.quoted ? cell.text : cell.text.trim())
  const header = records[0].cells.map(finish)
  const width = header.length
  const rows = records.slice(1).map((rec) => {
    const vals = rec.cells.map(finish)
    if (vals.length < width) {
      errors.push({ line: rec.line, message: `Line ${rec.line}: ${vals.length} columns, expected ${width} — padded` })
      return [...vals, ...Array(width - vals.length).fill('')]
    }
    if (vals.length > width) {
      errors.push({ line: rec.line, message: `Line ${rec.line}: ${vals.length} columns, expected ${width} — truncated` })
      return vals.slice(0, width)
    }
    return vals
  })
  return { header, rows, errors }
}
