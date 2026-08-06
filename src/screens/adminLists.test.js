import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery, pageCount } from '../admin/list.js'
import {
  RATE_DELETE_CAVEAT,
  RATE_LIST_LIMIT,
  UNPAGED_LIST_LIMIT,
  describeAccount,
  describeRate,
  describeStockRow,
  needsStockRow,
  orderListFilters,
  rateListFilters,
  stockDeletePath,
  stockListFilters,
  userListFilters,
  withDeleteCaveat,
} from './adminLists.js'

describe('list limits', () => {
  it('keeps an unpaged answer at one page', () => {
    // /admin/inventory, /admin/orders and /admin/users return the whole list
    // with no meta and declare additionalProperties: false, so the `page`
    // useAdminList sends is stripped by Ajv rather than honoured. The kit's
    // default 25 would advertise a second page that can never be fetched.
    expect(pageCount(866, UNPAGED_LIST_LIMIT)).toBe(1)
    expect(pageCount(866, 25)).toBe(35)
  })

  it('pages the one list that genuinely pages, inside the endpoint MAX_LIMIT', () => {
    expect(pageCount(19_500, RATE_LIST_LIMIT)).toBe(780)
    // MAX_LIMIT on /admin/price-list-items is 200 and is the schema `maximum`,
    // so an over-large limit is a 400 rather than a silent clamp.
    expect(RATE_LIST_LIMIT).toBeLessThanOrEqual(200)
  })
})

// Every filter helper is asserted on the querystring the API actually receives,
// because the failure being guarded against is a param arriving as `x=` — which
// each of these endpoints answers with a 400 that kills the whole list.
describe('list filters', () => {
  it('drops an unset stock search', () => {
    expect(buildListQuery(stockListFilters())).toBe('')
    expect(buildListQuery(stockListFilters('   '))).toBe('')
    expect(buildListQuery(stockListFilters('  PF-ATL  '))).toBe('q=PF-ATL')
  })

  it('sends only the supplier-rate filters that are set', () => {
    expect(buildListQuery(rateListFilters())).toBe('')
    expect(
      buildListQuery(
        rateListFilters({ term: 'linen', supplier: ' Pierre Frey ', category: 'fabric', showArchived: true })
      )
    ).toBe('q=linen&supplier=Pierre+Frey&category=fabric&include_archived=true')
  })

  it('never sends status= for "All statuses"', () => {
    // The endpoint's enum rejects an empty value, and the resulting 400 takes
    // the whole queue with it rather than one filter.
    expect(buildListQuery(orderListFilters(''))).toBe('')
    expect(buildListQuery(orderListFilters('requested'))).toBe('status=requested')
    expect(buildListQuery(orderListFilters('', true))).toBe('include_archived=true')
  })

  it('leaves the users roster unsegmented', () => {
    // The absence of `segment` is what makes this the superset view — the one
    // screen that shows staff logins at all.
    expect(buildListQuery(userListFilters())).toBe('')
    expect(buildListQuery(userListFilters(true))).toBe('include_archived=true')
    expect(userListFilters()).toEqual({ include_archived: null })
  })
})

describe('stockDeletePath', () => {
  it('addresses stock by colourway, because a stock row has no id', () => {
    // The inventory read model returns colourway_id and no `id` at all, so the
    // kit's default `${path}/${row.id}` would DELETE /admin/inventory/undefined.
    const row = { colourway_id: 41, sku: 'PF-ATL-01' }
    expect(row.id).toBeUndefined()
    expect(stockDeletePath(row)).toBe('/admin/inventory/41')
  })
})

describe('describeStockRow', () => {
  it('names the SKU and the colour it belongs to', () => {
    expect(describeStockRow({ sku: 'PF-ATL-01', colourway_name: 'Jade' })).toBe('PF-ATL-01 (Jade)')
    expect(describeStockRow({ sku: 'PF-ATL-01' })).toBe('PF-ATL-01')
  })

  it('returns undefined without a SKU, so the kit says "That stock row"', () => {
    expect(describeStockRow({})).toBeUndefined()
    expect(describeStockRow()).toBeUndefined()
    expect(describeStockRow({ sku: '   ' })).toBeUndefined()
  })
})

