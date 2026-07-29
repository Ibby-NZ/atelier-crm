// SKU logic (workshop diagram · decision 8): a SKU is built from a Range acronym + a design Code
// + a ColorCode, joined with hyphens. e.g. { rangeAcronym: 'PF', code: 'ATL', colorCode: '04' }
// ⇒ 'PF-ATL-04'. Centralised so the catalogue can GENERATE codes rather than hand-type them.

const clean = (s) => String(s ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

// Build a SKU from its three parts. Empty parts are dropped so a partial key still renders.
export function buildSku({ rangeAcronym, code, colorCode }) {
  return [clean(rangeAcronym), clean(code), colorCode == null ? '' : clean(colorCode)]
    .filter(Boolean)
    .join('-')
}

// Split an existing SKU back into its parts (inverse of buildSku).
export function parseSku(sku) {
  const [rangeAcronym = '', code = '', colorCode = ''] = String(sku).split('-')
  return { rangeAcronym, code, colorCode }
}

// Standardise a raw supplier product/colour code to the uniform format (decision 6, 15 Jul):
// uppercase, collapse any run of non-alphanumerics to a single hyphen, strip edge hyphens.
// 'w7004 / 01' ⇒ 'W7004-01'. Unlike clean() this PRESERVES separators (as hyphens) so the
// supplier's own code structure survives — clean() strips them for buildSku's part-join.
export function normalizeSupplierCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// A 2-digit colour code from a 1-based index: 1 ⇒ '01'.
export const colorCode = (index) => String(index).padStart(2, '0')

// The 3-letter design code from a design name: 'Atlas' ⇒ 'ATL'.
export const designCode = (design) => clean(design).slice(0, 3)

// The template shown in the UI, e.g. 'PF-ATL-NN' where NN is the per-colour code.
export function skuFormat({ rangeAcronym, code }) {
  return `${clean(rangeAcronym)}-${clean(code)}-NN`
}
