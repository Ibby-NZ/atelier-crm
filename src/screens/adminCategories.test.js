import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CATEGORY_VALUES } from '../lib/categories.js'
import {
  CATEGORIES_PATH,
  SHEET_PATH,
  UNCATEGORISED,
  categoryPatch,
  categoryRows,
  countLabel,
  describeProduct,
  productsIn,
} from './adminCategories.js'

const products = [
  { id: 1, name: 'Zebra', brand_name: 'Pierre Frey', category: 'fabric' },
  { id: 2, name: 'Arcadia', brand_name: 'Colefax', category: 'fabric' },
  { id: 3, name: 'Galata', brand_name: 'Pierre Frey', category: 'towel' },
  { id: 4, name: 'Nobody looked', brand_name: 'Larsen', category: null },
  { id: 5, name: 'Future', brand_name: 'Larsen', category: 'rug' },
]

describe('categoryRows', () => {
  it('lists every vocabulary value in order, counted, then the unknown, then Uncategorised last', () => {
    const rows = categoryRows(products)
    expect(rows.map((row) => row.value)).toEqual([...CATEGORY_VALUES, 'rug', UNCATEGORISED])
    expect(rows.find((row) => row.value === 'fabric').count).toBe(2)
    expect(rows.find((row) => row.value === 'cushion').count).toBe(0)
    expect(rows.at(-1)).toEqual({ value: UNCATEGORISED, label: 'Uncategorised', count: 1 })
  })

  it('labels a value this build has no word for with the raw value, never blank', () => {
    expect(categoryRows(products).find((row) => row.value === 'rug').label).toBe('rug')
  })

  it('draws all nine rows for an empty catalogue', () => {
    expect(categoryRows([]).filter((row) => row.count === 0)).toHaveLength(CATEGORY_VALUES.length + 1)
  })
})

describe('productsIn', () => {
  it('filters to one category, house first then design', () => {
    expect(productsIn(products, 'fabric').map((p) => p.id)).toEqual([2, 1])
  })

  it('treats null and empty string as the same absence', () => {
    const withBlank = [...products, { id: 6, name: 'Blank', brand_name: 'Zoffany', category: '' }]
    expect(productsIn(withBlank, UNCATEGORISED).map((p) => p.id)).toEqual([4, 6])
  })
})

describe('categoryPatch', () => {
  it('clears with null — an empty string would 400 on the enum', () => {
    expect(categoryPatch(UNCATEGORISED)).toEqual({ category: null })
    expect(categoryPatch('towel')).toEqual({ category: 'towel' })
  })
})

describe('labels', () => {
  it('names a product with its house', () => {
    expect(describeProduct(products[0])).toBe('Pierre Frey · Zebra')
    expect(describeProduct({ name: 'Lone' })).toBe('Lone')
  })

  it('pluralises the count', () => {
    expect(countLabel(0)).toBe('None')
    expect(countLabel(1)).toBe('1 product')
    expect(countLabel(3)).toBe('3 products')
  })
})

describe('wiring', () => {
  const sections = readFileSync(new URL('../components/sections.js', import.meta.url), 'utf8')
  const nav = readFileSync(new URL('../components/workspaceNavigation.js', import.meta.url), 'utf8')
  const screen = readFileSync(new URL('./AdminCategories.jsx', import.meta.url), 'utf8')

  it('the Categories tab opens the list, and the sheet page stays lit under it', () => {
    expect(sections).toContain(`to: '${CATEGORIES_PATH}'`)
    expect(nav).toContain(`'${CATEGORIES_PATH}': ['${SHEET_PATH}']`)
  })

  it('the screen writes through the products PATCH only — no invented category endpoint', () => {
    expect(screen).toContain("apiSend('PATCH', `/admin/products/")
    expect(screen).not.toContain('/admin/categories/')
  })
})
