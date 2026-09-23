import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery, pageCount } from '../admin/list.js'
import {
  BRANDS_ROUTE,
  BRAND_EDIT_FIELDS,
  BRAND_FIELDS,
  CATALOGUE_LIST_LIMIT,
  COLLECTIONS_ROUTE,
  COLLECTION_CREATE_ONLY_FIELDS,
  COLLECTION_FIELDS,
  NEW_BRAND,
  NEW_BRAND_ROUTE,
  NEW_COLLECTION,
  NEW_PRODUCT,
  NEW_PRODUCT_ROUTE,
  PRODUCTS_ROUTE,
  PRODUCT_CREATE_ONLY_FIELDS,
  PRODUCT_FIELDS,
  PRODUCT_LIST_LIMIT,
  SIZE_LIST_ID,
  SIZE_SOURCE_LIMIT,
  SPEC_FIELDS,
  SUPPLIER_ROSTER_PATH,
  archiveInsteadPath,
  archiveTogglePath,
  brandListFilters,
  brandMeta,
  brandRoute,
  collectionListFilters,
  collectionRoute,
  collectionsPath,
  describeCollection,
  newCollectionRoute,
  openedProductRoute,
  productListFilters,
  productRoute,
  sizeSourcePath,
  sizesInUse,
  supplierOptions,
  supplierPicker,
  typeLabel,
} from './adminCatalogue.js'

// The filters are asserted through buildListQuery rather than as bare objects:
// what has to be right is the query string that reaches the API, and the empty
// string is dropped there, not here.

describe('brandListFilters', () => {
  it('sends nothing at all while archived rows are hidden', () => {
    expect(buildListQuery(brandListFilters(false))).toBe('')
    expect(buildListQuery(brandListFilters())).toBe('')
  })

  it('asks for archived rows only when the toggle is on', () => {
    expect(buildListQuery(brandListFilters(true))).toBe('include_archived=true')
  })
})

describe('productListFilters', () => {
  it('drops the house filter when it is the select’s "All" value', () => {
    // '' would serialise to `brand_id=`, which the endpoint's integer schema
    // answers with a 400 — the whole list gone, not one filter.
    expect(buildListQuery(productListFilters('', false))).toBe('')
    expect(buildListQuery(productListFilters())).toBe('')
  })

  it('forwards a chosen house, string or number', () => {
    expect(buildListQuery(productListFilters('7'))).toBe('brand_id=7')
    expect(buildListQuery(productListFilters(7))).toBe('brand_id=7')
  })

  it('carries both filters together', () => {
    expect(buildListQuery(productListFilters('7', true))).toBe(
      'brand_id=7&include_archived=true'
    )
  })

  // The list pages now, so search, category and price band go to the API
  // rather than narrowing the page on screen — a match on page 3 must be found.
  it('forwards search, category and price band, dropping the unset ones', () => {
    expect(buildListQuery(productListFilters('', false, { q: ' atlas ', category: '', priceBand: '' }))).toBe(
      'q=atlas'
    )
    expect(buildListQuery(productListFilters('7', false, { category: 'fabric' }))).toBe(
      'brand_id=7&category=fabric'
    )
    expect(buildListQuery(productListFilters('', false, { priceBand: '201-300' }))).toBe(
      'price_min_cents=20001&price_max_cents=30000'
    )
    expect(buildListQuery(productListFilters('', false, { priceBand: 'none' }))).toBe('unpriced=true')
  })
})

describe('PRODUCT_LIST_LIMIT', () => {
  it('pages the product list inside the endpoint MAX_LIMIT of 200', () => {
    expect(PRODUCT_LIST_LIMIT).toBeLessThanOrEqual(200)
    expect(pageCount(900, PRODUCT_LIST_LIMIT)).toBeGreaterThan(1)
  })
})

