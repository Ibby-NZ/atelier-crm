// The merchandising vocabulary, as the API holds it.
//
// It used to be a frozen list in src/lib/categories.js and nothing else, because
// the API's category column was a CHECK constraint: nine words, and a tenth was
// a migration. It is a table now (`GET /admin/categories`), so a screen that
// offers a category must ASK — a category the office added this morning is one
// this build has never heard of, and a select drawn from the frozen list would
// simply not offer it.
//
// The frozen list stays as the fallback, and that is deliberate rather than
// defensive: the nine are seeded by the migration, so they are the right answer
// while the request is in flight and the least wrong one if it fails. A screen
// that showed an empty category select during a slow load would read as "this
// catalogue has no categories".
//
// One fetch per mounting screen, no cache. The list is nine-ish rows and a
// screen mounts once; a cache would be a second source of truth for a request
// that costs less than the code to avoid it.

import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { CATEGORY_OPTIONS, categoryLabel } from '../lib/categories.js'

export const CATEGORIES_PATH = '/admin/categories'

/** `{ value, label }`, the shape every <select> in this repo maps over. */
const toOptions = (categories) =>
  categories.map((category) => ({ value: category.slug, label: category.label }))

/**
 * The vocabulary for a screen that offers or names a category.
 *
 * @returns {{
 *   options: { value: string, label: string }[],
 *   values: string[],
 *   labelFor: (value: string|null|undefined) => string,
 *   status: 'loading'|'ready'|'error',
 * }}
 */
export function useCategories() {
  const [options, setOptions] = useState(() => [...CATEGORY_OPTIONS])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let active = true
    apiFetch(CATEGORIES_PATH)
      .then((body) => {
        if (!active) return
        const categories = Array.isArray(body?.categories) ? body.categories : []
        // An empty list is not an answer worth drawing — the migration seeds
        // nine, so an empty array means something else went wrong.
        if (categories.length > 0) setOptions(toOptions(categories))
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  return {
    options,
    values: options.map((option) => option.value),
    // The API's label when this build knows the category, the frozen list's
    // when it is one of the nine, and the raw value rather than a blank cell
    // when it is neither — a blank reads as "no category", which is a different
    // and real state.
    labelFor: (value) =>
      value == null || value === ''
        ? ''
        : (options.find((option) => option.value === value)?.label ?? categoryLabel(value)),
    status,
  }
}
