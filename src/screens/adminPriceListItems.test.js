import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { bodyFrom } from '../admin/drafts.js'
import {
  CURRENCIES,
  FREIGHT_CLASSES,
  IDENTITY_FIELDS,
  ITEM_FIELDS,
  NEW_ITEM,
  NEW_RATE_ROUTE,
  PRICE_LIST_ITEMS_PATH,
  RATES_ROUTE,
  UNITS,
  priceListItemPath,
  rateListReturn,
  rateRoute,
  rateSearchFromParams,
  rateSearchParams,
  ratesListRoute,
  rateCurrencyFor,
  rateRangeOptions,
  rateSupplierOptions,
} from './adminPriceListItems.js'

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const LIST_SOURCE = read('AdminPriceListItems.jsx')
const PAGE_SOURCE = read('AdminPriceListItem.jsx')
const NEW_SOURCE = read('AdminPriceListItemNew.jsx')
const FIELDS_SOURCE = read('RateFields.jsx')
const APP_SOURCE = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

describe('addresses', () => {
  it('builds the API paths from one base', () => {
    expect(PRICE_LIST_ITEMS_PATH).toBe('/admin/price-list-items')
    expect(priceListItemPath(12)).toBe('/admin/price-list-items/12')
  })

  it('opens a rate, and the hand-keying form, under the list route', () => {
    // A link is not a fetch: the CRM's page and the API's row are different
    // addresses, and moving one must never retarget the other.
    expect(RATES_ROUTE).toBe('/admin/price-lists')
    expect(rateRoute(12)).toBe('/admin/price-lists/12')
    expect(NEW_RATE_ROUTE).toBe('/admin/price-lists/new')
    expect(rateRoute(12)).not.toBe(priceListItemPath(12))
  })

  it('never collides with the Dynamics parameters reference', () => {
    // /price-lists/parameters is another screen entirely, outside /admin.
    expect(rateRoute(12).startsWith('/price-lists')).toBe(false)
    expect(NEW_RATE_ROUTE.startsWith('/price-lists')).toBe(false)
  })

  it('routes both pages in the app, beside the list', () => {
    expect(APP_SOURCE).toContain('path="/admin/price-lists"')
    expect(APP_SOURCE).toContain('path="/admin/price-lists/new" element={<AdminPriceListItemNew />}')
    expect(APP_SOURCE).toContain('path="/admin/price-lists/:id" element={<AdminPriceListItem />}')
  })
})

// The list's search lives in the URL because the office now leaves the list to
// edit a rate and comes back; held in state it died on the way out.
describe('the search in the URL', () => {
  it('reads the three boxes, blank when absent', () => {
    expect(rateSearchFromParams(new URLSearchParams('q=linen&supplier=Pierre+Frey&category=fabric'))).toEqual({
      q: 'linen',
      supplier: 'Pierre Frey',
      category: 'fabric',
    })
    expect(rateSearchFromParams(new URLSearchParams(''))).toEqual({ q: '', supplier: '', category: '' })
    expect(rateSearchFromParams(null)).toEqual({ q: '', supplier: '', category: '' })
  })

  it('keeps a value as typed, so the supplier box can take a space mid-name', () => {
    // The box is bound straight to the URL and filters as it is typed; a trim
    // on either side would eat the space before "Frey" arrived.
    const typed = rateSearchParams({ supplier: 'Pierre ' })
    expect(typed).toEqual({ supplier: 'Pierre ' })
    expect(rateSearchFromParams(new URLSearchParams(typed)).supplier).toBe('Pierre ')
  })

  it('drops a blank rather than writing an empty parameter', () => {
    expect(rateSearchParams({ q: '', supplier: '   ', category: '' })).toEqual({})
    expect(rateSearchParams()).toEqual({})
    // Only the three boxes that find a rate travel; nothing else rides along.
    expect(rateSearchParams({ q: 'x', flag: 'suspect', page: 3 })).toEqual({ q: 'x' })
  })

  it('names the list as it stands, bare when nothing is searched', () => {
    expect(ratesListRoute({})).toBe('/admin/price-lists')
    expect(ratesListRoute({ q: 'linen', supplier: 'Pierre Frey' })).toBe(
      '/admin/price-lists?q=linen&supplier=Pierre+Frey'
    )
  })
})

