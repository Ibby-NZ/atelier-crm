import { describe, it, expect, vi } from 'vitest'
import { ApiError } from '../lib/api.js'
import {
  attemptDelete,
  blockerLine,
  deleteDialog,
  describeBlockers,
} from './deleteFlow.js'

// A refusal exactly as atelier-api's src/lifecycle/delete.js sends it.
const conflict = (body) => {
  const error = new ApiError(body.message, 409)
  error.body = { statusCode: 409, error: 'Conflict', ...body }
  return error
}

const BLOCKED = conflict({
  message: 'Cannot delete this house: 3 products, 1 collections still reference it.',
  blockers: [
    { relation: 'products', label: 'products', count: 3, capped: false },
    { relation: 'collections', label: 'collections', count: 1, capped: false },
  ],
  archivable: true,
})

describe('blockerLine', () => {
  it('reads a capped count as "100+"', () => {
    expect(blockerLine({ label: 'order lines', count: 100, capped: true })).toBe(
      '100+ order lines'
    )
    expect(blockerLine({ label: 'products', count: 3, capped: false })).toBe('3 products')
  })

  it('drops a blocker that is not usable copy', () => {
    expect(blockerLine({ label: '', count: 3 })).toBeNull()
    expect(blockerLine({ label: 'products', count: 0 })).toBeNull()
    expect(blockerLine({ label: 'products' })).toBeNull()
    expect(blockerLine(null)).toBeNull()
  })
})

describe('describeBlockers', () => {
  it('renders the API 409 as a message plus one line per blocker', () => {
    expect(describeBlockers(BLOCKED)).toEqual({
      message: 'Cannot delete this house: 3 products, 1 collections still reference it.',
      lines: ['3 products', '1 collections'],
      archivable: true,
    })
  })

  it('falls back to messageOf when the body is missing', () => {
    // A network drop, a 500 with no JSON, a 403 self-delete: no blockers, so the
    // dialog must still have one sentence to show.
    const bare = new ApiError('You cannot delete your own account.', 403)
    expect(describeBlockers(bare)).toEqual({
      message: 'You cannot delete your own account.',
      lines: [],
      archivable: false,
    })
  })

  it('uses the caller fallback when the error carries no message at all', () => {
    expect(describeBlockers(new Error('boom'), { fallback: 'That house is stuck.' })).toEqual({
      message: 'That house is stuck.',
      lines: [],
      archivable: false,
    })
    expect(describeBlockers(undefined).message).toBe('That could not be deleted.')
  })

  it('never reports archivable on a shape it did not recognise', () => {
    const odd = new ApiError('Nope', 409)
    odd.body = { blockers: 'not-an-array', archivable: 'yes' }
    expect(describeBlockers(odd)).toEqual({ message: 'Nope', lines: [], archivable: false })
  })
})

describe('attemptDelete', () => {
  it('makes exactly one request — there is no pre-flight check', () => {
    // A "can I delete this?" GET would be a second round trip that races the
    // delete, and the API already answers authoritatively in the 409.
    const del = vi.fn().mockResolvedValue({ deleted: { entity: 'brand', id: 4 } })
    return attemptDelete(del).then((outcome) => {
      expect(del).toHaveBeenCalledTimes(1)
      expect(outcome).toEqual({ ok: true, blocked: null })
    })
  })

  it('returns the refusal rather than throwing it', async () => {
    const del = vi.fn().mockRejectedValue(BLOCKED)
    const outcome = await attemptDelete(del)
    expect(del).toHaveBeenCalledTimes(1)
    expect(outcome.ok).toBe(false)
    expect(outcome.blocked.lines).toEqual(['3 products', '1 collections'])
    expect(outcome.blocked.archivable).toBe(true)
  })
})

describe('deleteDialog', () => {
  it('asks first, naming the row', () => {
    expect(deleteDialog({ entity: 'house', name: 'Pierre Frey' })).toEqual({
      title: 'Delete “Pierre Frey”?',
      body: 'This removes the house permanently. It cannot be undone.',
      lines: [],
      confirmLabel: 'Delete',
      secondaryLabel: null,
    })
  })

  it('falls back to the noun when the row has no name', () => {
    expect(deleteDialog({ entity: 'enquiry' }).title).toBe('Delete this enquiry?')
  })

  it('explains a refusal and offers Archive instead', () => {
    const dialog = deleteDialog({
      entity: 'house',
      name: 'Pierre Frey',
      blocked: describeBlockers(BLOCKED),
      canArchive: true,
    })
    expect(dialog.title).toBe('“Pierre Frey” cannot be deleted')
    expect(dialog.lines).toEqual(['3 products', '1 collections'])
    expect(dialog.secondaryLabel).toBe('Archive instead')
    // No retry button: the blockers will not have vanished a second later.
    expect(dialog.confirmLabel).toBeNull()
  })

  it('offers no archive when the entity has no archived_at column', () => {
    // e.g. a shipping rate or an inventory row — the API says archivable: false.
    const blocked = describeBlockers(
      conflict({ message: 'Reserved stock.', blockers: [], archivable: false })
    )
    expect(deleteDialog({ entity: 'stock row', blocked, canArchive: true }).secondaryLabel).toBeNull()
  })

  it('offers no archive when the screen supplied no archive action', () => {
    expect(
      deleteDialog({ entity: 'house', blocked: describeBlockers(BLOCKED), canArchive: false })
        .secondaryLabel
    ).toBeNull()
  })
})