describe('collectionListFilters', () => {
  it('drops the house filter when it is the select’s "All" value', () => {
    expect(buildListQuery(collectionListFilters('', false))).toBe('')
    expect(buildListQuery(collectionListFilters())).toBe('')
  })

  it('forwards a chosen house, string or number', () => {
    // The string case is the one that matters: this screen reads its house out
    // of the URL (?brand_id=7), so it is always a string in practice.
    expect(buildListQuery(collectionListFilters('7'))).toBe('brand_id=7')
    expect(buildListQuery(collectionListFilters(7))).toBe('brand_id=7')
  })

  it('carries both filters together', () => {
    expect(buildListQuery(collectionListFilters('7', true))).toBe(
      'brand_id=7&include_archived=true'
    )
  })
})

describe('collectionsPath', () => {
  it('links a house row through to its own collections', () => {
    // The house is in the URL rather than in screen state, so the link works
    // when AdminCollections is already mounted and the back button undoes it.
    expect(collectionsPath({ id: 12 })).toBe('/admin/collections?brand_id=12')
    expect(collectionsPath({ id: '12' })).toBe('/admin/collections?brand_id=12')
  })
})

describe('describeCollection', () => {
  it('names the house alongside the collection', () => {
    expect(describeCollection({ name: 'Cappuccino', brand_name: 'Pierre Frey' })).toBe(
      'Cappuccino (Pierre Frey)'
    )
  })

  it('tells two same-named collections apart', () => {
    // A collection slug is unique per house, never globally, and the seed strips
    // the house prefix off the vendored titles — so a catalogue-wide list really
    // does show several "Cappuccino"s. "Delete “Cappuccino”?" would be a question
    // three houses can answer.
    const one = { id: 1, name: 'Cappuccino', slug: 'cappuccino', brand_name: 'Pierre Frey' }
    const two = { id: 2, name: 'Cappuccino', slug: 'cappuccino', brand_name: 'Casamance' }
    expect(one.slug).toBe(two.slug)
    expect(describeCollection(one)).not.toBe(describeCollection(two))
  })

  it('falls back to the bare name when no house came with the row', () => {
    expect(describeCollection({ name: 'Cappuccino' })).toBe('Cappuccino')
    expect(describeCollection({ name: 'Cappuccino', brand_name: '  ' })).toBe('Cappuccino')
  })

  it('returns undefined for a nameless row, so the kit says "That collection"', () => {
    expect(describeCollection({})).toBeUndefined()
    expect(describeCollection()).toBeUndefined()
    expect(describeCollection({ name: '   ' })).toBeUndefined()
  })
})

describe('sizesInUse', () => {
  const rows = [
    { size: 'Queen' },
    { size: '  Queen  ' },
    { size: 'King' },
    { size: '' },
    { size: null },
    {},
    { size: 42 },
  ]

  it('offers each size once, trimmed and sorted', () => {
    expect(sizesInUse(rows)).toEqual(['King', 'Queen'])
  })

  it('answers an empty list before the products have loaded', () => {
    expect(sizesInUse([])).toEqual([])
    expect(sizesInUse(undefined)).toEqual([])
  })

  // The box is free text over these suggestions, not a select: a size nobody
  // has typed yet has to be typeable, or a new one could never come to exist.
  it('is a suggestion list, so an unused size is simply absent', () => {
    expect(sizesInUse(rows)).not.toContain('Bath sheet')
  })
})

describe('CATALOGUE_LIST_LIMIT', () => {
  it('keeps an unpaged answer at one page', () => {
    // Brands and collections return every row and declare no `page` param, so
    // a second page could never be fetched. The kit's default 25 would report
    // 2 pages over the 41 seeded houses.
    expect(pageCount(41, CATALOGUE_LIST_LIMIT)).toBe(1)
    expect(pageCount(900, CATALOGUE_LIST_LIMIT)).toBe(1)
    expect(pageCount(41, 25)).toBe(2)
  })
})