describe('describeRate', () => {
  it('names the supplier, because a code is unique only within one', () => {
    expect(describeRate({ supplier: 'Pierre Frey', code: 'F3518-003' })).toBe(
      'Pierre Frey F3518-003'
    )
  })

  it('tells two suppliers’ rows with the same code apart', () => {
    // (supplier, category, code) is the identity key — the reason `supplier` is
    // create-only — and this list spans every supplier at once, so "Delete
    // “F3518-003”?" is a question forty of them can answer.
    const frey = { supplier: 'Pierre Frey', code: 'F3518-003' }
    const zimmer = { supplier: 'Zimmer + Rohde', code: 'F3518-003' }
    expect(frey.code).toBe(zimmer.code)
    expect(describeRate(frey)).not.toBe(describeRate(zimmer))
  })

  it('returns undefined without a code', () => {
    expect(describeRate({ supplier: 'Pierre Frey' })).toBeUndefined()
    expect(describeRate()).toBeUndefined()
  })
})

describe('describeAccount', () => {
  it('names the email rather than the display name', () => {
    // `name` is nullable and freely duplicated; the address is what the person
    // signs in with and is unique by constraint.
    expect(describeAccount({ name: 'Priya', email: 'priya@example.com' })).toBe(
      'priya@example.com'
    )
    expect(describeAccount({ name: 'Priya' })).toBeUndefined()
    expect(describeAccount()).toBeUndefined()
  })
})

describe('needsStockRow', () => {
  it('spots the colourway that cannot sell', () => {
    // GET /admin/colourways LEFT JOINs inventory, so a colourway whose stock row
    // was deleted comes back with inventory: null — and is absent from Manage
    // stock entirely, which is why the restock panel reads this endpoint.
    expect(needsStockRow({ sku: 'PF-ATL-01', inventory: null })).toBe(true)
    expect(needsStockRow({ sku: 'PF-ATL-01' })).toBe(true)
    expect(
      needsStockRow({ sku: 'PF-ATL-01', inventory: { qty_available: 0, qty_reserved: 0, unit: 'metres' } })
    ).toBe(false)
  })

  it('treats a zero-quantity row as stocked, because it exists', () => {
    // A row at 0 is a colourway that can be restocked; no row at all is one that
    // cannot be sold or reserved until a row is created.
    expect(needsStockRow({ inventory: { qty_available: 0, qty_reserved: 0 } })).toBe(false)
  })
})

describe('withDeleteCaveat', () => {
  const ask = { open: true, title: 'Delete “Pierre Frey F3518-003”?', body: 'permanent', confirmLabel: 'Delete' }
  const refused = { open: true, title: 'cannot be deleted', body: 'the API sentence', confirmLabel: null }

  it('replaces the ask copy, because the kit calls every delete permanent', () => {
    expect(withDeleteCaveat(ask, RATE_DELETE_CAVEAT).body).toBe(RATE_DELETE_CAVEAT)
    expect(withDeleteCaveat(ask, RATE_DELETE_CAVEAT).confirmLabel).toBe('Delete')
    expect(RATE_DELETE_CAVEAT).toMatch(/import:pricing/)
  })

  it('leaves a refusal alone — its body is the API explaining itself', () => {
    expect(withDeleteCaveat(refused, RATE_DELETE_CAVEAT)).toBe(refused)
  })

  it('does not mutate the dialog it was given', () => {
    withDeleteCaveat(ask, RATE_DELETE_CAVEAT)
    expect(ask.body).toBe('permanent')
  })
})

// With no jsdom a source scan is the only test a .jsx can have here — the idiom
// src/admin/useCrudScreen.test.js uses on the kit itself.
const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

