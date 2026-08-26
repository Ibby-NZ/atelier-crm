// Pure logic for AdminProductSheet (Catalogue → Categories), the screen over
// atelier-api's /admin/product-sheet/* routes.
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Everything
// that is a decision rather than a layout lives here and is tested directly —
// the same split adminShipping.js and adminSuppliers.js make.
//
// The round trip is: download one house's products as a CSV whose Category
// column is empty, fill it in in Excel, upload it to be CHECKED, read the
// report, then apply it. Five of those steps carry a rule that fails quietly if
// it is got wrong:
//
//   · **`?brand=` must never be sent empty.** The API applies its default
//     through Ajv's `useDefaults`, which fires only when the key is ABSENT.
//     `?brand=` is present, so it is measured against `^[a-z0-9-]+$` and 400s —
//     killing the download rather than falling back to the default house. That
//     is the opposite of this repo's list convention, where buildListQuery drops
//     an empty filter precisely so it never reaches the API.
//   · **The upload's content type is ours to choose, not the browser's.** The
//     route registers a Buffer parser for text/csv, application/vnd.ms-excel and
//     application/octet-stream only. A browser reports a .csv as any of those —
//     or as text/plain, which the ROOT Fastify instance owns: the body would
//     arrive parsed into a string, `Buffer.isBuffer` would be false, and the
//     office would be told to "post the sheet as the raw file" about a file it
//     did post. So the type is stated, never forwarded.
//   · **Content-Disposition is usually invisible to us.** It is not a
//     CORS-safelisted response header, and the API does not name it in
//     Access-Control-Expose-Headers, so cross-origin (CRM :5273 → API :3001) the
//     filename comes back null. `filenameFrom` therefore falls back to the
//     API's own naming rule rather than saving a file called "download".
//   · **A 422 is a report, not an error line.** The validate and apply routes
//     answer a row-level failure with { message, errors: [{ row, message }],
//     error_count, summary }; both refuse in exactly the same words, so one
//     renderer serves both buttons. Rendering only `message` would throw away
//     the row numbers, which are the only thing that lets a person find the row
//     in Excel.
//   · **The four legal categories are stated HERE, not in the file.** A CSV has
//     nowhere to put a note that Excel will not hand back as a data row, so the
//     export deliberately does not carry the vocabulary and the panel must.

/** The dry run and the write. Two routes, not one with a flag — see the screen. */
export const VALIDATE_PATH = '/admin/product-sheet/validate'
export const APPLY_PATH = '/admin/product-sheet/apply'

/** The houses that fill the selector. `/admin/brands` returns the whole list. */
export const HOUSE_LIST_PATH = '/admin/brands'

/**
 * Above any plausible house count (41 today), because `/admin/brands` declares
 * no `page` param and returns every row with no `meta` — the kit's default 25
 * would report a second page that could never be fetched.
 */
export const HOUSE_LIST_LIMIT = 1000

/**
 * The CRM's copy of DEFAULT_BRAND_SLUG in atelier-api's
 * src/products/product-sheet.js: Atelier's own workroom, the house whose
 * merchandising axis is load-bearing today. Only the selector's opening value —
 * every request this screen makes names its house explicitly.
 */
export const DEFAULT_BRAND_SLUG = 'atelier-textiles-nz'

/**
 * The values `products.category` accepts, mirroring PRODUCT_CATEGORIES in
 * atelier-api. RE-EXPORTED from src/lib/categories.js rather than declared here:
 * this screen, the freight desk and the rate ledger each used to carry their own
 * copy of the list, so widening the vocabulary meant finding all three. The
 * specifier stays for every existing importer.
 *
 * The panel states them because the sheet cannot; an unknown value comes back
 * from the API as a row error naming the row.
 */
export { CATEGORY_VALUES } from '../lib/categories.js'

/** Stated, never forwarded from the file — see the header. */
export const SHEET_CONTENT_TYPE = 'text/csv'

/** Mirrors IMPORT_BODY_LIMIT on the API's routes, which answers a larger body with a 413. */
export const MAX_SHEET_BYTES = 4 * 1024 * 1024

// A slug is server-generated and immutable, so this is the API's own querystring
// pattern rather than a guess about what staff might type.
const SLUG_PATTERN = /^[a-z0-9-]+$/

