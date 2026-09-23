import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ROW_CONTROLS, rowClickDestination, rowClickOpens } from './rowLink.js'

describe('rowClickOpens', () => {
  it('opens on a plain primary click on the row', () => {
    expect(rowClickOpens({ button: 0 })).toBe(true)
    expect(rowClickOpens()).toBe(true)
  })

  it('leaves a click on a control inside the row to that control', () => {
    // Open / Archive / Delete buttons, a link elsewhere, a form control.
    expect(rowClickOpens({ insideControl: true })).toBe(false)
  })

  it('does not leave the list when someone is selecting text to copy', () => {
    expect(rowClickOpens({ selectedText: 'stefania@warnerprod.com' })).toBe(false)
    expect(rowClickOpens({ selectedText: '   ' })).toBe(true)
  })

  it('ignores anything but the primary button', () => {
    expect(rowClickOpens({ button: 1 })).toBe(false)
    expect(rowClickOpens({ button: 2 })).toBe(false)
  })
})

describe('rowClickDestination', () => {
  it("opens a new tab on a modified click, as the name's own link would", () => {
    expect(rowClickDestination({ metaKey: true })).toBe('new-tab')
    expect(rowClickDestination({ ctrlKey: true })).toBe('new-tab')
    expect(rowClickDestination({ shiftKey: true })).toBe('new-tab')
    expect(rowClickDestination({})).toBe('here')
  })
})

describe('ROW_CONTROLS', () => {
  it('names every control a row can hold', () => {
    const parts = ROW_CONTROLS.split(',').map((part) => part.trim())
    for (const tag of ['a', 'button', 'input', 'select', 'textarea', 'label']) {
      expect(parts).toContain(tag)
    }
  })
})

// No jsdom: LinkRow is pinned by its source.
describe('LinkRow', () => {
  const SOURCE = readFileSync(new URL('./LinkRow.jsx', import.meta.url), 'utf8')
  const PARTS = readFileSync(new URL('./parts.jsx', import.meta.url), 'utf8')

  it('is a Row with the hover class and one click handler built from the rules', () => {
    expect(SOURCE).toContain('className="ab-rowhover" onClick={open}')
    expect(SOURCE).toContain('event.target.closest?.(ROW_CONTROLS)')
    expect(SOURCE).toContain('rowClickOpens(')
    expect(SOURCE).toContain('navigate(to)')
  })

  // The name inside is the keyboard's way in; a row with a role would nest
  // interactive elements and swallow the buttons inside it.
  it('adds no role or tabindex to the row', () => {
    expect(SOURCE).not.toContain('role=')
    expect(SOURCE).not.toContain('tabIndex')
  })

  it('relies on Row passing native attributes through', () => {
    expect(PARTS).toContain('export function Row({ columns, archived, children, style, ...props })')
    expect(PARTS).toContain('{...props}')
  })
})
