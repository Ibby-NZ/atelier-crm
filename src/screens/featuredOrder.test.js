import { describe, it, expect } from 'vitest'
import {
  BRAND_LIST,
  COLLECTION_LIST,
  FEATURED_BRANDS_PATH,
  FEATURED_COLLECTIONS_PATH,
  FEATURED_LIMIT,
  STOREFRONT_TIMING_NOTE,
  addFeatured,
  brandKey,
  candidates,
  collectionKey,
  featuredFrom,
  move,
  removeFeatured,
  sameOrder,
  saveBody,
  unresolved,
  withBrandSlug,
} from './featuredOrder.js'

// The AdminBrands featured panel cannot be rendered here (no jsdom), so every
// ordering rule lives in featuredOrder.js and is tested from this side.

const brand = (id, name, slug, featured_rank = null, extra = {}) => ({
  id,
  name,
  slug,
  featured_rank,
  archived_at: null,
  ...extra,
})

const collection = (id, brand_id, brand_name, name, slug, featured_rank = null) => ({
  id,
  brand_id,
  brand_name,
  name,
  slug,
  featured_rank,
  archived_at: null,
})

describe('paths and limits', () => {
  it('names the two whole-list reorder endpoints', () => {
    expect(FEATURED_BRANDS_PATH).toBe('/admin/brands/featured')
    expect(FEATURED_COLLECTIONS_PATH).toBe('/admin/collections/featured')
    expect(BRAND_LIST.path).toBe(FEATURED_BRANDS_PATH)
    expect(COLLECTION_LIST.path).toBe(FEATURED_COLLECTIONS_PATH)
  })

  it('caps at the same number the API does', () => {
    // FEATURED_LIMIT in atelier-api's src/catalogue/admin-brands.js, applied as
    // maxItems on both bodies. A different number here means the office arranges
    // a list the API then refuses with a 400.
    expect(FEATURED_LIMIT).toBe(12)
  })

  it('states the storefront timing asymmetry, naming both surfaces', () => {
    // The homepage is prerender = true and /brands is not, so a collection change
    // waits for the next build while a house change is live. Left unsaid it reads
    // as a bug ("I reordered the homepage and nothing happened").
    expect(STOREFRONT_TIMING_NOTE).toMatch(/immediately/i)
    expect(STOREFRONT_TIMING_NOTE).toMatch(/next site build/i)
    expect(STOREFRONT_TIMING_NOTE).toMatch(/houses/i)
    expect(STOREFRONT_TIMING_NOTE).toMatch(/collections/i)
  })
})

describe('keys', () => {
  it('names a house by its slug', () => {
    expect(brandKey({ slug: 'larsen' })).toBe('larsen')
    expect(brandKey({})).toBe('')
    expect(brandKey(null)).toBe('')
  })

  it('names a collection by the (brand_slug, slug) PAIR', () => {
    // A collection slug is unique per brand and never globally: two houses may
    // both hold a "2024", and a slug-only key would treat them as one row.
    const larsen = { brand_slug: 'larsen', slug: '2024' }
    const canovas = { brand_slug: 'manuel-canovas', slug: '2024' }
    expect(collectionKey(larsen)).toBe('larsen/2024')
    expect(collectionKey(canovas)).toBe('manuel-canovas/2024')
    expect(collectionKey(larsen)).not.toBe(collectionKey(canovas))
  })

  it('has no key for a collection whose house is unknown', () => {
    expect(collectionKey({ brand_slug: null, slug: '2024' })).toBe('')
  })
})