/**
 * The download path for one house, or null when there is no house to ask for.
 * Null rather than a bare path: an absent `?brand=` would silently download
 * Atelier's own workroom while the selector showed something else, and an empty
 * one is a 400 (see the header).
 *
 * @param {string} brandSlug
 * @returns {string|null}
 */
export function exportPath(brandSlug) {
  const slug = typeof brandSlug === 'string' ? brandSlug.trim() : ''
  if (!SLUG_PATTERN.test(slug)) return null
  return `/admin/product-sheet/export.csv?brand=${slug}`
}

/**
 * The houses the selector offers, in the order the API listed them (alpha).
 * A row with no slug cannot be asked for, so it is dropped rather than rendered
 * as an option that 400s.
 *
 * @param {ReadonlyArray<{ slug?: string, name?: string }>} [brands]
 * @returns {Array<{ slug: string, name: string }>}
 */
export function brandOptions(brands = []) {
  return brands
    .filter((brand) => typeof brand?.slug === 'string' && SLUG_PATTERN.test(brand.slug))
    .map((brand) => ({
      slug: brand.slug,
      // A house with no name still has to be selectable; the slug is what the
      // office would recognise it by anyway.
      name: typeof brand.name === 'string' && brand.name.trim() !== '' ? brand.name : brand.slug,
    }))
}

/**
 * Which house the selector opens on: Atelier's own workroom when the catalogue
 * holds it, else the first house, else nothing (an empty catalogue, or a list
 * that failed to load — the download refuses rather than guessing).
 *
 * @param {ReadonlyArray<{ slug: string }>} [options]  from brandOptions
 * @returns {string}
 */
export function initialBrand(options = []) {
  const preferred = options.find((option) => option.slug === DEFAULT_BRAND_SLUG)
  if (preferred) return preferred.slug
  return options[0]?.slug ?? ''
}

/**
 * The name to save a downloaded sheet under. The API's own when the browser can
 * see it (same-origin, or once the API exposes the header), and otherwise the
 * rule it applies itself — atelier-api's productSheetFilename, built from the
 * slug because a house NAME is free text and can carry a quote or a CR.
 *
 * Anything that is not a plain filename is discarded rather than sanitised: a
 * value with a path separator or a quote in it is not a name this API wrote.
 *
 * @param {string|null} disposition  the raw Content-Disposition, or null
 * @param {string} brandSlug
 * @returns {string}
 */
export function filenameFrom(disposition, brandSlug) {
  const match =
    typeof disposition === 'string' ? /filename="?([^";]+)"?/.exec(disposition) : null
  const named = match ? match[1].trim() : ''
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(named)) return named
  return `atelier-product-sheet-${brandSlug}.csv`
}

/**
 * Why this file cannot be uploaded, or null when it can be.
 *
 * Only the three mistakes the API answers less readably than it could. An
 * unexpected header, an unknown category and an unmatched Product ID are all
 * phrased well by the API and are deliberately NOT pre-checked here — this
 * screen never reads the file's contents, because a second opinion about what
 * is in it is a second implementation of the parser.
 *
 * @param {{ name?: string, size?: number }|null} [file]
 * @returns {string|null}
 */
