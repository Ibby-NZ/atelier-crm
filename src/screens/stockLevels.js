// "Upload stock" on the Products list — Dynamics' Stock View (the stock item
// export: item, code, range, stock on hand) onto the variations of the
// catalogue the product prices built. atelier-api src/catalogue/stock-levels-import.js.
//
//   POST /admin/inventory/stock-levels/validate?filename=   dry run, writes nothing
//   POST /admin/inventory/stock-levels/apply?filename=      one transaction
//
// Director-only in the API. Only what matches is written; every stocked item
// that does not is listed (the office's choice, 28 Sep 2026). Rules here; the
// .jsx is layout.

export { XLSX_CONTENT_TYPE, coloursFileProblem as stockFileProblem, coloursRefusal as stockRefusal } from './supplierColours.js'

export const STOCK_LEVELS_PATH = '/admin/inventory/stock-levels'

export const stockLevelsPath = (step, filename) =>
  `${STOCK_LEVELS_PATH}/${step}${filename ? `?filename=${encodeURIComponent(filename)}` : ''}`

const n = (value) => Number(value ?? 0).toLocaleString('en-NZ')
const plural = (count, word) => `${n(count)} ${word}${Number(count) === 1 ? '' : 's'}`

/** "7,750 items (371 holding stock) — 43 variations set, 15 new, 313 not placed". */
export const stockSummaryLine = (result) => {
  if (!result) return ''
  const notPlaced = Number(result.several) + Number(result.no_product) + Number(result.no_house) + Number(result.negative)
  return (
    `${plural(result.rows_read, 'item')} (${n(result.stocked)} holding stock) — ` +
    `${plural(result.set_stocked, 'stocked variation')} set, ${n(result.created)} new, ${n(notPlaced)} not placed`
  )
}

/** Apply is offered on a check that would write something, never on one already applied. */
export const canApplyStock = (result) => Boolean(result) && !result.applied && Number(result.set) + Number(result.created) > 0

const WHY = Object.freeze({
  several: 'matches more than one variation or product',
  no_product: 'no product in its house',
  no_house: 'no house of that name',
  negative: 'negative stock',
})

/** The stocked items that were not placed, as the office's worklist rows. */
export const stockWorklist = (result) =>
  (result?.worklist ?? []).map((entry, index) => ({
    key: `${entry.kind}-${entry.item_code}-${index}`,
    range: entry.range_name,
    code: entry.item_code,
    name: entry.name,
    onHand: entry.on_hand,
    why: entry.candidates?.length ? `${WHY[entry.kind]}: ${entry.candidates.join(', ')}` : WHY[entry.kind] ?? entry.kind,
  }))

/** The worklist as CSV, for the office to work through outside the screen. */
export const stockWorklistCsv = (result) => {
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const rows = stockWorklist(result).map((row) => [row.range, row.code, row.name, row.onHand, row.why].map(cell).join(','))
  return ['Range,Item code,Name,Stock on hand,Why not placed', ...rows].join('\n')
}

/** "Applied — 58 variations given their stock (15 new), 4,868 units not placed." */
export const stockAppliedNote = (result) =>
  result?.applied
    ? `Applied — ${plural(Number(result.set_stocked) + Number(result.created), 'stocked variation')} given their stock ` +
      `(${n(result.created)} new), ${n(result.units_not_applied)} units not placed.`
    : ''
