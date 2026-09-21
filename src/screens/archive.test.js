import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ENTITY_GROUPS,
  ENTITY_LABELS,
  RETIRED_ROUTES,
  chooserColumns,
  defaultColumns,
  filterParam,
  filterReady,
  formatCell,
  labelFor,
  nextSort,
  operatorsFor,
  parseFilterParam,
  recordScreenPath,
  recordTitle,
  viewFromSearch,
  viewQuery,
} from './archive.js'

const COLUMNS = [
  { name: 'guid', type: 'uuid' },
  { name: 'name', type: 'text' },
  { name: 'customer_type', type: 'text' },
  { name: 'credit_limit', type: 'numeric' },
  { name: 'created_on', type: 'timestamp' },
  { name: 'source_file', type: 'text' },
]

describe('entity picker', () => {
  it('names every entity exactly once across the groups', () => {
    const listed = ENTITY_GROUPS.flatMap((group) => group.entities)
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed.sort()).toEqual(Object.keys(ENTITY_LABELS).sort())
  })
})

describe('labelFor', () => {
  it('sentence-cases snake_case and keeps the acronyms the office reads', () => {
    expect(labelFor('credit_limit_base')).toBe('Credit limit base')
    expect(labelFor('total_incl_gst')).toBe('Total incl GST')
    expect(labelFor('landed_cost_nz')).toBe('Landed cost NZ')
    expect(labelFor('xero_contact_id')).toBe('Xero contact ID')
    expect(labelFor('sales_order_discount_pct')).toBe('Sales order discount %')
    expect(labelFor('guid')).toBe('GUID')
  })
})

describe('columns', () => {
  it('shows the preferred set where the API projects it, and never a column it does not', () => {
    expect(defaultColumns('accounts', COLUMNS)).toEqual(['name', 'customer_type'])
  })

  it('falls back to the first eight body columns for an entity with no preferred list', () => {
    expect(defaultColumns('mystery', COLUMNS)).toEqual(['name', 'customer_type', 'credit_limit'])
  })

  it('offers everything but guid in the chooser, audit tail last', () => {
    expect(chooserColumns(COLUMNS).map((column) => column.name)).toEqual([
      'name', 'customer_type', 'credit_limit', 'created_on', 'source_file',
    ])
  })
})

describe('filters', () => {
  it('offers operators per type with the sensible default first', () => {
    expect(operatorsFor('text')[0].value).toBe('contains')
    expect(operatorsFor('numeric')[0].value).toBe('eq')
    expect(operatorsFor('timestamp')[0].value).toBe('gte')
    expect(operatorsFor('boolean').map((op) => op.value)).toEqual(['eq', 'empty', 'notempty'])
    expect(operatorsFor('unknown')).toEqual(operatorsFor('text'))
  })

  it('serialises to the API form and back, keeping colons inside a value', () => {
    const filter = { column: 'order_date', op: 'gte', value: '2026-03-05T10:30' }
    expect(filterParam(filter)).toBe('order_date:gte:2026-03-05T10:30')
    expect(parseFilterParam(filterParam(filter))).toEqual(filter)
    expect(filterParam({ column: 'main_phone', op: 'empty' })).toBe('main_phone:empty')
    expect(parseFilterParam('main_phone:empty')).toEqual({ column: 'main_phone', op: 'empty', value: '' })
    expect(parseFilterParam('nonsense')).toBeNull()
    expect(parseFilterParam('name:bogus:x')).toBeNull()
  })

  it('knows when a row is complete enough to send', () => {
    expect(filterReady({ column: 'name', op: 'contains', value: '' })).toBe(false)
    expect(filterReady({ column: 'name', op: 'contains', value: 'a' })).toBe(true)
    expect(filterReady({ column: 'name', op: 'empty', value: '' })).toBe(true)
    expect(filterReady({ column: '', op: 'eq', value: 'a' })).toBe(false)
  })
})

describe('the view in the URL', () => {
  it('round-trips search, filters, sort and page, leaving defaults out', () => {
    const view = {
      q: 'linen',
      filters: [
        { column: 'item_type', op: 'in', value: 'Fabrics,W/P' },
        { column: 'retail_sell_price_nz', op: 'gte', value: '100' },
        { column: 'code', op: 'contains', value: '' }, // still being typed
      ],
      sort: 'retail_sell_price_nz',
      dir: 'desc',
      page: 3,
    }
    const query = viewQuery(view)
    expect(query).not.toContain('code')
    expect(query).not.toContain('limit')
    expect(viewFromSearch(query)).toEqual({ ...view, filters: view.filters.slice(0, 2) })
    expect(viewQuery({})).toBe('')
    expect(viewFromSearch('')).toEqual({ q: '', filters: [], sort: '', dir: '', page: 1 })
    expect(viewFromSearch('page=abc').page).toBe(1)
  })
})

describe('sorting', () => {
  it('flips the direction on the same column and starts ascending on a new one', () => {
    expect(nextSort({ sort: 'name', dir: 'asc' }, 'name')).toEqual({ sort: 'name', dir: 'desc' })
    expect(nextSort({ sort: 'name', dir: 'desc' }, 'name')).toEqual({ sort: 'name', dir: 'asc' })
    expect(nextSort({ sort: 'name', dir: 'desc' }, 'code')).toEqual({ sort: 'code', dir: 'asc' })
  })
})

describe('formatCell', () => {
  it('draws each type the way the office reads it', () => {
    expect(formatCell(null, 'text')).toBe('—')
    expect(formatCell('', 'text')).toBe('—')
    expect(formatCell(true, 'boolean')).toBe('Yes')
    expect(formatCell(false, 'boolean')).toBe('No')
    expect(formatCell(1234.5, 'numeric')).toBe('1,234.50')
    expect(formatCell(12, 'numeric')).toBe('12')
    expect(formatCell('2026-03-05T14:30:00', 'timestamp')).toBe('2026-03-05 14:30')
    expect(formatCell('2026-03-05', 'date')).toBe('2026-03-05')
  })
})

describe('records', () => {
  it('links the two entities that still have a detail screen, and nothing else', () => {
    expect(recordScreenPath('accounts', 'g')).toBe('/clients/g')
    expect(recordScreenPath('sales_orders', 'g')).toBe('/sales-orders/g')
    expect(recordScreenPath('stock_items', 'g')).toBeNull()
  })

  it('titles a record by its first preferred text value', () => {
    expect(recordTitle('accounts', { guid: 'g', name: '', atelier_account_number: 'A-1' })).toBe('A-1')
    expect(recordTitle('accounts', { guid: 'g' })).toBe('g')
  })
})

describe('the retired Dynamics list routes', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

  it.each(Object.entries(RETIRED_ROUTES))('%s redirects into the Archive at %s', (from, to) => {
    expect(app).toContain(`path="${from}" element={<Navigate to="${to}" replace />}`)
  })

  it('routes the Archive itself', () => {
    expect(app).toContain('path="/archive"')
    expect(app).toContain('path="/archive/:entity"')
  })
})
