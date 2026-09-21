// Sub-navigation for the Reporting section — Overview (/reporting, which also
// carries the insight) and the Report library (/reporting/library). Thin wrapper over the shared SectionTabs.
import { SectionTabs } from './sectionTabs.jsx'

const TABS = [
  { key: 'overview', label: 'Overview', to: '/reporting' },
  { key: 'library', label: 'Report library', to: '/reporting/library' },
]

export function ReportingTabs({ active }) {
  return <SectionTabs tabs={TABS} active={active} />
}
