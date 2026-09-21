// The Archive screen's rules, kept pure so they can be tested without a DOM
// (this repo has no jsdom). Archive.jsx is layout over these.
//
// The Archive is every Dynamics-365 staging table the API holds
// (GET /admin/dynamics), read-only, any column filterable. Its entity
// vocabulary is the API's IMPORT one (`sales_orders`, `stock_items`), which is
// the only one naming all twelve tables; `read_entity` on the describe read
// says which four also have a curated /admin/legacy/* route — that is where the
// correction panel and the older detail screens still live.

// Display names, in the order the picker shows them — grouped by what the
// office would go looking for, not by table name.
export const ENTITY_GROUPS = Object.freeze([
  { label: 'Clients', entities: ['accounts', 'contacts'] },
  { label: 'Sales', entities: ['sales_orders', 'sales_invoices'] },
  { label: 'Purchasing', entities: ['purchase_orders', 'purchase_invoices'] },
  { label: 'Catalogue', entities: ['product_prices', 'stock_items', 'item_locations', 'tracking_options'] },
  { label: 'Stock', entities: ['reserves', 'cuttings'] },
])

export const ENTITY_LABELS = Object.freeze({
  accounts: 'Accounts',
  contacts: 'Contacts',
  sales_orders: 'Sales orders',
  sales_invoices: 'Sales invoices',
  purchase_orders: 'Purchase orders',
  purchase_invoices: 'Purchase invoices',
  product_prices: 'Product prices',
  stock_items: 'Stock items',
  item_locations: 'Item locations',
  tracking_options: 'Tracking options',
  reserves: 'Reserves',
  cuttings: 'Cuttings',
})

export const DEFAULT_ENTITY = 'accounts'
export const PAGE_LIMIT = 50

// The columns a fresh view of each entity shows. Anything not listed is one
// click away in the column chooser; an entity not listed here shows its first
// eight non-audit columns.
const PREFERRED_COLUMNS = Object.freeze({
  accounts: ['name', 'atelier_account_number', 'customer_type', 'primary_contact', 'email', 'main_phone', 'address1_city', 'owner', 'status_reason'],
  contacts: ['full_name', 'company_name', 'job_title', 'email', 'mobile_phone', 'business_phone', 'address1_city', 'owner'],
  sales_orders: ['number', 'customer', 'order_date', 'total_ex_gst', 'total_incl_gst', 'currency', 'pricing_type', 'status_reason', 'owner'],
  sales_invoices: ['number', 'customer', 'invoice_date', 'total_ex_gst', 'total_incl_gst', 'currency', 'status_reason', 'owner'],
  purchase_orders: ['number', 'vendor', 'order_date', 'total_ex_gst', 'total_incl_gst', 'currency', 'status_reason', 'owner'],
  purchase_invoices: ['number', 'vendor', 'invoice_date', 'due_date', 'total_ex_gst', 'total_incl_gst', 'currency', 'status_reason', 'owner'],
  product_prices: ['code', 'description', 'range_name', 'item_type', 'width', 'currency', 'wholesale_rate', 'landed_cost_nz', 'trade_sell_price_nz', 'retail_sell_price_nz'],
  stock_items: ['item_code', 'name', 'supplier', 'range_name', 'item_type', 'stock_on_hand', 'stock_available', 'trade_price', 'retail_price', 'can_sell'],
  item_locations: ['item', 'location', 'total_stock_on_hand', 'total_stock_available', 'status_reason'],
  reserves: ['name', 'reserve_number', 'customer', 'product', 'colour_code', 'supplier', 'quantity', 'reserved_until', 'status_reason'],
  cuttings: ['name', 'customer', 'product', 'colour_code', 'supplier', 'quantity', 'owner', 'status_reason'],
  tracking_options: ['name', 'tracking_category', 'supplier', 'discount', 'trade_markup', 'freight', 'clearance', 'duty_rate_a'],
})

// The stamp/audit tail every entity carries; pushed to the back of the chooser.
const AUDIT_COLUMNS = new Set(['created_by', 'created_on', 'modified_by', 'modified_on', 'source_file', 'exported_at'])

const ACRONYMS = { nz: 'NZ', gst: 'GST', id: 'ID', guid: 'GUID', xero: 'Xero', d365: 'D365', pct: '%', url: 'URL', gl: 'GL' }

/** `credit_limit_base` → "Credit limit base"; `total_incl_gst` → "Total incl GST". */
export function labelFor(column) {
  const words = String(column).split('_').filter(Boolean).map((word) => ACRONYMS[word] ?? word)
  if (words.length === 0) return ''
  const [first, ...rest] = words
  const head = ACRONYMS[first.toLowerCase()] ? first : first.charAt(0).toUpperCase() + first.slice(1)
  return [head, ...rest].join(' ')
}

/**
 * Column names to show for an entity, from the describe read's column list.
 * Preferred ones that the API does not actually project are dropped rather than
 * drawn as empty headers.
 *
 * @param {string} entity
 * @param {Array<{name: string, type: string}>} columns
 */
export function defaultColumns(entity, columns) {
  const names = new Set(columns.map((column) => column.name))
  const preferred = (PREFERRED_COLUMNS[entity] ?? []).filter((name) => names.has(name))
  if (preferred.length > 0) return preferred
  return columns
    .map((column) => column.name)
    .filter((name) => name !== 'guid' && !AUDIT_COLUMNS.has(name))
    .slice(0, 8)
}

