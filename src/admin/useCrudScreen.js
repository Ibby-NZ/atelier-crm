// One admin CRUD screen, assembled: a paged list, a toast, the mutate-then-reload
// cycle, and the delete flow with its dialog.
//
// Returned as four namespaces (`list`, `toast`, `mutation`, `remove`) rather than
// one flat object, because `error` means two different things here — the list
// failed to load, versus this edit was refused — and flattening them is how a
// screen ends up showing a stale save error above a working table.

import { useCallback, useState } from 'react'
import { apiDelete } from '../lib/api.js'
import { useToast, useMutation } from './parts.jsx'
import { useAdminList } from './useAdminList.js'
import { attemptDelete, deleteDialog } from './deleteFlow.js'

/**
 * @param {{
 *   path: string,              // list path, e.g. '/admin/brands'
 *   key: string,               // the array's name in the response envelope
 *   limit?: number,
 *   filters?: object,
 *   entity?: string,           // singular noun for the dialog copy, e.g. 'house'
 *   describe?: (row: object) => string,   // the row's name for the dialog
 *   deletePath?: (row: object) => string, // defaults to `${path}/${row.id}`
 *   archive?: (row: object) => Promise<unknown>, // enables "Archive instead"
 * }} options
 */
export function useCrudScreen({
  path,
  key,
  limit,
  filters,
  entity = 'record',
  describe = (row) => row?.name,
  deletePath = null,
  archive = null,
}) {
  const list = useAdminList({ path, key, limit, filters })
  const { message, flash } = useToast()
  const mutation = useMutation({ reload: list.reload, flash })

  // `target` holds the row under the dialog; `blocked` is the API's explanation
  // once a delete has been refused. Both null means the dialog is closed.
  const [target, setTarget] = useState(null)
  const [blocked, setBlocked] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = useCallback(() => {
    setTarget(null)
    setBlocked(null)
    setError('')
  }, [])

  const ask = useCallback((row) => {
    setTarget(row)
    setBlocked(null)
    setError('')
  }, [])

  const confirm = useCallback(async () => {
    if (!target) return
    setBusy(true)
    setError('')
    // One request. No pre-flight check — the API's 409 is the answer, and a
    // check beforehand would race the delete anyway.
    const outcome = await attemptDelete(
      () => apiDelete(deletePath ? deletePath(target) : `${path}/${target.id}`),
      { fallback: `That ${entity} could not be deleted.` }
    )
    setBusy(false)
    if (!outcome.ok) {
      // Stay open and explain. Closing here would throw the reason away at the
      // moment it is needed.
      setBlocked(outcome.blocked)
      return
    }
    close()
    await list.reload()
    flash(`${describe(target) || `That ${entity}`} deleted.`)
  }, [target, deletePath, path, entity, close, list, flash, describe])

  const secondary = useCallback(async () => {
    if (!target || !archive) return
    setBusy(true)
    setError('')
    try {
      await archive(target)
      close()
      await list.reload()
      flash(`${describe(target) || `That ${entity}`} archived.`)
    } catch (err) {
      setError(err?.message || `That ${entity} could not be archived.`)
    } finally {
      setBusy(false)
    }
  }, [target, archive, close, list, flash, describe, entity])

  const content = deleteDialog({
    entity,
    name: target ? describe(target) : undefined,
    blocked,
    canArchive: archive !== null,
  })

  return {
    list,
    toast: { message, flash },
    mutation,
    remove: {
      ask,
      target,
      // Spread straight onto <ConfirmDialog {...remove.dialog} />.
      dialog: {
        open: target !== null,
        ...content,
        onConfirm: confirm,
        onSecondary: secondary,
        onCancel: close,
        busy,
        error,
      },
    },
  }
}
