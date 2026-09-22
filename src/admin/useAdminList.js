// The one list hook. Fetch, page, filter and reload for every admin list screen.
//
// Two things here are not obvious and are the reason this is shared code rather
// than a snippet to copy:
//
//   - **The effect depends on the SERIALISED query, not the `filters` object.**
//     A screen passing an inline object literal (`filters={{ q, role }}`) hands
//     over a new identity on every render, and an effect keyed on it refetches
//     forever. A string cannot do that.
//   - **A delete that empties the last page steps back one page.** Otherwise the
//     screen sits on page 4 of 3 showing nothing, which reads as "the delete
//     broke the list".
//
// `pageAfterLoad` carries that second rule as a plain function, because this repo
// has no jsdom and a hook cannot be rendered in a test.

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { messageOf } from './parts.jsx'
import {
  DEFAULT_LIMIT,
  buildListQuery,
  clampPage,
  listPath,
  pageCount,
  readList,
} from './list.js'

/**
 * The page to move to after a load, or null to stay put. Only fires when a page
 * past the first came back empty — page 1 being empty is just an empty list.
 *
 * @param {{ page: number, rows: unknown[], total: number, limit: number }} state
 * @returns {number|null}
 */
export function pageAfterLoad({ page, rows, total, limit }) {
  if (page <= 1 || rows.length > 0) return null
  const target = clampPage(page, pageCount(total, limit))
  return target === page ? null : target
}

/**
 * Paged, filtered list state for an admin screen.
 *
 * @param {{ path: string, key: string, limit?: number, filters?: object }} options
 *   `path` is the API path without a query; `key` names the array in the
 *   response envelope; `filters` are extra query params (see buildListQuery for
 *   how empties are dropped).
 * @returns {{ rows: unknown[], total: number, page: number, setPage: Function,
 *   totalPages: number, status: 'loading'|'ready'|'error', error: string,
 *   reload: () => Promise<{rows: unknown[], total: number}> }}
 */
export function useAdminList({ path, key, limit = DEFAULT_LIMIT, filters }) {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [meta, setMeta] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  // Both are strings, so every dependency below is a primitive.
  const filterQuery = buildListQuery(filters)
  const query = buildListQuery({ ...filters, page, limit })

  const fetchPage = useCallback(
    async () => readList(await apiFetch(listPath(path, query)), key),
    [path, key, query]
  )

  const apply = useCallback(
    (next) => {
      setRows(next.rows)
      setTotal(next.total)
      setMeta(next.meta)
      const step = pageAfterLoad({ page, rows: next.rows, total: next.total, limit })
      // Changing the page changes `query`, so the effect below refetches. It
      // terminates: pageAfterLoad returns null once the page is 1 or non-empty.
      if (step) setPage(step)
    },
    [page, limit]
  )

  // A filter change starts again from the first page — page 7 of a narrower
  // result set is usually past the end, and silently showing nothing looks like
  // the filter matched nothing. Running on mount too is harmless: page is
  // already 1, and React bails out of a same-value setState.
  useEffect(() => {
    setPage(1)
  }, [filterQuery])

  useEffect(() => {
    // StrictMode mounts every effect twice in development, and a filter change
    // briefly leaves the previous page in `query`. The flag means only the
    // newest request may write state — without it a slow earlier response can
    // land last and overwrite the right rows with stale ones.
    let active = true
    setStatus('loading')
    setError('')
    fetchPage()
      .then((next) => {
        if (!active) return
        apply(next)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(messageOf(err, 'We could not load this list.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [fetchPage, apply])

  // For useMutation({ reload }): awaited by the caller, so it needs no flag.
  const reload = useCallback(async () => {
    const next = await fetchPage()
    apply(next)
    return next
  }, [fetchPage, apply])

  return {
    rows,
    total,
    meta,
    page,
    setPage,
    totalPages: pageCount(total, limit),
    status,
    error,
    reload,
  }
}
