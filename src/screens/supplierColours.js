// "Upload colours" on the Products list — the Supplier Colours workbook
// (Supplier | Brand | Product Name | Code | Colour), landed by atelier-api as
// designs and colourways through its existing colourway import
// (src/catalogue/supplier-colours-import.js there).
//
//   POST /admin/catalogue/colours/import/validate?filename=   dry run, writes nothing
//   POST /admin/catalogue/colours/import/apply?filename=      one transaction
//
// Director-only in the API (a bulk catalogue write); the panel is drawn only for
// a director, which is drawing, not the gate. Rules here; the .jsx is layout.

export const COLOURS_IMPORT_PATH = '/admin/catalogue/colours/import'
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** The API's body limit (16 MB); the 25 Sep 2026 workbook is 1.3 MB. */
export const MAX_COLOURS_BYTES = 16 * 1024 * 1024

export const coloursImportPath = (step, filename) =>
  `${COLOURS_IMPORT_PATH}/${step}${filename ? `?filename=${encodeURIComponent(filename)}` : ''}`

/** What is wrong with a chosen file before it is sent, or null. The API re-checks. */
export const coloursFileProblem = (file) => {
  if (!file) return 'Choose the Supplier Colours workbook first.'
  if (file.size === 0) return 'That file is empty.'
  if (!/\.xlsx$/i.test(file.name ?? '')) return 'That is not an .xlsx workbook.'
  if (file.size > MAX_COLOURS_BYTES) return 'That file is larger than 16 MB — is it the Supplier Colours workbook?'
  return null
}

/** A 422 with the API's per-row reasons, or null for any other failure. */
export const coloursRefusal = (error) => {
  if (error?.status !== 422 || !error.body || typeof error.body !== 'object') return null
  return {
    message: error.body.message ?? error.message,
    errors: Array.isArray(error.body.errors) ? error.body.errors : [],
    errorCount: Number(error.body.error_count) || 0,
  }
}

const n = (value) => Number(value ?? 0).toLocaleString('en-NZ')
const plural = (count, word) => `${n(count)} ${word}${Number(count) === 1 ? '' : 's'}`

/** "2 rows — 1 design (1 new, 1 with a product price), 1 colourway (1 new)". */
export const coloursSummaryLine = (result) => {
  if (!result) return ''
  return (
    `${plural(result.rows_read, 'row')} — ${plural(result.products, 'design')} ` +
    `(${n(result.products_new)} new, ${n(result.products_priced)} with a product price), ` +
    `${plural(result.colourways, 'colourway')} (${n(result.colourways_new)} new)`
  )
}

/** Apply is offered on a check that would land something, never on a result already applied. */
export const canApplyColours = (result) => Boolean(result) && !result.applied && Number(result.colourways) > 0

/** The rows that did not land, as the office's worklist. */
export const coloursWorklist = (result) => [
  ...(result?.unknown_brands ?? []).map((entry) => ({
    key: `brand:${entry.brand}`,
    text: `${entry.brand} — ${plural(entry.rows, 'row')}: no house of that name in the catalogue (add it, or rename one to match), first at ${entry.first}`,
  })),
  ...(result?.skips ?? []).map((entry) => ({
    key: `skip:${entry.reason}`,
    text: `${plural(entry.rows, 'row')}: ${entry.reason}, first at ${entry.first}`,
  })),
  ...(result?.conflicts ?? []).map((entry) => ({
    key: `conflict:${entry.sku}`,
    text: `${entry.sku}: "${entry.kept.name}" kept, "${entry.dropped.name}" dropped (${entry.dropped.source})`,
  })),
]

/**
 * "Applied — 1 colourway across 1 design, 1 new stock row (at zero), 1 design
 * given its trade price from its product price". The last part is the API's
 * fill-only step after the colours land: a new design a product price names
 * takes its trade price, wholesale rate and category from it.
 */
export const coloursAppliedNote = (result) =>
  result?.applied
    ? `Applied — ${plural(result.applied.colourways, 'colourway')} across ${plural(result.applied.products, 'design')}, ` +
      `${plural(result.applied.stock_rows_created, 'new stock row')} (at zero)` +
      (Number(result.applied.products_priced) > 0
        ? `, ${plural(result.applied.products_priced, 'design')} given ${Number(result.applied.products_priced) === 1 ? 'its' : 'their'} trade price from the product prices.`
        : '.')
    : ''