const DELETE_SCREENS = Object.freeze([
  'AdminStock.jsx',
  'AdminPriceListItems.jsx',
  'ClientAccounts.jsx',
  'UserManagement.jsx',
])

const KIT_SCREENS = Object.freeze([...DELETE_SCREENS, 'AdminOrders.jsx'])

describe('the four screens compose the kit', () => {
  it.each(KIT_SCREENS)('%s uses useCrudScreen and the shared Pagination', (name) => {
    const source = read(name)
    expect(source).toContain('useCrudScreen')
    expect(source).toContain('<Pagination')
    expect(source).toContain("from '../admin/Pagination.jsx'")
  })

  it.each(DELETE_SCREENS)('%s opens the shared dialog and owns no part of the flow', (name) => {
    const source = read(name)
    expect(source).toContain('remove.ask')
    expect(source).toContain('<ConfirmDialog')
    expect(source).not.toContain('apiDelete')
    expect(source).not.toContain('attemptDelete')
    expect(source).not.toContain('describeBlockers')
    expect(source).not.toContain('deleteDialog')
    expect(source).not.toContain('role="dialog"')
  })

  it.each(KIT_SCREENS)('%s keeps no list state of its own', (name) => {
    // The whole point of the conversion: the hand-rolled fetch, its
    // status/loadError pair and its useToast all come from the kit now.
    const source = read(name)
    expect(source).not.toContain('useToast')
    expect(source).not.toContain('loadError')
    expect(source).not.toContain("useState('loading')")
  })
})

describe('an order offers archive and nothing more permanent', () => {
  const source = read('AdminOrders.jsx')

  it('opens no delete flow', () => {
    // `remove.ask` is the only way into the kit's delete, so its absence is the
    // criterion stated as a token rather than as the English word — the file's
    // own header explains at length why there is no delete here.
    expect(source).not.toContain('remove.ask')
    expect(source).not.toContain('<ConfirmDialog')
  })

  it('renders no Delete control', () => {
    expect(source).not.toMatch(/>\s*Delete\s*</)
  })

  it('still archives and restores', () => {
    expect(source).toContain('/archive')
    expect(source).toContain('restore')
  })
})

describe('archive escapes match the entity', () => {
  it('offers "Archive instead" wherever the entity has an archive', () => {
    // useCrudScreen shows the button only when the API says `archivable` AND the
    // screen supplied the action, so an archivable entity whose screen forgets
    // the option renders a Cancel-only 409 with nothing to say why.
    for (const name of ['AdminPriceListItems.jsx', 'ClientAccounts.jsx', 'UserManagement.jsx']) {
      expect(read(name)).toContain('/archive')
    }
  })

  it('offers none on stock, which has no archived_at column', () => {
    // The API's refusal says archivable: false, so the Cancel-only dialog is
    // correct here. Scanned as the path fragment, never the word: the file's own
    // prose explains the absence.
    const source = read('AdminStock.jsx')
    expect(source).not.toContain('/archive')
    expect(source).toContain('stockDeletePath')
  })
})

// "The five copy-pasted paginators are gone — grep proves it."
describe('no screen carries its own paginator', () => {
  const SCREENS_THAT_HAD_ONE = Object.freeze([
    'AdminPriceListItems.jsx',
    'ClientsList.jsx',
    'PriceLists.jsx',
    'Reserves.jsx',
    'SalesOrdersList.jsx',
  ])

  it.each(SCREENS_THAT_HAD_ONE)('%s uses the shared Pagination instead', (name) => {
    const source = read(name)
    expect(source).toContain('<Pagination')
    // The three tells of the copied block: its own page arithmetic, and the
    // Previous/Next pair it drew by hand.
    expect(source).not.toContain('Math.ceil(')
    expect(source).not.toContain('Previous')
    expect(source).not.toMatch(/>\s*Next\s*</)
  })
})
