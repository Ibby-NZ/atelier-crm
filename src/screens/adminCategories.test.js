import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CATEGORIES_PATH,
  SHEET_PATH,
  canDelete,
  categoryPath,
  countLabel,
  describeCategory,
  newCategoryBody,
  productsPath,
} from './adminCategories.js'

const categories = [
  { slug: 'fabric', label: 'Fabric', product_count: 12 },
  { slug: 'towel', label: 'Towel', product_count: 0 },
  { slug: 'bed-linen', label: 'Bed linen', product_count: 1 },
]

describe('newCategoryBody', () => {
  it('sends the trimmed label and nothing else — the API derives the slug', () => {
    expect(newCategoryBody('  Area rug  ', categories)).toEqual({ body: { label: 'Area rug' } })
  })

  it('refuses a blank name', () => {
    expect(newCategoryBody('   ', categories).error).toMatch(/Name the category/)
    expect(newCategoryBody(undefined, categories).error).toMatch(/Name the category/)
  })

  it('refuses a name with nothing sluggable in it, the way the API would', () => {
    // slugify would return '' and the API answers 422; saying so here costs a
    // round trip nobody learns anything from.
    expect(newCategoryBody('!!!', categories).error).toMatch(/letter or number/)
  })

  it('refuses a name past the API column limit', () => {
    expect(newCategoryBody('x'.repeat(61), categories).error).toMatch(/60 characters or fewer/)
    expect(newCategoryBody('x'.repeat(60), categories)).toEqual({
      body: { label: 'x'.repeat(60) },
    })
  })

  it('refuses a duplicate label regardless of case — it is on the screen already', () => {
    expect(newCategoryBody('fabric', categories).error).toMatch(/already a category/)
    expect(newCategoryBody('  Bed Linen ', categories).error).toMatch(/already a category/)
  })

  it('takes a label that only resembles an existing one', () => {
    expect(newCategoryBody('Fabrics', categories)).toEqual({ body: { label: 'Fabrics' } })
  })
})

describe('paths', () => {
  it('keys a category by its slug, not an id', () => {
    expect(categoryPath('bed-linen')).toBe('/admin/categories/bed-linen')
    expect(CATEGORIES_PATH).toBe('/admin/categories')
  })

  it('escapes a slug rather than pasting it into a URL', () => {
    expect(categoryPath('a b')).toBe('/admin/categories/a%20b')
    expect(productsPath('a b')).toBe('/admin/products?category=a%20b')
  })

  it('sends a category to the Products list narrowed to it', () => {
    expect(productsPath('towel')).toBe('/admin/products?category=towel')
  })

  it('keeps the spreadsheet round trip on its own page', () => {
    expect(SHEET_PATH).toBe('/admin/product-sheet')
  })
})

describe('canDelete', () => {
  it('is false while designs still carry the category', () => {
    expect(canDelete(categories[0])).toBe(false)
    expect(canDelete(categories[2])).toBe(false)
  })

  it('is true for one nothing carries', () => {
    expect(canDelete(categories[1])).toBe(true)
    // A row the API served without a count is not a reason to block the button:
    // the API probes on DELETE either way.
    expect(canDelete({ slug: 'new' })).toBe(true)
  })
})

describe('labels', () => {
  it('names a category by its label, never its slug', () => {
    expect(describeCategory(categories[2])).toBe('Bed linen')
  })

  it('falls back to the slug, then to a phrase, rather than to nothing', () => {
    expect(describeCategory({ slug: 'rug' })).toBe('rug')
    expect(describeCategory(null)).toBe('That category')
  })

  it('counts products in words', () => {
    expect(countLabel(0)).toBe('None')
    expect(countLabel(undefined)).toBe('None')
    expect(countLabel(1)).toBe('1 product')
    expect(countLabel(12)).toBe('12 products')
  })
})

describe('the screen', () => {
  const source = readFileSync(new URL('./AdminCategories.jsx', import.meta.url), 'utf8')

  // The whole point of the change: moving a design between categories belongs
  // on the design. A select in this list is how the two copies start
  // disagreeing about which is authoritative.
  it('offers no "Move to" control', () => {
    // The header still NAMES the removed control, which is why this looks for
    // the control itself: no select anywhere on the screen, and no PATCH.
    expect(source).not.toMatch(/<Select/)
    expect(source).not.toMatch(/categoryPatch/)
    expect(source).not.toMatch(/apiSend\('PATCH'/)
  })

  it('writes only through the categories routes', () => {
    expect(source).toMatch(/apiSend\('POST', CATEGORIES_PATH/)
    expect(source).not.toMatch(/\/admin\/products\/\$\{/)
  })
})