describe('featuredFrom', () => {
  it('takes the featured rows in rank order and leaves the rest alone', () => {
    const rows = [
      brand(1, 'Zephyr', 'zephyr', 3),
      brand(2, 'Alpha', 'alpha', null),
      brand(3, 'Larsen', 'larsen', 1),
      brand(4, 'Canovas', 'canovas', 2),
    ]
    expect(featuredFrom(rows).map((row) => row.slug)).toEqual(['larsen', 'canovas', 'zephyr'])
  })

  it('does not fall back to alphabetical when the rank says otherwise', () => {
    // Rank the row whose NAME sorts LAST first, or a plain name sort passes too.
    const rows = [brand(1, 'Alpha', 'alpha', 2), brand(2, 'Zephyr', 'zephyr', 1)]
    expect(featuredFrom(rows).map((row) => row.slug)).toEqual(['zephyr', 'alpha'])
  })

  it('breaks a shared rank by name then id, as the API does', () => {
    // Two rows may share a rank — the column carries no unique index — so the
    // tie-break has to be exercised or it is never seen.
    const rows = [
      brand(9, 'Beta', 'beta', 1),
      brand(2, 'Alpha', 'alpha', 1),
      brand(1, 'Alpha', 'alpha-two', 1),
    ]
    expect(featuredFrom(rows).map((row) => row.slug)).toEqual(['alpha-two', 'alpha', 'beta'])
  })

  it('keeps an archived featured row', () => {
    // Archiving is reversible and the public reads already exclude the row, so
    // it stays in the order. Dropping it here would silently unfeature it on the
    // next save, because the submitted list is authoritative.
    const rows = [
      brand(1, 'Larsen', 'larsen', 1),
      brand(2, 'Closed', 'closed', 2, { archived_at: '2026-08-06T00:00:00Z' }),
    ]
    expect(featuredFrom(rows).map((row) => row.slug)).toEqual(['larsen', 'closed'])
  })

  it('never mutates the rows it was given', () => {
    const rows = [brand(1, 'Zephyr', 'zephyr', 2), brand(2, 'Alpha', 'alpha', 1)]
    featuredFrom(rows)
    expect(rows.map((row) => row.slug)).toEqual(['zephyr', 'alpha'])
  })

  it('survives an absent or malformed list', () => {
    expect(featuredFrom()).toEqual([])
    expect(featuredFrom(null)).toEqual([])
    expect(featuredFrom([null, undefined, brand(1, 'A', 'a', 1)])).toHaveLength(1)
  })
})

describe('withBrandSlug', () => {
  const brands = [brand(1, 'Larsen', 'larsen'), brand(2, 'Manuel Canovas', 'manuel-canovas')]

  it('joins the house slug the admin read model does not carry', () => {
    const rows = withBrandSlug([collection(10, 2, 'Manuel Canovas', 'Giverny', 'giverny')], brands)
    expect(rows[0].brand_slug).toBe('manuel-canovas')
  })

  it('leaves the slug null when the house is not loaded, rather than guessing', () => {
    const rows = withBrandSlug([collection(10, 99, 'Ghost', 'Giverny', 'giverny')], brands)
    expect(rows[0].brand_slug).toBeNull()
    expect(collectionKey(rows[0])).toBe('')
  })

  it('does not mutate the collections it was given', () => {
    const rows = [collection(10, 1, 'Larsen', '2024', 'larsen-2024')]
    withBrandSlug(rows, brands)
    expect(Object.hasOwn(rows[0], 'brand_slug')).toBe(false)
  })
})

describe('move', () => {
  const list = [brand(1, 'One', 'one'), brand(2, 'Two', 'two'), brand(3, 'Three', 'three')]
  const slugs = (rows) => rows.map((row) => row.slug)

  it('moves an entry up', () => {
    expect(slugs(move(list, 1, -1))).toEqual(['two', 'one', 'three'])
  })

  it('moves an entry down', () => {
    expect(slugs(move(list, 1, 1))).toEqual(['one', 'three', 'two'])
  })

  it('refuses to move the first entry up', () => {
    // Returned by identity, so the screen can tell nothing happened rather than
    // flashing a save for a list that did not change.
    expect(move(list, 0, -1)).toBe(list)
  })

  it('refuses to move the last entry down', () => {
    expect(move(list, list.length - 1, 1)).toBe(list)
  })

  it('refuses an index outside the list', () => {
    expect(move(list, -1, 1)).toBe(list)
    expect(move(list, 3, -1)).toBe(list)
    expect(move(list, 1.5, 1)).toBe(list)
  })

  it('never mutates the list it was given', () => {
    move(list, 0, 1)
    expect(slugs(list)).toEqual(['one', 'two', 'three'])
  })

  it('moves the ends correctly on a two-entry list', () => {
    const pair = [brand(1, 'One', 'one'), brand(2, 'Two', 'two')]
    expect(slugs(move(pair, 0, 1))).toEqual(['two', 'one'])
    expect(slugs(move(pair, 1, -1))).toEqual(['two', 'one'])
    expect(move(pair, 1, 1)).toBe(pair)
    expect(move(pair, 0, -1)).toBe(pair)
  })

  it('does nothing on an empty list', () => {
    expect(move([], 0, 1)).toEqual([])
  })
})