export function fileProblem(file) {
  if (!file) return 'Choose the filled-in sheet first.'
  if (/\.xlsx?$/i.test(typeof file.name === 'string' ? file.name : '')) {
    return (
      'That is an Excel workbook, not the sheet. In Excel choose File → Save As and pick ' +
      '“CSV (Comma delimited)”, then upload that file.'
    )
  }
  const size = Number(file.size)
  if (Number.isFinite(size)) {
    if (size === 0) return 'That file is empty.'
    if (size > MAX_SHEET_BYTES) {
      return 'That file is larger than 4 MB. A house’s sheet is a few hundred kilobytes, so this is probably not one.'
    }
  }
  return null
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/**
 * The report's counts as one line. When there are no errors the file balances —
 * `rows === skipped + repeats + unchanged + changed` — so every row read is
 * accounted for by one of these words, which is what makes the line worth
 * reading rather than a number nobody can check.
 *
 * @param {{ rows?: number, skipped?: number, repeats?: number,
 *           unchanged?: number, changed?: number }|null} [summary]
 * @returns {string}
 */
export function summaryLine(summary) {
  if (!summary) return ''
  const count = (key) => (Number.isFinite(summary[key]) ? summary[key] : 0)
  const parts = [`${plural(count('rows'), 'row', 'rows')} read`]
  if (count('skipped') > 0) parts.push(`${count('skipped')} left blank`)
  if (count('repeats') > 0) parts.push(`${count('repeats')} repeated`)
  if (count('unchanged') > 0) parts.push(`${count('unchanged')} already set`)
  parts.push(
    count('changed') === 0 ? 'nothing to change' : `${plural(count('changed'), 'category', 'categories')} to change`
  )
  return parts.join(' · ')
}

/**
 * One pending change, as a person reads it. `from` is null for a product nobody
 * has categorised yet, which is the common case and must not print as "null".
 *
 * @param {{ row?: number, design?: string, from?: string|null, to?: string }} change
 * @returns {string}
 */
export function describeChange(change) {
  const design = typeof change?.design === 'string' && change.design.trim() !== ''
    ? change.design
    : `Product ${change?.id ?? '?'}`
  return `Row ${change?.row ?? '?'} · ${design} — ${change?.from ?? 'not set'} → ${change?.to ?? ''}`
}

/**
 * A row-level refusal, or null when the failure is not one.
 *
 * Both routes answer a broken sheet with the SAME 422 body, so this is the only
 * place that reads it and one renderer serves both buttons. A 422 carrying no
 * rows is not this report and falls back to the screen's ordinary error line —
 * as does the 400 a file that is not a product sheet at all produces, which has
 * nothing to say per row.
 *
 * @param {{ status?: number, body?: object }|null} [error]  an ApiError
 * @returns {{ message: string, errors: Array<{ row: number, message: string }>,
 *            errorCount: number, summary: object|null }|null}
 */
export function refusalFrom(error) {
  if (!error || error.status !== 422) return null
  const body = error.body
  const errors = Array.isArray(body?.errors)
    ? body.errors.filter((entry) => entry && typeof entry.message === 'string')
    : []
  if (errors.length === 0) return null
  return Object.freeze({
    message:
      typeof body.message === 'string' && body.message.trim() !== ''
        ? body.message
        : 'That sheet could not be read. Nothing has been written.',
    errors,
    errorCount: Number.isFinite(body.error_count) ? body.error_count : errors.length,
    summary: body.summary ?? null,
  })
}

/**
 * "Showing the first 50 of 214 rows." — or null when nothing was left out.
 *
 * The API caps `errors` at 50 and `changes` at 200 and reports the true count
 * beside them, because sixty broken rows are usually one mistake made sixty
 * times. A silent cap would read as "that was all of them".
 *
 * @param {number} shown
 * @param {number} total
 * @param {string} noun  singular
 * @returns {string|null}
 */
export function cappedNote(shown, total, noun) {
  if (!Number.isFinite(total) || total <= shown) return null
  return `Showing the first ${shown} of ${plural(total, noun, `${noun}s`)}.`
}

/**
 * The three things the panel can be showing: a clean dry run, a refusal, or
 * what an apply did. Kept here rather than as loose strings in the screen
 * because one of them decides whether the write is offered at all.
 */
export const REPORT = Object.freeze({ clean: 'clean', refused: 'refused', applied: 'applied' })

/**
 * Whether the Apply button exists.
 *
 * The office's flow is two steps — read the report, then decide — and the API
 * enforces the same split with two routes rather than a `?dry_run=` flag. So
 * nothing may be written until a dry run has come back clean, and once a sheet
 * has been applied the button goes away rather than staying lit: re-applying is
 * harmless (a stated category equal to the stored one is `unchanged`, never a
 * write), but a button that does nothing visible reads as one that failed.
 *
 * @param {{ kind?: string }|null} [report]
 * @returns {boolean}
 */
export const canApply = (report) => report?.kind === REPORT.clean

/**
 * What the office is told after an apply. `applied` is the UPDATE's own row
 * count — the database's statement rather than the sheet's prediction — so it
 * is what the sentence quotes.
 *
 * @param {{ applied?: number }} [result]
 * @returns {string}
 */
export function appliedNote(result) {
  const applied = Number.isFinite(result?.applied) ? result.applied : 0
  if (applied === 0) {
    return 'Nothing to apply — every category on the sheet already matched the catalogue.'
  }
  return `${plural(applied, 'category', 'categories')} applied.`
}
