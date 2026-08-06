import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BRAND_LIST,
  COLLECTION_LIST,
  FEATURED_BRANDS_PATH,
  FEATURED_COLLECTIONS_PATH,
  FEATURED_LIMIT,
  FEATURED_SOURCE_PATHS,
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

  it('reads both catalogue lists archive-inclusive', () => {
    // An archived row stays FEATURED on purpose, so the panel cannot be built
    // from the screen's own houses list — that one follows "Show archived", and
    // a list assembled from only the visible rows would silently unfeature an
    // archived house on the next whole-list save.
    expect(FEATURED_SOURCE_PATHS.brands).toBe('/admin/brands?include_archived=true')
    expect(FEATURED_SOURCE_PATHS.collections).toBe('/admin/collections?include_archived=true')
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

// Where the panel LIVES is an acceptance criterion of this story, and with no
// jsdom a source scan is the only way to hold it. It is not a hypothetical
// regression: the panel was written once, against the AdminBrands that held
// collections, and was lost wholesale when that screen was rewritten around
// useCrudScreen — the module below survived because it is a file of its own,
// and nothing failed to say the screen had stopped using it.
const screenSource = readFileSync(new URL('./AdminBrands.jsx', import.meta.url), 'utf8')

describe('the AdminBrands featured panel', () => {
  it('is on the screen and draws both strips', () => {
    expect(screenSource).toContain('Featured on the storefront')
    expect(screenSource).toContain('BRAND_LIST')
    expect(screenSource).toContain('COLLECTION_LIST')
    // The asymmetry is a standing note on the panel, not a footnote.
    expect(screenSource).toContain('STOREFRONT_TIMING_NOTE')
  })

  it('keeps every ordering rule in the module', () => {
    // Position IS the rank: a screen that touched the column itself would be
    // computing a number the whole-list PUT exists to make unnecessary. Matched
    // as a property read or write, not as the word — the comment saying the
    // screen does not touch it carries the word, exactly as AdminShipping's
    // "no archive here" comment tripped that screen's first negative scan.
    expect(screenSource).not.toMatch(/\.featured_rank|featured_rank\s*[:=]/)
    for (const rule of ['featuredFrom', 'move', 'addFeatured', 'removeFeatured', 'candidates', 'sameOrder', 'saveBody']) {
      expect(screenSource).toContain(rule)
    }
  })

  it('joins the house slug on before a collection can be sent', () => {
    // GET /admin/collections carries brand_id and brand_name but not the house
    // slug, and the reorder body names the (brand_slug, slug) PAIR.
    expect(screenSource).toContain('withBrandSlug')
  })

  it('reads the two lists through the module, not through the screen list', () => {
    expect(screenSource).toContain('FEATURED_SOURCE_PATHS')
  })
})

// A conflict a human merging these branches has to settle, recorded here rather
// than left for a reviewer to find:
//
// `adminCatalogue.test.js`'s "leaves AdminBrands with houses only" asserts
// `expect(brands).not.toContain('/admin/collections')`, under the comment "Not
// one collection endpoint is called from the houses screen any more". That was
// true when collections moved to their own screen, and this panel makes it
// false: AdminBrands now READS `/admin/collections?include_archived=true` and
// WRITES `/admin/collections/featured`. Both paths are constants in
// featuredOrder.js, so that scan still passes — for the wrong reason.
//
// The invariant that survives is narrower, and it is the one asserted below: the
// houses screen holds no collection CRUD. Ordering a storefront strip is not
// editing a collection — no draft, no create form, no name/description/image
// field, and no delete — which is why the featured panel can live beside the
// houses list without giving collections a second editor.
describe('the panel is not a second collections editor', () => {
  it('holds no collection drafts, fields or per-row writes', () => {
    expect(screenSource).not.toContain('COLLECTION_FIELDS')
    expect(screenSource).not.toContain('collectionDrafts')
    // A row-addressed collection path (`/admin/collections/${id}/…`) is what an
    // editor, an archive toggle or a delete would need. The panel names no row.
    expect(screenSource).not.toMatch(/\/admin\/collections\/\$\{/)
  })

  it('sends a collection nothing but its place in the order', () => {
    // saveBody projects the list into { collections: [{ brand_slug, slug }] } —
    // no rank, and no field of the row itself.
    const [row] = withBrandSlug(
      [collection(1, 5, 'Larsen', '2024', 'larsen-2024', 2)],
      [brand(5, 'Larsen', 'larsen')]
    )
    expect(saveBody([row], COLLECTION_LIST).body).toEqual({
      collections: [{ brand_slug: 'larsen', slug: 'larsen-2024' }],
    })
  })
})
