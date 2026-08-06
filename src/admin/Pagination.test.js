import { describe, it, expect, vi } from 'vitest'
import Pagination from './Pagination.jsx'

// No jsdom in this repo, so the component is called as the plain function it is
// and its returned element tree is walked. That works only because Pagination
// uses no hooks — keep it that way.

const walk = (node, visit) => {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  if (typeof node !== 'object') return visit(node)
  visit(node)
  walk(node.props?.children, visit)
}

const textOf = (tree) => {
  let text = ''
  walk(tree, (node) => {
    if (typeof node === 'string' || typeof node === 'number') text += node
  })
  return text
}

const buttonsOf = (tree) => {
  const found = []
  walk(tree, (node) => {
    if (node?.props?.onClick) found.push(node)
  })
  return found
}

const render = (props) => Pagination({ page: 1, totalPages: 1, onPage: () => {}, ...props })

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    // So a screen can drop it in unconditionally and a short list stays clean.
    expect(render({ totalPages: 1 })).toBeNull()
    expect(render({ totalPages: 0 })).toBeNull()
    expect(render({ totalPages: undefined })).toBeNull()
    expect(render({ totalPages: Number.NaN })).toBeNull()
  })

  it('renders once there is more than one page', () => {
    expect(render({ page: 1, totalPages: 2 })).not.toBeNull()
  })

  it('says where you are and how much there is', () => {
    const text = textOf(render({ page: 2, totalPages: 4, total: 1234, unit: 'rates' }))
    expect(text).toContain('1,234 rates')
    expect(text).toContain('page 2 of 4')
  })

  it('moves one page at a time', () => {
    const onPage = vi.fn()
    const [previous, next] = buttonsOf(render({ page: 2, totalPages: 4, onPage }))
    previous.props.onClick()
    next.props.onClick()
    expect(onPage.mock.calls).toEqual([[1], [3]])
  })

  it('deadens the button that would leave the range', () => {
    const [firstPrevious, firstNext] = buttonsOf(render({ page: 1, totalPages: 3 }))
    expect(firstPrevious.props.disabled).toBe(true)
    expect(firstNext.props.disabled).toBe(false)

    const [lastPrevious, lastNext] = buttonsOf(render({ page: 3, totalPages: 3 }))
    expect(lastPrevious.props.disabled).toBe(false)
    expect(lastNext.props.disabled).toBe(true)
  })

  it('deadens both while a mutation is in flight', () => {
    const busy = buttonsOf(render({ page: 2, totalPages: 4, busy: true }))
    expect(busy.map((button) => button.props.disabled)).toEqual([true, true])
  })

  it('clamps a page that has drifted past the end mid-reload', () => {
    const tree = render({ page: 9, totalPages: 3, onPage: () => {} })
    expect(textOf(tree)).toContain('page 3 of 3')
    // ...and Next stays dead rather than offering page 10.
    expect(buttonsOf(tree)[1].props.disabled).toBe(true)
  })
})