describe('addFeatured', () => {
  it('appends to the end — the newest choice ranks last', () => {
    const { list, error } = addFeatured([brand(1, 'One', 'one')], brand(2, 'Two', 'two'), BRAND_LIST)
    expect(list.map((row) => row.slug)).toEqual(['one', 'two'])
    expect(error).toBe('')
  })

  it('refuses a duplicate house, naming it', () => {
    // The API 422s a slug listed twice — UPDATE … FROM picks one matching source
    // row non-deterministically, so a duplicate resolves to an arbitrary rank.
    // Refusing here means the body can never carry one.
    const one = brand(1, 'Larsen', 'larsen')
    const { list, error } = addFeatured([one], { ...one }, BRAND_LIST)
    expect(list).toHaveLength(1)
    expect(error).toContain('Larsen')
  })

  it('refuses a duplicate collection on the PAIR, not the slug', () => {
    const larsen = collection(1, 1, 'Larsen', '2024', '2024')
    const canovas = collection(2, 2, 'Manuel Canovas', '2024', '2024')
    const featured = [{ ...larsen, brand_slug: 'larsen' }]

    // Same slug, different house — a legitimate second entry.
    const added = addFeatured(featured, { ...canovas, brand_slug: 'manuel-canovas' }, COLLECTION_LIST)
    expect(added.error).toBe('')
    expect(added.list).toHaveLength(2)

    // The same pair twice is the refusal.
    const again = addFeatured(added.list, { ...larsen, brand_slug: 'larsen' }, COLLECTION_LIST)
    expect(again.list).toHaveLength(2)
    expect(again.error).toContain('already featured')
  })

  it('refuses an entry it cannot name', () => {
    const orphan = { ...collection(1, 99, 'Ghost', '2024', '2024'), brand_slug: null }
    const { list, error } = addFeatured([], orphan, COLLECTION_LIST)
    expect(list).toEqual([])
    expect(error).toContain('cannot be featured')
  })

  it('refuses the thirteenth entry rather than letting the API 400 it', () => {
    const full = Array.from({ length: FEATURED_LIMIT }, (_, i) => brand(i + 1, `H${i}`, `h-${i}`))
    const { list, error } = addFeatured(full, brand(99, 'Extra', 'extra'), BRAND_LIST)
    expect(list).toHaveLength(FEATURED_LIMIT)
    expect(error).toContain(String(FEATURED_LIMIT))
  })

  it('still accepts the twelfth', () => {
    const nearly = Array.from({ length: FEATURED_LIMIT - 1 }, (_, i) =>
      brand(i + 1, `H${i}`, `h-${i}`)
    )
    const { list, error } = addFeatured(nearly, brand(99, 'Extra', 'extra'), BRAND_LIST)
    expect(list).toHaveLength(FEATURED_LIMIT)
    expect(error).toBe('')
  })

  it('never mutates the list it was given', () => {
    const list = [brand(1, 'One', 'one')]
    addFeatured(list, brand(2, 'Two', 'two'), BRAND_LIST)
    expect(list).toHaveLength(1)
  })
})

describe('removeFeatured', () => {
  const list = [brand(1, 'One', 'one'), brand(2, 'Two', 'two'), brand(3, 'Three', 'three')]

  it('drops the entry at the index and closes the gap', () => {
    expect(removeFeatured(list, 1).map((row) => row.slug)).toEqual(['one', 'three'])
  })

  it('drops the ends', () => {
    expect(removeFeatured(list, 0).map((row) => row.slug)).toEqual(['two', 'three'])
    expect(removeFeatured(list, 2).map((row) => row.slug)).toEqual(['one', 'two'])
  })

  it('ignores an index outside the list', () => {
    expect(removeFeatured(list, 3)).toBe(list)
    expect(removeFeatured(list, -1)).toBe(list)
  })

  it('never mutates the list it was given', () => {
    removeFeatured(list, 0)
    expect(list).toHaveLength(3)
  })
})

