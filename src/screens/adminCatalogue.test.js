import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery, pageCount } from '../admin/list.js'
import {
  CATALOGUE_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  brandListFilters,
  collectionListFilters,
  collectionsPath,
  describeCollection,
  productListFilters,
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

describe('CATALOGUE_LIST_LIMIT', () => {
  it('keeps an unpaged answer at one page', () => {
    // Both endpoints return every row and declare no `page` param, so a second
    // page could never be fetched. The kit's default 25 would report 2 pages
    // over the 41 seeded houses.
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

    it(`${name} adds no paginator`, () => {
      // None of the three endpoints pages. A Previous/Next pair here would be
      // the sixth copy of the thing the kit exists to delete.
      expect(source).not.toContain('Pagination')
      expect(source).not.toMatch(/Previous/)
    })
  }
})

// US-010's structural criteria. The move is the story, so what has to be proved
// is where the collections panel now lives — and, just as much, where it does not.
describe('collections moved out of AdminBrands', () => {
  const brands = sourceOf('AdminBrands.jsx')
  const collections = sourceOf('AdminCollections.jsx')

  it('takes COLLECTION_FIELDS with it', () => {
    expect(collections).toContain('COLLECTION_FIELDS')
    expect(brands).not.toContain('COLLECTION_FIELDS')
  })

  it('leaves AdminBrands with houses only', () => {
    // Not one collection endpoint is called from the houses screen any more,
    // and no second list's drafts are held there.
    expect(brands).not.toContain('/admin/collections')
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
