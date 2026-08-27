import { describe, it, expect } from 'vitest'
import {
  CATEGORY_VALUES,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  categoryLabel,
} from './categories.js'
import { CATEGORY_VALUES as SHEET_CATEGORY_VALUES } from '../screens/adminProductSheet.js'
import { CATEGORY_VALUES as FREIGHT_CATEGORY_VALUES } from '../screens/adminFreight.js'

describe('the category vocabulary', () => {
  it('carries the nine values in the API’s order', () => {
    expect([...CATEGORY_VALUES]).toEqual([
      'fabric', 'wallpaper', 'trimming', 'accessory',
      'bed-linen', 'towel', 'cushion', 'throw', 'misc',
    ])
  })

  it('is ONE list — the sheet panel and the freight desk re-export it, never copy it', () => {
    // All three used to declare their own, and all three had to be found when
    // the vocabulary grew from four values to nine. This is the assertion that
    // stops a fourth copy being added quietly.
    expect(SHEET_CATEGORY_VALUES).toBe(CATEGORY_VALUES)
    expect(FREIGHT_CATEGORY_VALUES).toBe(CATEGORY_VALUES)
  })

  it('labels every value — a stored spelling is never shown raw', () => {
    for (const value of CATEGORY_VALUES) {
      expect(CATEGORY_LABELS[value]).toBeTruthy()
      expect(categoryLabel(value)).toBe(CATEGORY_LABELS[value])
    }
    expect(categoryLabel('bed-linen')).toBe('Bed linen')
    expect(categoryLabel('misc')).toBe('Miscellaneous')
  })

  it('falls back to the raw value for a category this build has not been taught', () => {
    // The CRM and the API ship separately, so a deployed CRM can be a version
    // behind. A row rendering blank would read as "no category" when the truth
    // is "a category this screen has not been taught yet".
    expect(categoryLabel('curtain')).toBe('curtain')
  })

  it('is blank only where there is genuinely no category', () => {
    expect(categoryLabel(null)).toBe('')
    expect(categoryLabel(undefined)).toBe('')
    expect(categoryLabel('')).toBe('')
  })

  it('offers the same list to a <select>, labelled and in order', () => {
    expect(CATEGORY_OPTIONS.map((option) => option.value)).toEqual([...CATEGORY_VALUES])
    expect(CATEGORY_OPTIONS[4]).toEqual({ value: 'bed-linen', label: 'Bed linen' })
  })

  it('is frozen, so a screen cannot push a tenth value into it', () => {
    expect(Object.isFrozen(CATEGORY_VALUES)).toBe(true)
    expect(Object.isFrozen(CATEGORY_LABELS)).toBe(true)
  })
})
