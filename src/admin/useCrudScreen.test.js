import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { useCrudScreen } from './useCrudScreen.js'

// The hook cannot be rendered (no jsdom), and every rule it applies is already
// unit-tested where it lives: deleteFlow.js for the copy and the attempt,
// useAdminList.js for the paging. What is left to guard is the wiring — the three
// decisions that only exist in this file.

describe('useCrudScreen', () => {
  it('is a hook, exported under the name the kit documents', () => {
    expect(typeof useCrudScreen).toBe('function')
  })

  const source = readFileSync(new URL('./useCrudScreen.js', import.meta.url), 'utf8')

  it('deletes with apiDelete and never pre-flights', () => {
    // apiSend('DELETE', …) would set Content-Type: application/json with an empty
    // body, which Fastify answers with 400 FST_ERR_CTP_EMPTY_JSON_BODY before the
    // route runs. And a "can I delete this?" GET would race the delete.
    expect(source).toContain('apiDelete')
    expect(source).not.toContain('apiGet')
    expect(source).not.toMatch(/apiSend\(\s*'DELETE'/)
  })

  it('keeps the dialog open on a refusal', () => {
    // The branch that matters: a failed attempt sets `blocked` and returns
    // WITHOUT calling close(). Closing would discard the explanation exactly when
    // it is needed.
    const refusal = source.slice(source.indexOf('if (!outcome.ok)'))
    const branch = refusal.slice(0, refusal.indexOf('}'))
    expect(branch).toContain('setBlocked(outcome.blocked)')
    expect(branch).toContain('return')
    expect(branch).not.toContain('close()')
  })

  it('separates the load error from the mutation error', () => {
    // Both are called `error` upstream; flattening them is how a stale save
    // error ends up rendered above a perfectly healthy table.
    expect(source).toContain('list,')
    expect(source).toContain('mutation,')
    expect(source).toContain('toast:')
    expect(source).toContain('remove:')
  })

  it('only offers Archive instead when the screen supplied one', () => {
    expect(source).toContain('canArchive: archive !== null')
  })
})
