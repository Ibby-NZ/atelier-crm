// Pure logic for PriceListImport (Price lists → Import), the screen over
// atelier-api's /admin/price-lists/import/* routes — "we don't have to come to
// you": the office's own way to land a supplier drop, beside the CLI.
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Everything
// that is a decision rather than a layout lives here and is tested directly —
// the split adminProductSheet.js made for the category round trip, which this
// flow deliberately mirrors (dry run → read the report → apply the FILE again).
// The generic report plumbing (REPORT, canApply, cappedNote) is imported from
// there rather than re-stated; only what is specific to a price list lives in
// this module.
//
// The rules with a quiet wrong answer:
//
//   · **The upload's content type is ours to choose, not the browser's.** The
//     route registers a Buffer parser for text/csv, the two Excel MIMEs and
//     octet-stream; a browser may report a .csv as text/plain, which the ROOT
//     Fastify instance owns — the body would arrive parsed into a string and
//     the office would be told to "post the price list as the raw file" about
//     a file it did post. The format is sniffed from the BYTES server-side
//     (a .xlsx is a zip), so the type only has to get through the parser.
//   · **`?filename=` is required and bounded.** It is stored (every row's
//     source_file, the import log) and pattern-gated against control
//     characters and path separators — Ajv's removeAdditional strips unknown
//     keys but a bad filename is a 400, so the two person-sized mistakes are
//     said here in their own words first.
//   · **`supplier` and `category` are FALLBACKS, exactly as the filename was
//     for the CLI.** A v3 file's own Supplier cell wins per row; the original
//     14-column layout has no Supplier column at all, so for one of those the
//     fallback is required in effect (a v1 file without it is a loud 400).
//     `category` fills a BLANK Item Type cell only — a cell that SAYS
//     something the four-word vocabulary lacks ("Leather") is reported with
//     its row number and never absorbed (US-004), which is why the refusal
//     carries `unmappable_categories` in its own bucket beside `errors`.
//   · **A file with any row error is refused WHOLE, by both routes, in the
//     same words.** There is no partial landing for a row to be dropped from;
//     "Nothing has been written" is the message's own sentence.
//   · **The apply posts the FILE again, never the dry run's report** — a list
//     of rates handed back by a client is a list the client could have edited.
//     The screen therefore drops its report the moment the file, supplier or
//     category changes, so what was read is always what is applied.

// Reused, not re-stated: one definition of "a report the office has read".
export { REPORT, canApply, cappedNote } from './adminProductSheet.js'

/** The dry run and the write. Two routes, not one with a `?dry_run=` flag. */
export const VALIDATE_PATH = '/admin/price-lists/import/validate'
export const APPLY_PATH = '/admin/price-lists/import/apply'

/** The applied-imports log (US-008). Refused uploads write nothing and leave no trace. */
export const IMPORTS_PATH = '/admin/price-lists/imports'

/**
 * The four values a category cell may resolve to, mirroring IMPORT_CATEGORIES
 * in atelier-api's src/pricing/price-list-import.js (itself the shared
 * CATEGORIES vocabulary). Whether it grows a fifth word is the client's
 * decision — the refusal report is what asks them.
 */
export const IMPORT_CATEGORIES = Object.freeze(['fabric', 'wallpaper', 'trimming', 'accessory'])

/** Mirrors IMPORT_BODY_LIMIT on the API routes, which answer a larger body with 413. */
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024

/**
 * The response caps, mirrored from the API so capped-list notes can be built:
 * errors and skipped rows cap at 50, previewed changes at 200 — the true count
 * always rides beside them in the payload.
 */
export const MAX_REPORTED_ERRORS = 50
export const MAX_REPORTED_CHANGES = 200

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// The API's own filename gate (its pattern forbids control characters and both
// path separators), mirrored so the mistake is named before a round trip.
// Spelt as char-code checks rather than a regex class so no control byte has
// to appear in this source file.
const badFilenameChar = (name) =>
  Array.from(name).some(
    (ch) => ch.charCodeAt(0) < 32 || ch === '/' || ch === '\\'
  )

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/**
 * The content type the upload states. By extension, not by `file.type`: the
 * browser's account of a spreadsheet varies by machine and can be text/plain,
 * which belongs to the root Fastify instance. Anything unrecognised goes as
 * octet-stream — the server sniffs the bytes either way.
 *
 * @param {string} [name]
 * @returns {string}
 */