describe('rateListReturn', () => {
  it('goes back to the list as it was left', () => {
    const list = '/admin/price-lists?q=linen&category=fabric'
    expect(rateListReturn({ list })).toBe(list)
    expect(rateListReturn({ list: '/admin/price-lists' })).toBe('/admin/price-lists')
  })

  it('falls back to the bare list after a deep link or a refresh', () => {
    expect(rateListReturn(null)).toBe('/admin/price-lists')
    expect(rateListReturn(undefined)).toBe('/admin/price-lists')
    expect(rateListReturn({})).toBe('/admin/price-lists')
    expect(rateListReturn({ list: 42 })).toBe('/admin/price-lists')
  })

  it('refuses to be aimed anywhere but the rates list', () => {
    expect(rateListReturn({ list: '/users' })).toBe('/admin/price-lists')
    expect(rateListReturn({ list: 'https://example.com/admin/price-lists' })).toBe('/admin/price-lists')
    // A prefix is not the list: neither a sibling path nor another rate.
    expect(rateListReturn({ list: '/admin/price-lists-old' })).toBe('/admin/price-lists')
    expect(rateListReturn({ list: '/admin/price-lists/42' })).toBe('/admin/price-lists')
  })
})

describe('the one declaration both pages draw', () => {
  it('keeps the supplier out of the editable list — it is create-only', () => {
    // Part of the identity key (supplier, category, code): the PATCH schema
    // omits it, so a declaration that named it would send a key Ajv strips.
    expect(IDENTITY_FIELDS.map((field) => field.key)).toEqual(['supplier'])
    expect(ITEM_FIELDS.map((field) => field.key)).not.toContain('supplier')
  })

  it('never offers the server-derived columns as inputs', () => {
    const keys = ITEM_FIELDS.map((field) => field.key)
    expect(keys).not.toContain('code_normalized')
    expect(keys).not.toContain('source_file')
  })

  it('starts the hand-keying draft on every declared key and nothing else', () => {
    const declared = [...IDENTITY_FIELDS, ...ITEM_FIELDS].map((field) => field.key).sort()
    expect(Object.keys(NEW_ITEM).sort()).toEqual(declared)
  })

  it('mirrors the API enums, with NZD absent on purpose', () => {
    expect(UNITS).toEqual(['metre', 'yard', 'roll', 'piece', 'hide', 'panel'])
    expect(CURRENCIES).toEqual(['EUR', 'USD', 'GBP'])
    expect(CURRENCIES).not.toContain('NZD')
    expect(FREIGHT_CLASSES).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('refuses a blank create before it is sent', () => {
    // The starting draft names no supplier and no code; both are required on
    // the POST schema.
    expect(bodyFrom(NEW_ITEM, IDENTITY_FIELDS).error).toMatch(/Supplier/)
    expect(bodyFrom({ ...NEW_ITEM, wholesale_rate: '48' }, ITEM_FIELDS).error).toMatch(/Code/)
  })
})

// There is no jsdom here, so the screens are held to the move by reading them.
describe('the list is the list', () => {
  it('holds no editor and no create form any more', () => {
    expect(LIST_SOURCE).not.toContain('openId')
    expect(LIST_SOURCE).not.toContain('diffFields')
    expect(LIST_SOURCE).not.toContain('bodyFrom')
    expect(LIST_SOURCE).not.toContain('<RateFields')
    expect(LIST_SOURCE).not.toContain("'PATCH'")
  })

  it('opens a rate on its page and keys a new one on its own', () => {
    expect(LIST_SOURCE).toContain('to={rateRoute(item.id)}')
    expect(LIST_SOURCE).toContain('<GhostButton>Open</GhostButton>')
    expect(LIST_SOURCE).toContain('to={NEW_RATE_ROUTE}')
  })

  it('keeps the lifecycle verbs and the drop-detection mark on the row and the list', () => {
    expect(LIST_SOURCE).toContain('archiveItem(item)')
    expect(LIST_SOURCE).toContain('crud.remove.ask(item)')
    expect(LIST_SOURCE).toContain('/mark-discontinued')
  })

  it('reads and writes its search through the URL', () => {
    expect(LIST_SOURCE).toContain('useSearchParams')
    expect(LIST_SOURCE).toContain('rateSearchFromParams(searchParams)')
    expect(LIST_SOURCE).toContain('{ replace: true }')
    // The page is handed the list as it stood, so its Back link returns to it.
    expect(LIST_SOURCE).toContain('state={here}')
  })
})

describe("one rate's page", () => {
  it('reads the rate by id and treats a 404 as not found', () => {
    expect(PAGE_SOURCE).toContain('apiFetch(priceListItemPath(id))')
    expect(PAGE_SOURCE).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(PAGE_SOURCE).toContain('<NotFound')
  })

  it('keeps the StrictMode guard on every load effect', () => {
    // Two loads: the rate, and its history.
    expect(PAGE_SOURCE.match(/let active = true/g)).toHaveLength(2)
  })

  it('re-reads the rate after a save, and the history follows the re-read', () => {
    expect(PAGE_SOURCE).toContain('useMutation({ reload: load, flash })')
    expect(PAGE_SOURCE).toMatch(/\}, \[item\]\)/)
  })

  it('carries the change reason beside a moved rate', () => {
    expect(PAGE_SOURCE).toContain('withReason(diff.patch, reason, RATE_PRICE_KEYS)')
  })

  it('shows the finance refusal as a note, not an error', () => {
    expect(PAGE_SOURCE).toContain("isDenied(err) ? 'denied' : 'error'")
  })

  it('returns to the list it came from', () => {
    expect(PAGE_SOURCE).toContain('rateListReturn(useLocation().state)')
  })

  it('leaves archive, restore and delete on the list', () => {
    expect(PAGE_SOURCE).not.toContain('/archive')
    expect(PAGE_SOURCE).not.toContain('remove.ask')
  })
})