/** Chooser order: guid never; the audit tail last; everything else as projected. */
export function chooserColumns(columns) {
  const body = columns.filter((column) => column.name !== 'guid' && !AUDIT_COLUMNS.has(column.name))
  const tail = columns.filter((column) => AUDIT_COLUMNS.has(column.name))
  return [...body, ...tail]
}

// Operator vocabulary — the API's, with the words the office reads.
const OPERATORS = Object.freeze({
  eq: 'is',
  ne: 'is not',
  contains: 'contains',
  starts: 'starts with',
  in: 'is one of',
  gt: 'after / more than',
  gte: 'on or after / at least',
  lt: 'before / less than',
  lte: 'on or before / at most',
  empty: 'is empty',
  notempty: 'is not empty',
})

const OPS_BY_TYPE = Object.freeze({
  text: ['contains', 'eq', 'ne', 'starts', 'in', 'empty', 'notempty'],
  numeric: ['eq', 'gte', 'lte', 'gt', 'lt', 'ne', 'empty', 'notempty'],
  date: ['eq', 'gte', 'lte', 'gt', 'lt', 'ne', 'empty', 'notempty'],
  timestamp: ['gte', 'lte', 'gt', 'lt', 'eq', 'ne', 'empty', 'notempty'],
  boolean: ['eq', 'empty', 'notempty'],
  uuid: ['eq', 'ne'],
})

/** `[{ value, label }]` for a column type, first entry the sensible default. */
export function operatorsFor(type) {
  return (OPS_BY_TYPE[type] ?? OPS_BY_TYPE.text).map((value) => ({ value, label: OPERATORS[value] }))
}

export const NO_VALUE_OPS = new Set(['empty', 'notempty'])

/** A filter row the screen holds — `{ column, op, value }` — as the API's `column:op:value`. */
export function filterParam({ column, op, value }) {
  if (NO_VALUE_OPS.has(op)) return `${column}:${op}`
  return `${column}:${op}:${value ?? ''}`
}

/** The inverse, for filters carried in the URL. Malformed strings yield null. */
export function parseFilterParam(text) {
  const first = text.indexOf(':')
  if (first < 0) return null
  const second = text.indexOf(':', first + 1)
  const column = text.slice(0, first)
  const op = second < 0 ? text.slice(first + 1) : text.slice(first + 1, second)
  if (!column || !OPERATORS[op]) return null
  return { column, op, value: second < 0 ? '' : text.slice(second + 1) }
}

/** A filter is sendable once it has a column, an operator, and — where one is needed — a value. */
export function filterReady({ column, op, value }) {
  if (!column || !op) return false
  return NO_VALUE_OPS.has(op) || String(value ?? '').trim() !== ''
}

/**
 * The URL search string for a view. Used for BOTH the API request and the
 * browser URL, so a bookmark reproduces the exact list. Unready filter rows
 * (still being typed) are left out.
 *
 * @param {{ q?: string, filters?: Array<{column,op,value}>, sort?: string, dir?: string, page?: number, limit?: number }} view
 */
export function viewQuery({ q = '', filters = [], sort = '', dir = '', page = 1, limit = PAGE_LIMIT } = {}) {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  for (const filter of filters) if (filterReady(filter)) params.append('filter', filterParam(filter))
  if (sort) {
    params.set('sort', sort)
    if (dir) params.set('dir', dir)
  }
  if (page > 1) params.set('page', String(page))
  if (limit !== PAGE_LIMIT) params.set('limit', String(limit))
  return params.toString()
}

/** The inverse of viewQuery, from a URLSearchParams. */
export function viewFromSearch(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search)
  const page = Number(params.get('page') ?? 1)
  return {
    q: params.get('q') ?? '',
    filters: params.getAll('filter').map(parseFilterParam).filter(Boolean),
    sort: params.get('sort') ?? '',
    dir: params.get('dir') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Sort toggling: same column flips direction; a new column starts ascending. */
export function nextSort(current, column) {
  if (current.sort === column) return { sort: column, dir: current.dir === 'desc' ? 'asc' : 'desc' }
  return { sort: column, dir: 'asc' }
}

const money = new Intl.NumberFormat('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plain = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 4 })

/** One cell's text. Null is an em dash; the API's zone-less timestamps print as written. */
export function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'boolean') return value ? 'Yes' : 'No'
  if (type === 'numeric') {
    const n = Number(value)
    return Number.isInteger(n) ? plain.format(n) : money.format(n)
  }
  if (type === 'timestamp') return String(value).replace('T', ' ').slice(0, 16)
  return String(value)
}

/** The older per-record screens, for the two entities that still have one. */
export function recordScreenPath(entity, guid) {
  if (entity === 'accounts') return `/clients/${guid}`
  if (entity === 'sales_orders') return `/sales-orders/${guid}`
  return null
}

/** Where the four retired Dynamics list routes now land. */
export const RETIRED_ROUTES = Object.freeze({
  '/clients/legacy': '/archive/accounts',
  '/sales-orders': '/archive/sales_orders',
  '/reserves': '/archive/stock_items',
  '/price-lists': '/archive/product_prices',
})

/** The record's headline in the drawer: the first preferred text column with a value. */
export function recordTitle(entity, record) {
  const candidates = PREFERRED_COLUMNS[entity] ?? Object.keys(record)
  for (const name of candidates) {
    const value = record[name]
    if (typeof value === 'string' && value.trim()) return value
  }
  return record.guid ?? ''
}