export function importContentType(name = '') {
  if (/\.xlsx$/i.test(name)) return XLSX_TYPE
  if (/\.csv$/i.test(name)) return 'text/csv'
  return 'application/octet-stream'
}

/**
 * Why this file cannot be posted, or null when it can be. Only the mistakes
 * the API answers less readably than it could — a header mismatch, a broken
 * row, an unmappable category are all phrased well by the API per row and are
 * deliberately NOT pre-checked: a second opinion about what is in the file is
 * a second implementation of the parser.
 *
 * @param {{ name?: string, size?: number }|null} [file]
 * @returns {string|null}
 */
export function importFileProblem(file) {
  if (!file) return "Choose the supplier's price list first."
  if (/\.xls$/i.test(typeof file.name === 'string' ? file.name : '')) {
    return (
      'That is the old Excel format (.xls), which the importer cannot read. ' +
      'In Excel choose File → Save As and pick “Excel Workbook (.xlsx)” or ' +
      '“CSV (Comma delimited)”, then upload that file.'
    )
  }
  const size = Number(file.size)
  if (Number.isFinite(size)) {
    if (size === 0) return 'That file is empty.'
    if (size > MAX_IMPORT_BYTES) {
      return 'That file is larger than 16 MB. The largest supplier drop on record is a few thousand rows, so this is probably not a price list.'
    }
  }
  return null
}

/**
 * The querystring both routes take: the filename (required, stored), and the
 * two fallbacks only when stated — an empty `supplier=` would fail the
 * schema's minLength, the buildListQuery drop-empties rule again.
 *
 * @param {{ filename?: string, supplier?: string, category?: string }} [options]
 * @returns {{query: string}|{error: string}}
 */
export function importQuery({ filename, supplier = '', category = '' } = {}) {
  const name = typeof filename === 'string' ? filename.trim() : ''
  if (name === '') return { error: "Choose the supplier's price list first." }
  if (name.length > 200 || badFilenameChar(name)) {
    return {
      error:
        'That filename cannot be recorded — rename the file without slashes ' +
        "or control characters (it is stored as every row's source).",
    }
  }
  const params = [`filename=${encodeURIComponent(name)}`]
  const supplierName = typeof supplier === 'string' ? supplier.trim() : ''
  if (supplierName !== '') params.push(`supplier=${encodeURIComponent(supplierName)}`)
  if (category) params.push(`category=${encodeURIComponent(category)}`)
  return { query: `?${params.join('&')}` }
}

/**
 * A whole-file refusal, or null when the failure is not one.
 *
 * Both routes answer a broken file with the SAME 422 body (refusalBody in the
 * API), so this is the only place that reads it and one renderer serves both
 * buttons. The unmappable categories ride in their own bucket beside the
 * errors: a typo is the office's to fix, "Leather" is a word their vocabulary
 * does not have, and the report keeps the two questions apart. A 422 with no
 * row errors (the importer's batch-level gate) and the 400 a non-price-list
 * produces both fall back to the plain error line — neither has anything to
 * say per row.
 *
 * @param {{ status?: number, body?: object }|null} [error]  an ApiError
 * @returns {{ message: string, errors: Array<{row: number, message: string}>,
 *            errorCount: number,
 *            unmappable: Array<{row: number, value: string}>,
 *            unmappableCount: number, summary: object|null }|null}
 */
export function refusalFrom(error) {
  if (!error || error.status !== 422) return null
  const body = error.body
  const errors = Array.isArray(body?.errors)
    ? body.errors.filter((entry) => entry && typeof entry.message === 'string')
    : []
  if (errors.length === 0) return null
  const unmappable = Array.isArray(body.unmappable_categories)
    ? body.unmappable_categories.filter((entry) => entry && typeof entry.value === 'string')
    : []
  return Object.freeze({
    message:
      typeof body.message === 'string' && body.message.trim() !== ''
        ? body.message
        : 'That file could not be read. Nothing has been written.',
    errors,
    errorCount: Number.isFinite(body.error_count) ? body.error_count : errors.length,
    unmappable,
    unmappableCount: Number.isFinite(body.unmappable_category_count)
      ? body.unmappable_category_count
      : unmappable.length,
    summary: body.summary ?? null,
  })
}

