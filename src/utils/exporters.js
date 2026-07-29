// Shared client-side export helpers — the same proven mechanics as PriceLists.jsx (BOM'd CSV
// blob + styled print window). PriceLists keeps its local copies untouched: it is the demoed
// regression baseline; consolidating the two belongs to a later cleanup pass.

export function toCSV(head, rows) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
  const lines = [head.map(esc).join(',')]
  rows.forEach((r) => lines.push(r.map(esc).join(',')))
  return lines.join('\r\n')
}

export function downloadCSVFile(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const escHtml = (s) =>
  String(s == null ? '' : s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]))

export function htmlTable(title, head, rows) {
  return (
    `<h2>${escHtml(title)}</h2>` +
    `<table><thead><tr>${head.map((h) => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${escHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  )
}

// Opens the Atelier-branded print sheet (browser "print to PDF"). Returns false when the
// pop-up is blocked so callers can surface a useful message instead of failing silently.
export function openPrintWindow(title, bodyHtml) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Georgia, 'Times New Roman', serif; color: #211C17; margin: 40px; }
      header { border-bottom: 2px solid #211C17; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
      .wm { font-size: 22px; letter-spacing: .16em; font-weight: 700; }
      .wm small { display: block; font-family: Arial, sans-serif; font-size: 9px; letter-spacing: .42em; color: #A98B5D; margin-top: 3px; }
      .sub { font-family: Arial, sans-serif; font-size: 11px; color: #877C6B; text-align: right; }
      h2 { font-size: 16px; font-weight: 500; margin: 26px 0 4px; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 6px; }
      th { text-align: left; font-family: Arial, sans-serif; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #877C6B; border-bottom: 1px solid #D8CDB8; padding: 8px 10px; }
      td { padding: 9px 10px; border-bottom: 1px solid #EFE8DA; }
      footer { margin-top: 20px; font-family: Arial, sans-serif; font-size: 10px; color: #877C6B; }
    </style></head><body>
    <header>
      <div class="wm">ATELIER<small>TEXTILES</small></div>
      <div class="sub">${escHtml(title)} — Indicative<br>16 York St, Parnell, Auckland</div>
    </header>
    ${bodyHtml}
    <footer>All figures indicative · generated from the Atelier platform.</footer>
    </body></html>`)
  w.document.close()
  w.focus()
  w.print()
  return true
}
