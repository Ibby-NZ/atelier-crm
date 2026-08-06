import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { escapeCancels } from './ConfirmDialog.jsx'

// ConfirmDialog uses hooks (focus + the key listener), so unlike Pagination it
// cannot be called as a plain function — there is no jsdom here. Its one piece of
// real logic is exported and tested directly; the rest are source assertions over
// attributes that have no runtime surface in this repo but are exactly what makes
// a modal usable.

describe('escapeCancels', () => {
  it('cancels on Escape', () => {
    const onCancel = vi.fn()
    const preventDefault = vi.fn()
    escapeCancels(onCancel)({ key: 'Escape', preventDefault })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('ignores every other key', () => {
    const onCancel = vi.fn()
    const handler = escapeCancels(onCancel)
    for (const key of ['Enter', 'Tab', 'Esc', ' ', 'a']) handler({ key })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('survives a missing handler and a missing preventDefault', () => {
    expect(() => escapeCancels()({ key: 'Escape' })).not.toThrow()
  })
})

describe('ConfirmDialog markup invariants', () => {
  const source = readFileSync(new URL('./ConfirmDialog.jsx', import.meta.url), 'utf8')

  it('announces itself as a modal dialog', () => {
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain('aria-labelledby="confirm-dialog-title"')
    expect(source).toContain('id="confirm-dialog-title"')
  })

  it('listens for Escape only while open, and stops listening after', () => {
    expect(source).toContain("window.addEventListener('keydown', onKey)")
    expect(source).toContain("window.removeEventListener('keydown', onKey)")
    expect(source).toContain('if (!open) return undefined')
  })

  it('focuses Cancel, and Cancel is a native button so the ref lands', () => {
    // GhostButton is a plain function component and does not forward refs, so
    // ref={cancelRef} on it would be silently dropped and a stray Enter after
    // opening would hit the destructive button instead.
    expect(source).toContain('cancelRef.current?.focus()')
    expect(source).toMatch(/<button\s+ref=\{cancelRef\}/)
    expect(source).not.toMatch(/<GhostButton[^>]*ref=/)
  })

  it('renders nothing when closed', () => {
    expect(source).toContain('if (!open) return null')
  })
})