/** 'BOUSSAC FABRIC PL 2026.csv · v1 layout' — which file, through which header. */
export function fileLine(summary) {
  if (!summary?.file) return ''
  return summary.template_version
    ? `${summary.file} · ${summary.template_version} layout`
    : summary.file
}

/**
 * The report's counts as one line. When the file is clean it balances —
 * rows === imported + skipped + duplicates + failed, asserted API-side — so
 * every line of the file is accounted for by one of these words, which is what
 * makes the line worth reading rather than a number nobody can check.
 *
 * @param {{ rows?: number, imported?: number, skipped?: number, duplicates?: number,
 *           failed?: number, created?: number, changed?: number, unchanged?: number }|null} [summary]
 * @returns {string}
 */
export function summaryLine(summary) {
  if (!summary) return ''
  const count = (key) => (Number.isFinite(summary[key]) ? summary[key] : 0)
  const parts = [`${plural(count('rows'), 'row', 'rows')} read`]
  if (count('skipped') > 0) parts.push(`${count('skipped')} unpriced`)
  if (count('duplicates') > 0) parts.push(`${count('duplicates')} repeated`)
  if (count('failed') > 0) parts.push(`${count('failed')} failed`)
  parts.push(`${count('created')} new`)
  parts.push(plural(count('changed'), 'rate change', 'rate changes'))
  parts.push(`${count('unchanged')} unchanged`)
  return parts.join(' · ')
}

/**
 * One previewed rate move, as a person reads it. The currency is stated once
 * unless the move CHANGES it — a currency swap at the same figure is a real
 * change and must not print as '58.5 → 58.5'.
 *
 * @param {{ row?: number, supplier?: string, category?: string, code?: string,
 *           from?: number, from_currency?: string, to?: number, to_currency?: string }} [change]
 * @returns {string}
 */
export function describeRateChange(change = {}) {
  const who = [change.supplier, change.category, change.code].filter(Boolean).join(' ')
  const crossCurrency = change.from_currency && change.from_currency !== change.to_currency
  const from = crossCurrency ? `${change.from ?? '—'} ${change.from_currency}` : `${change.from ?? '—'}`
  const to = `${change.to ?? '—'}${change.to_currency ? ` ${change.to_currency}` : ''}`
  return `Row ${change.row ?? '?'} · ${who} — ${from} → ${to}`
}

/**
 * What the office is told after an apply. `applied` is the transaction's own
 * count; zero is unreachable on a 200 today (a clean file with no rows is a
 * 400), guarded anyway so it can never read as success-shaped silence.
 *
 * @param {{ applied?: number, summary?: { changed?: number } }} [body]
 * @returns {string}
 */
export function appliedNote(body) {
  const applied = Number.isFinite(body?.applied) ? body.applied : 0
  if (applied === 0) return 'Nothing was applied.'
  const changed = Number.isFinite(body?.summary?.changed) ? body.summary.changed : 0
  return (
    `${plural(applied, 'row', 'rows')} landed in one transaction — ` +
    `${plural(changed, 'rate change', 'rate changes')} recorded in the price history.`
  )
}

/**
 * One logged import's four counts. They balance the same way the summary does
 * (read = imported + skipped + duplicate; only clean files are ever applied),
 * so the line accounts for the whole file.
 *
 * @param {{ rows_read?: number, rows_imported?: number, rows_skipped?: number,
 *           rows_duplicate?: number }} [run]
 * @returns {string}
 */
export function runLine(run = {}) {
  const count = (value) => (Number.isFinite(value) ? value : 0)
  const parts = [`${count(run.rows_read)} read`, `${count(run.rows_imported)} imported`]
  if (count(run.rows_skipped) > 0) parts.push(`${count(run.rows_skipped)} unpriced`)
  if (count(run.rows_duplicate) > 0) parts.push(`${count(run.rows_duplicate)} repeated`)
  return parts.join(' · ')
}