describe('candidates', () => {
  const brands = [
    brand(1, 'Zephyr', 'zephyr'),
    brand(2, 'Alpha', 'alpha'),
    brand(3, 'Larsen', 'larsen'),
  ]

  it('offers what is not featured yet, alphabetically', () => {
    const offered = candidates(brands, [brands[2]], BRAND_LIST)
    expect(offered.map((row) => row.slug)).toEqual(['alpha', 'zephyr'])
  })

  it('does not offer an archived row to be featured anew', () => {
    // Not the mirror of featuredFrom, which keeps an archived row that is
    // ALREADY featured: archiving is reversible and must not cost a position,
    // but nothing is gained by adding something that cannot appear.
    const rows = [brand(1, 'Live', 'live'), brand(2, 'Gone', 'gone', null, { archived_at: 'x' })]
    expect(candidates(rows, [], BRAND_LIST).map((row) => row.slug)).toEqual(['live'])
  })

  it('leaves out a row it could not name', () => {
    const rows = withBrandSlug(
      [collection(10, 1, 'Larsen', '2024', 'larsen-2024'), collection(11, 99, 'Ghost', 'X', 'x')],
      brands
    )
    expect(candidates(rows, [], COLLECTION_LIST).map((row) => row.id)).toEqual([10])
  })

  it('labels a collection with its house, since two houses may share a name', () => {
    expect(COLLECTION_LIST.labelOf({ brand_name: 'Larsen', name: '2024' })).toBe('Larsen — 2024')
    expect(BRAND_LIST.labelOf({ name: 'Larsen' })).toBe('Larsen')
  })
})

describe('sameOrder', () => {
  const a = brand(1, 'A', 'a')
  const b = brand(2, 'B', 'b')

  it('is true for the same entries in the same order', () => {
    expect(sameOrder([a, b], [{ ...a }, { ...b }], BRAND_LIST)).toBe(true)
  })

  it('is false once something moved', () => {
    expect(sameOrder([a, b], [b, a], BRAND_LIST)).toBe(false)
  })

  it('is false when the length changed', () => {
    expect(sameOrder([a, b], [a], BRAND_LIST)).toBe(false)
  })

  it('is true for two empty lists — turning the strip off then back on', () => {
    expect(sameOrder([], [], BRAND_LIST)).toBe(true)
  })
})

describe('saveBody', () => {
  it('sends houses as an ordered slug array — position is the rank', () => {
    const list = [brand(1, 'Larsen', 'larsen'), brand(2, 'Canovas', 'canovas')]
    expect(saveBody(list, BRAND_LIST)).toEqual({
      body: { slugs: ['larsen', 'canovas'] },
      error: '',
    })
  })

  it('sends collections as ordered PAIRS', () => {
    const list = withBrandSlug(
      [
        collection(10, 1, 'Larsen', '2024', 'larsen-2024'),
        collection(11, 2, 'Manuel Canovas', 'Giverny', 'giverny'),
      ],
      [brand(1, 'Larsen', 'larsen'), brand(2, 'Manuel Canovas', 'manuel-canovas')]
    )
    expect(saveBody(list, COLLECTION_LIST)).toEqual({
      body: {
        collections: [
          { brand_slug: 'larsen', slug: 'larsen-2024' },
          { brand_slug: 'manuel-canovas', slug: 'giverny' },
        ],
      },
      error: '',
    })
  })

  it('sends an empty list, which is how the office turns a strip off', () => {
    expect(saveBody([], BRAND_LIST)).toEqual({ body: { slugs: [] }, error: '' })
  })

  it('refuses to build a body it cannot name every entry in', () => {
    // Sending the list without them would silently unfeature them; sending a
    // null slug is a 400. Neither is something to do quietly.
    const list = [{ ...collection(10, 99, 'Ghost', '2024', '2024'), brand_slug: null }]
    const { body, error } = saveBody(list, COLLECTION_LIST)
    expect(body).toBeNull()
    expect(error).toContain('Reload')
    expect(unresolved(list, COLLECTION_LIST)).toHaveLength(1)
  })

  it('carries no duplicate after any sequence of edits', () => {
    // The invariant addFeatured exists to hold: whatever the office does, the
    // body cannot name the same row twice, which the API answers with a 422.
    const rows = [
      brand(1, 'One', 'one'),
      brand(2, 'Two', 'two'),
      brand(3, 'Three', 'three'),
    ]
    let list = []
    for (const row of [...rows, ...rows, rows[1]]) {
      list = addFeatured(list, row, BRAND_LIST).list
    }
    list = move(list, 2, -1)
    list = removeFeatured(list, 0)
    list = addFeatured(list, rows[0], BRAND_LIST).list

    const { slugs } = saveBody(list, BRAND_LIST).body
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
