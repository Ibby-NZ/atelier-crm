// Compatibility boundary for existing screens. Individual pages now live in
// the workspace sidebar; their shared create actions live in PageHeader.
// Keep exports stable while screen-specific work lands separately.
export * from './sections.js'

export function SectionTabs() {
  return null
}
