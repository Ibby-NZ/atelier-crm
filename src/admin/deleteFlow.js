// The delete flow's rules, as plain functions. ask -> attempt -> explain.
//
// **There is no pre-flight "can I delete this" request.** It would be a second
// round trip that races the delete, and the API already answers authoritatively:
// its 409 carries `blockers` and `archivable` (see atelier-api
// src/lifecycle/delete.js). This mirrors the API's own rule that duplicates are
// detected by the database and never pre-checked. `attemptDelete` therefore makes
// exactly one request, and its test asserts that count.
//
// The other half of the same decision: on a 409 the dialog does **not** close.
// Closing it and flashing a toast throws away the explanation the moment staff
// need it, and leaves them looking at the row wondering what happened.

import { messageOf } from './parts.jsx'

const DEFAULT_FALLBACK = 'That could not be deleted.'

/**
 * One blocker as a line of copy: '3 products', '100+ order lines'.
 * `capped` means the API stopped counting at 100 — "100+" is the honest reading.
 *
 * @param {{ label?: string, count?: number, capped?: boolean }} blocker
 * @returns {string|null} null when the blocker is not usable copy
 */
export function blockerLine(blocker) {
  const label = typeof blocker?.label === 'string' ? blocker.label.trim() : ''
  const count = Number(blocker?.count)
  if (label === '' || !Number.isFinite(count) || count <= 0) return null
  return `${count}${blocker.capped ? '+' : ''} ${label}`
}

/**
 * Turn a failed delete into something the dialog can render.
 *
 * A 409 from the lifecycle module carries `{ message, blockers, archivable }`.
 * Anything else — a 404, a 403 self-delete, a network drop, a 500 with no JSON —
 * has no blockers, so it degrades to the one sentence `messageOf` produces. That
 * fallback is the common path in every failure that is not "something still
 * points at this", and skipping it is how a screen ends up showing an empty
 * explanation box.
 *
 * @param {unknown} error
 * @param {{ fallback?: string }} [opts]
 * @returns {{ message: string, lines: string[], archivable: boolean }}
 */
export function describeBlockers(error, opts = {}) {
  const fallback = opts.fallback ?? DEFAULT_FALLBACK
  const body = error?.body
  const blockers = Array.isArray(body?.blockers) ? body.blockers : []
  const lines = blockers.map(blockerLine).filter((line) => line !== null)
  return {
    // The API phrases the 409 itself ("Cannot delete this house: 3 products…"),
    // so its message wins; messageOf covers everything else.
    message: messageOf(error, fallback),
    lines,
    archivable: body?.archivable === true,
  }
}

/**
 * Run the delete. Never throws: a refusal is a value, exactly as it is on the
 * API side. Makes exactly one request — there is no pre-flight.
 *
 * @param {() => Promise<unknown>} del  the request, injected so this stays pure
 * @param {{ fallback?: string }} [opts]
 * @returns {Promise<{ ok: boolean, blocked: object|null }>}
 */
export async function attemptDelete(del, opts = {}) {
  try {
    await del()
    return { ok: true, blocked: null }
  } catch (error) {
    return { ok: false, blocked: describeBlockers(error, opts) }
  }
}

/**
 * The dialog's content for whichever step the flow is on.
 *
 * Before the attempt it asks. After a refusal it explains, and offers "Archive
 * instead" when the API said the entity is archivable AND the screen supplied an
 * archive action. There is deliberately **no confirm button on the explanation**:
 * the blockers will not have vanished a second later, so a retry can only fail
 * again. Cancel is always there.
 *
 * @param {{ entity?: string, name?: string, blocked?: object|null,
 *   canArchive?: boolean }} state
 * @returns {{ title: string, body: string, lines: string[],
 *   confirmLabel: string|null, secondaryLabel: string|null }}
 */
export function deleteDialog({ entity = 'record', name, blocked, canArchive = false }) {
  const subject = name ? `“${name}”` : `this ${entity}`
  if (!blocked) {
    return {
      title: `Delete ${subject}?`,
      body: `This removes the ${entity} permanently. It cannot be undone.`,
      lines: [],
      confirmLabel: 'Delete',
      secondaryLabel: null,
    }
  }
  return {
    title: `${subject} cannot be deleted`,
    body: blocked.message,
    lines: blocked.lines,
    confirmLabel: null,
    secondaryLabel: blocked.archivable && canArchive ? 'Archive instead' : null,
  }
}
