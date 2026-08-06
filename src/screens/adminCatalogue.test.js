import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery, pageCount } from '../admin/list.js'
import {
  CATALOGUE_LIST_LIMIT,
  archiveInsteadPath,
  archiveTogglePath,
  brandListFilters,
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
describe('the two catalogue screens', () => {
  const screens = [
    ['AdminBrands.jsx', readFileSync(new URL('./AdminBrands.jsx', import.meta.url), 'utf8')],
    ['AdminProducts.jsx', readFileSync(new URL('./AdminProducts.jsx', import.meta.url), 'utf8')],
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
      // Neither endpoint pages. A Previous/Next pair here would be the sixth
      // copy of the thing the kit exists to delete.
      expect(source).not.toContain('Pagination')
      expect(source).not.toMatch(/Previous/)
    })
  }
})
