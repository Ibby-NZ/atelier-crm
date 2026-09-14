// Sub-navigation for the Reporting section — Overview (/reporting), the
// Report library (/reporting/library) and Insight (/reporting/insight). Thin wrapper over the shared SectionTabs.
import { SectionTabs } from './sectionTabs.jsx'

const TABS = [
  { key: 'overview', label: 'Overview', to: '/reporting' },
  { key: 'library', label: 'Report library', to: '/reporting/library' },
  { key: 'insight', label: 'Insight', to: '/reporting/insight' },
]

export function ReportingTabs({ active }) {
  return <SectionTabs tabs={TABS} active={active} />
}