describe('archive paths', () => {
  const live = { id: 12, archived_at: null }
  const archived = { id: 12, archived_at: '2026-08-01T00:00:00.000Z' }

  it('toggles for the row button, which is reversible', () => {
    expect(archiveTogglePath('/admin/brands', live)).toBe('/admin/brands/12/archive')
    expect(archiveTogglePath('/admin/brands', archived)).toBe('/admin/brands/12/restore')
  })

  it('always archives behind "Archive instead", never restores', () => {
    // That button is offered on a REFUSED delete. Restoring an already-archived
    // row would answer the refusal by putting the row back on the website.
    expect(archiveInsteadPath('/admin/products', live)).toBe('/admin/products/12/archive')
    expect(archiveInsteadPath('/admin/products', archived)).toBe('/admin/products/12/archive')
  })
})

// "Both screens use useCrudScreen; no bespoke dialog or pagination is added" is
// an acceptance criterion, and with no jsdom a source scan is the only way to
// hold it. Same idiom as src/admin/useCrudScreen.test.js.
const sourceOf = (file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')

describe('the three catalogue screens', () => {
  const screens = [
    ['AdminBrands.jsx', sourceOf('AdminBrands.jsx')],
    ['AdminCollections.jsx', sourceOf('AdminCollections.jsx')],
    ['AdminProducts.jsx', sourceOf('AdminProducts.jsx')],
  ]

  for (const [name, source] of screens) {
    it(`${name} deletes through the kit`, () => {
      expect(source).toContain('useCrudScreen')
      expect(source).toContain('ConfirmDialog')
      expect(source).toContain('remove.ask')
      // The screen supplies an archive action, or the 409 dialog cannot offer
      // "Archive instead" (useCrudScreen reads `archive !== null`).
      expect(source).toContain('archiveInsteadPath')
    })

    it(`${name} owns no part of the delete flow itself`, () => {
      // Every one of these belongs to the kit. A screen reaching for them is a
      // second copy of a flow whose whole point is being shared.
      expect(source).not.toContain('apiDelete')
      expect(source).not.toContain('attemptDelete')
      expect(source).not.toContain('describeBlockers')
      expect(source).not.toContain('deleteDialog')
      expect(source).not.toContain('role="dialog"')
    })

    it(`${name} hand-rolls no paginator`, () => {
      // A Previous/Next pair here would be the sixth copy of the thing the kit
      // exists to delete. Products pages through the shared <Pagination />;
      // brands and collections have no paged endpoint to drive one.
      expect(source).not.toMatch(/Previous/)
      if (name === 'AdminProducts.jsx') {
        expect(source).toContain('<Pagination')
        expect(source).toContain("from '../admin/Pagination.jsx'")
      } else {
        expect(source).not.toContain('Pagination')
      }
    })
  }
})

// US-010's structural criteria. The move is the story, so what has to be proved
// is where the collections panel now lives — and, just as much, where it does not.
describe('collections moved out of AdminBrands', () => {
  const brands = sourceOf('AdminBrands.jsx')
  // Since 23 Sep 2026 the Collections screen is a list plus a page per
  // collection and a create page, sharing one form — so what moved out of
  // AdminBrands is held against the four files together.
  const collections = [
    'AdminCollections.jsx',
    'AdminCollection.jsx',
    'AdminCollectionNew.jsx',
    'CollectionFields.jsx',
  ]
    .map(sourceOf)
    .join('\n')

  it('takes COLLECTION_FIELDS with it', () => {
    expect(collections).toContain('COLLECTION_FIELDS')
    expect(brands).not.toContain('COLLECTION_FIELDS')
  })

  it('leaves AdminBrands with no collection CRUD', () => {
    // The claim used to be "not one collection endpoint is called from the
    // houses screen", and the assertion below passed for the wrong reason
    // after W7: the featured panel DOES read /admin/collections and write
    // /admin/collections/featured — the path literals just live in
    // featuredOrder.js, out of this source scan's sight. The invariant that
    // actually survives (and featuredOrder.test.js asserts from its side) is
    // narrower: this screen holds no collection CRUD — no create, no edit, no
    // delete, no second list's drafts. Ordering a storefront strip is not
    // managing collections.
    expect(brands).not.toContain("'/admin/collections'")
    expect(brands).not.toContain('collectionDrafts')
    // With one list left, the kit's own mutation cycle serves it — a screen
    // calls useMutation itself only to drive a SECOND list's reload.
    expect(brands).toContain('crud.mutation')
  })

  it('links each house row through to its collections', () => {
    expect(brands).toContain('collectionsPath')
  })

  it('never assumes a collection slug is unique across houses', () => {
    // Rows are keyed and addressed by id; the house is a column on every row and
    // part of every name shown to a person.
    expect(collections).toContain('key={collection.id}')
    expect(collections).not.toContain('key={collection.slug}')
    expect(collections).toContain('describeCollection')
    expect(collections).toContain('brand_name')
  })

  it('does not offer to move a collection between houses', () => {
    // PATCH /admin/collections/:id takes name/description/image_url only — the
    // house is create-only, so the editor renders it read-only.
    expect(collections).toContain('CREATE_ONLY_FIELDS')
    expect(collections).toContain('readOnlyInput')
  })
})

// The Houses screen's supplier picker. The link it writes is what makes a
// purchase order for a house addressable, so the one thing it must never do is
// quietly offer "no supplier" for a house that has one.
describe('supplierOptions', () => {
  const suppliers = [
    { id: 1, name: 'Pierre Frey' },
    { id: 2, name: 'Rubelli Venezia' },
  ]

  it('offers the live roster for an unlinked house', () => {
    expect(supplierOptions(suppliers, { supplier_id: null })).toEqual(suppliers)
  })

  it('offers the roster unchanged when the house is on one of them', () => {
    expect(supplierOptions(suppliers, { supplier_id: 2, supplier_name: 'Rubelli Venezia' })).toEqual(
      suppliers
    )
  })

  // An archived supplier is absent from the roster and still invoices its
  // houses — brands.supplier_id is RESTRICT. A select with no matching option
  // renders blank, which reads as "no supplier" and unlinks the house on the
  // next save.
  it('keeps a house on an archived supplier by carrying it as an option', () => {
    const options = supplierOptions(suppliers, { supplier_id: 9, supplier_name: 'Larsen' })
    expect(options).toHaveLength(3)
    expect(options[2]).toEqual({ id: 9, name: 'Larsen (archived)' })
  })

  it('still carries the id when the list read gave no name', () => {
    expect(supplierOptions(suppliers, { supplier_id: 9 })[2]).toEqual({ id: 9, name: 'Supplier 9' })
  })
})

// --- one design on its own page (23 Sep 2026) --------------------------------

describe('product routes', () => {
  it('puts one design, and a new one, each on its own page', () => {
    expect(PRODUCTS_ROUTE).toBe('/admin/products')
    expect(NEW_PRODUCT_ROUTE).toBe('/admin/products/new')
    expect(productRoute(12)).toBe('/admin/products/12')
  })

  // The list used to open a design in place from `?open=<id>` — the order
  // page's SKU link wrote it, and staff have it bookmarked.
  it('sends an old ?open=<id> link to that design’s page', () => {
    expect(openedProductRoute('12')).toBe('/admin/products/12')
    expect(openedProductRoute(' 12 ')).toBe('/admin/products/12')
  })

  it('leaves the list alone for anything that is not an id', () => {
    // /admin/products/abc is the API's 400 — a worse answer than the list.
    expect(openedProductRoute(null)).toBeNull()
    expect(openedProductRoute('')).toBeNull()
    expect(openedProductRoute('abc')).toBeNull()
    expect(openedProductRoute('12; drop')).toBeNull()
    expect(openedProductRoute('-3')).toBeNull()
  })
})

describe('sizeSourcePath', () => {
  it('reads the house’s own designs at the endpoint’s ceiling', () => {
    expect(sizeSourcePath(7)).toBe(`/admin/products?brand_id=7&limit=${SIZE_SOURCE_LIMIT}`)
    expect(sizeSourcePath('7')).toBe('/admin/products?brand_id=7&limit=200')
    // A larger limit is a 400 there, not a bigger page.
    expect(SIZE_SOURCE_LIMIT).toBeLessThanOrEqual(200)
  })

  it('reads nothing until a house is known', () => {
    // The create page has no house until one is chosen; '' would otherwise
    // go up as brand_id= and 400 the read.
    expect(sizeSourcePath('')).toBeNull()
    expect(sizeSourcePath(null)).toBeNull()
    expect(sizeSourcePath(undefined)).toBeNull()
  })
})

describe('the product declarations', () => {
  const keysOf = (fields) => fields.map((field) => field.key)

  it('starts a new product with a value for every field the create body reads', () => {
    // bodyFrom walks both lists; a key missing from the draft would go up as
    // null rather than as what the form showed.
    for (const key of [...keysOf(PRODUCT_CREATE_ONLY_FIELDS), ...keysOf(PRODUCT_FIELDS)]) {
      expect(NEW_PRODUCT).toHaveProperty(key)
    }
  })

  it('never lets a create-only column into the PATCH list', () => {
    // brand_id is in the slug and product_type decided the stock unit.
    expect(keysOf(PRODUCT_FIELDS)).not.toContain('brand_id')
    expect(keysOf(PRODUCT_FIELDS)).not.toContain('product_type')
  })

  it('hangs the size box off the one datalist, and the description off a textarea', () => {
    expect(SPEC_FIELDS.find((field) => field.key === 'size').list).toBe(SIZE_LIST_ID)
    expect(SPEC_FIELDS.find((field) => field.key === 'description').multiline).toBe(true)
  })

  it('labels a product type, and falls back to the raw value', () => {
    expect(typeLabel('fabric')).toBe('Fabric')
    expect(typeLabel('finished_good')).toBe('Finished good')
    expect(typeLabel('rug')).toBe('rug')
  })
})

// With no jsdom, where the code LIVES is what can be held — the same idiom as
// "the three catalogue screens" above.
describe('the product list and its two pages', () => {
  const list = sourceOf('AdminProducts.jsx')
  const page = sourceOf('AdminProduct.jsx')
  const create = sourceOf('AdminProductNew.jsx')
  const form = sourceOf('ProductFields.jsx')
  const count = (source, token) => source.split(token).length - 1

  it('leaves the list with no editor and no create form', () => {
    expect(list).not.toContain('openId')
    expect(list).not.toContain('aria-expanded')
    expect(list).not.toContain('<ProductFields')
    expect(list).not.toContain("'POST', '/admin/products'")
    // Each row and the "New product" button link out instead.
    expect(list).toContain('productRoute(product.id)')
    expect(list).toContain('NEW_PRODUCT_ROUTE')
  })

  it('redirects the list’s old ?open= link rather than dropping it', () => {
    expect(list).toContain("openedProductRoute(searchParams.get('open'))")
    expect(list).toContain('<Navigate to={opened} replace />')
  })

  it('keeps delete on the list, where the kit can reload what it deleted from', () => {
    // Matched as the CALL, not the word: the create page's comment says why it
    // has no useCrudScreen, the trap AdminShipping's first negative scan hit.
    for (const source of [page, create, form]) {
      expect(source).not.toContain('useCrudScreen(')
      expect(source).not.toContain('remove.ask')
      expect(source).not.toContain('apiDelete')
    }
  })

  it('reads the design by id and says so when it is gone', () => {
    expect(page).toContain('useParams')
    expect(page).toContain('`/admin/products/${id}`')
    expect(page).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(page).toContain('<NotFound')
  })

  it('draws create and edit through the one form', () => {
    expect(page).toContain('<ProductFields')
    expect(create).toContain('<ProductFields')
    // The spec boxes are rendered in one place only — a second rendering is
    // how the two forms began to drift before SpecInput existed.
    expect(count(form, 'SPEC_FIELDS.map')).toBe(1)
    for (const source of [list, page, create]) expect(source).not.toContain('SPEC_FIELDS')
  })

  it('renders the sizes datalist once per page, and never on the list', () => {
    expect(count(page, '<SizeList')).toBe(1)
    expect(count(create, '<SizeList')).toBe(1)
    expect(count(form, '<datalist id=')).toBe(1)
    expect(list).not.toContain('SizeList')
    expect(list).not.toContain('<datalist id=')
  })

  it('lands a created design on its own page, replacing the form in history', () => {
    expect(create).toContain('navigate(productRoute(created.id), { replace: true })')
  })

  it('keeps colourways inline on the design’s page', () => {
    expect(page).toContain('`/admin/products/${product.id}/colourways`')
    expect(page).toContain('`/admin/colourways/${colourway.id}`')
  })
})

// --- one house on its own page (23 Sep 2026) ---------------------------------

describe('house routes', () => {
  it('puts one house, and a new one, each on its own page', () => {
    expect(BRANDS_ROUTE).toBe('/admin/brands')
    expect(NEW_BRAND_ROUTE).toBe('/admin/brands/new')
    expect(brandRoute(5)).toBe('/admin/brands/5')
  })
})

// The by-id house read carries supplier_id but not the supplier_name the list
// read joins on, so the page reads the roster archive-inclusive and takes the
// name from there.
describe('supplierPicker', () => {
  const roster = [
    { id: 1, name: 'Pierre Frey Paris', archived_at: null },
    { id: 2, name: 'Colefax & Fowler', archived_at: '2026-09-01T00:00:00.000Z' },
    { id: 3, name: 'Rubelli Venezia', archived_at: null },
  ]

  it('reads the roster archive-inclusive, one page', () => {
    expect(SUPPLIER_ROSTER_PATH).toBe('/admin/suppliers?include_archived=true&limit=200')
  })

  it('offers only the live suppliers to an unlinked house', () => {
    expect(supplierPicker(roster, null)).toEqual([
      { id: 1, name: 'Pierre Frey Paris' },
      { id: 3, name: 'Rubelli Venezia' },
    ])
  })

  it('offers the live roster unchanged when the house is on a live supplier', () => {
    expect(supplierPicker(roster, 3).map((option) => option.id)).toEqual([1, 3])
  })

  // The case the name is needed for: a select with no matching option renders
  // blank, which reads as "no supplier" and unlinks the house on the next save.
  it('keeps a house on an archived supplier, by name', () => {
    expect(supplierPicker(roster, 2)).toEqual([
      { id: 1, name: 'Pierre Frey Paris' },
      { id: 3, name: 'Rubelli Venezia' },
      { id: 2, name: 'Colefax & Fowler (archived)' },
    ])
  })

  it('still carries the house’s supplier when the roster failed to load', () => {
    expect(supplierPicker([], 2)).toEqual([{ id: 2, name: 'Supplier 2' }])
    expect(supplierPicker(undefined, null)).toEqual([])
  })
})

describe('brandMeta', () => {
  it('says where a house is from and what the storefront does with it', () => {
    expect(brandMeta({ country: 'France', trade_only: true, is_international: true, bespoke: false })).toBe(
      'France · Trade only · Price hidden'
    )
    expect(brandMeta({ country: '', trade_only: false, is_international: false, bespoke: true })).toBe(
      'Public · Price shown · Bespoke'
    )
  })
})

describe('the house declarations', () => {
  const keysOf = (fields) => fields.map((field) => field.key)

  it('starts a new house with a value for every field the create body reads', () => {
    for (const key of keysOf(BRAND_FIELDS)) expect(NEW_BRAND).toHaveProperty(key)
  })

  it('starts a new house CLOSED, as the API does', () => {
    expect(NEW_BRAND.trade_only).toBe(true)
  })

  it('keeps the supplier out of the create body and in the edit list', () => {
    // POST /admin/brands strips supplier_id; a create control for it would
    // save nothing.
    expect(keysOf(BRAND_FIELDS)).not.toContain('supplier_id')
    expect(keysOf(BRAND_EDIT_FIELDS)).toEqual([...keysOf(BRAND_FIELDS), 'supplier_id'])
  })
})

describe('the houses list and its two pages', () => {
  const list = sourceOf('AdminBrands.jsx')
  const page = sourceOf('AdminBrand.jsx')
  const create = sourceOf('AdminBrandNew.jsx')
  const form = sourceOf('BrandFields.jsx')

  it('leaves the list with no editor and no create form', () => {
    expect(list).not.toContain('brandDraft')
    expect(list).not.toContain('aria-expanded')
    expect(list).not.toContain('<BrandFields')
    expect(list).not.toContain("'POST', '/admin/brands'")
    expect(list).toContain('brandRoute(brand.id)')
    expect(list).toContain('NEW_BRAND_ROUTE')
  })

  it('keeps the featured strips on the list, where they order the whole catalogue', () => {
    expect(list).toContain('Featured on the storefront')
    for (const source of [page, create, form]) expect(source).not.toContain('FeaturedList')
  })

  it('keeps delete on the list', () => {
    for (const source of [page, create, form]) {
      expect(source).not.toContain('useCrudScreen(')
      expect(source).not.toContain('remove.ask')
      expect(source).not.toContain('apiDelete')
    }
  })

  it('reads the house by id and says so when it is gone', () => {
    expect(page).toContain('useParams')
    expect(page).toContain('`/admin/brands/${id}`')
    expect(page).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(page).toContain('<NotFound')
  })

  it('sets the supplier on the record only, from the archive-inclusive roster', () => {
    expect(page).toContain('diffFields(brand, brandDraft, BRAND_EDIT_FIELDS)')
    expect(page).toContain('supplierPicker(suppliers, brand.supplier_id)')
    expect(page).toContain('SUPPLIER_ROSTER_PATH')
    expect(create).toContain('bodyFrom(newBrand, BRAND_FIELDS)')
    expect(create).not.toContain('supplierOptions')
    expect(create).not.toContain('BRAND_EDIT_FIELDS')
  })

  it('draws create and edit through the one form', () => {
    expect(page).toContain('<BrandFields')
    expect(create).toContain('<BrandFields')
    expect(form).toContain('Trade only — signed-out visitors')
    for (const source of [list, page, create]) expect(source).not.toContain('<CheckField')
  })

  it('lands a created house on its own page, replacing the form in history', () => {
    expect(create).toContain('navigate(brandRoute(created.id), { replace: true })')
  })

  it('still links a house through to its collections, from the row and the page', () => {
    expect(list).toContain('collectionsPath(brand)')
    expect(page).toContain('collectionsPath(brand)')
  })
})

// --- one collection on its own page (23 Sep 2026) ----------------------------

describe('collection routes', () => {
  it('puts one collection on its own page', () => {
    expect(COLLECTIONS_ROUTE).toBe('/admin/collections')
    expect(collectionRoute(9)).toBe('/admin/collections/9')
  })

  // The list's "New collection" used to pre-pick the house it was filtered to,
  // in place; the create page is a navigation away, so the house travels in
  // the URL.
  it('carries the list’s house into the create page', () => {
    expect(newCollectionRoute('12')).toBe('/admin/collections/new?brand_id=12')
    expect(newCollectionRoute(12)).toBe('/admin/collections/new?brand_id=12')
  })

  it('opens a bare create page when the list is not filtered', () => {
    expect(newCollectionRoute('')).toBe('/admin/collections/new')
    expect(newCollectionRoute(null)).toBe('/admin/collections/new')
    expect(newCollectionRoute()).toBe('/admin/collections/new')
  })
})

describe('the collection declarations', () => {
  const keysOf = (fields) => fields.map((field) => field.key)

  it('starts a new collection with a value for every field the create body reads', () => {
    for (const key of [...keysOf(COLLECTION_CREATE_ONLY_FIELDS), ...keysOf(COLLECTION_FIELDS)]) {
      expect(NEW_COLLECTION).toHaveProperty(key)
    }
  })

  it('never lets the house into the PATCH list', () => {
    // Moving a collection between houses would strand its products.
    expect(keysOf(COLLECTION_FIELDS)).not.toContain('brand_id')
    expect(keysOf(COLLECTION_CREATE_ONLY_FIELDS)).toEqual(['brand_id'])
  })
})

describe('the collections list and its two pages', () => {
  const list = sourceOf('AdminCollections.jsx')
  const page = sourceOf('AdminCollection.jsx')
  const create = sourceOf('AdminCollectionNew.jsx')
  const form = sourceOf('CollectionFields.jsx')

  it('leaves the list with no editor and no create form', () => {
    expect(list).not.toContain('openId')
    expect(list).not.toContain('aria-expanded')
    expect(list).not.toContain('<CollectionFields')
    expect(list).not.toContain("'POST', '/admin/collections'")
    expect(list).toContain('collectionRoute(collection.id)')
    expect(list).toContain('newCollectionRoute(brandFilter)')
  })

  it('keeps delete on the list', () => {
    for (const source of [page, create, form]) {
      expect(source).not.toContain('useCrudScreen(')
      expect(source).not.toContain('remove.ask')
      expect(source).not.toContain('apiDelete')
    }
  })

  it('reads the collection by id, which is where the product count comes from', () => {
    expect(page).toContain('useParams')
    expect(page).toContain('`/admin/collections/${id}`')
    expect(page).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(page).toContain('<NotFound')
    // The advance warning that Delete will be refused.
    expect(page).toContain('collection.product_count')
  })

  it('patches the tile editorial only, and creates with the house', () => {
    expect(page).toContain('diffFields(collection, draft, COLLECTION_FIELDS)')
    expect(create).toContain('bodyFrom(newCollection, COLLECTION_CREATE_ONLY_FIELDS)')
    expect(create).toContain("searchParams.get('brand_id')")
  })

  it('draws create and edit through the one form', () => {
    expect(page).toContain('<CollectionFields')
    expect(create).toContain('<CollectionFields')
    expect(form).toContain('field="collections.image_url"')
  })

  it('lands a created collection on its own page, replacing the form in history', () => {
    expect(create).toContain('navigate(collectionRoute(created.id), { replace: true })')
  })
})

// 23 Sep 2026, client asked: the products table drops its Size and Colourways
// columns. Both stay on the product's own page (ProductFields, the colourways
// panel); the list is what distinguishes one design from the next at a glance.
describe('the products list columns', () => {
  const LIST = readFileSync(new URL('./AdminProducts.jsx', import.meta.url), 'utf8')

  it('has no Size or Colourways column', () => {
    expect(LIST).toContain("labels={['Product', 'House · collection', 'Type', 'Category', 'Website', '']}")
    expect(LIST).not.toContain("'Size'")
    expect(LIST).not.toContain("'Colourways'")
    expect(LIST).not.toContain('product.size')
    expect(LIST).not.toContain('colourway_count')
  })

  it('keeps one grid track per label', () => {
    const columns = LIST.match(/const PRODUCT_COLUMNS = '([^']+)'/)[1].split(' ')
    const labels = LIST.match(/labels=\{\[([^\]]+)\]\}/)[1].split(',')
    expect(columns).toHaveLength(labels.length)
  })
})