describe('the hand-keying page', () => {
  it('posts the whole declaration and lands on the new rate', () => {
    expect(NEW_SOURCE).toContain("apiSend('POST', PRICE_LIST_ITEMS_PATH, { ...rest.body, ...identity.body })")
    expect(NEW_SOURCE).toContain('navigate(rateRoute(created.id), { replace: true')
  })

  it('goes back to the list, never to a record', () => {
    expect(NEW_SOURCE).toContain('rateListReturn(location.state)')
  })
})

describe('one form, two pages', () => {
  it('is the same component on both, so the two cannot drift', () => {
    expect(PAGE_SOURCE).toContain('<RateFields')
    expect(NEW_SOURCE).toContain('<RateFields')
    // The edit passes the record (the read-only identity) and the lock; the
    // create passes neither.
    expect(PAGE_SOURCE).toContain('record={item}')
    expect(PAGE_SOURCE).toContain('locked={locked}')
    expect(NEW_SOURCE).not.toContain('record=')
    expect(NEW_SOURCE).not.toContain('locked=')
  })

  it('draws the supplier read-only once there is a record', () => {
    expect(FIELDS_SOURCE).toContain('value={record.supplier} readOnly disabled')
    expect(FIELDS_SOURCE).toContain("onChange={onChange('supplier')}")
  })
})

describe('the new-rate pickers', () => {
  it('offers live suppliers alphabetically, with their currency', () => {
    expect(
      rateSupplierOptions([
        { id: 2, name: 'Pierre Frey', currency: 'EUR' },
        { id: 3, name: 'Boussac', archived_at: '2026-09-24' },
        { id: 1, name: 'Fabricut', currency: 'USD' },
      ])
    ).toEqual([
      { id: 1, name: 'Fabricut', currency: 'USD' },
      { id: 2, name: 'Pierre Frey', currency: 'EUR' },
    ])
  })

  it('offers the supplier’s live houses as product ranges', () => {
    expect(
      rateRangeOptions({
        brands: [
          { name: 'Pierre Frey' },
          { name: 'Boussac' },
          { name: 'Thorp of London', archived_at: '2026-01-01' },
        ],
      })
    ).toEqual(['Boussac', 'Pierre Frey'])
    expect(rateRangeOptions(null)).toEqual([])
  })

  it('takes the supplier’s currency only when a rate may carry it', () => {
    expect(rateCurrencyFor('USD', 'EUR')).toBe('USD')
    expect(rateCurrencyFor('NZD', 'EUR')).toBe('EUR')
    expect(rateCurrencyFor(null, 'GBP')).toBe('GBP')
  })
})
