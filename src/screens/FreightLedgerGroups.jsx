// The freight ledger's rows, grouped by scope — drawn on Supplier freight and
// again under the rate table on Supplier rates, so the two cannot drift. A
// range rate is keyed on the house's name (freight is set per house), so its
// group is labelled HOUSE; the API's scope value stays `range`.

import { c } from '../theme.js'
import { HeaderRow, Row, monoText, mutedText } from '../admin/parts.jsx'
import { SCOPE, categoryLabel, freightClassLabel, rateFigure } from './adminFreight.js'

const RATE_COLUMNS = '0.9fr 1.2fr 130px 1.8fr'

/** @param {string} kind */
export const scopeKindLabel = (kind) => (kind === SCOPE.range ? 'house' : kind)

export default function FreightLedgerGroups({ groups }) {
  return (
    <>
      <HeaderRow columns={RATE_COLUMNS} labels={['Category', 'Rate', 'Effective from', 'Note']} numeric={[1]} />
      {groups.map((group) => (
        <div key={group.key}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '11px 20px 9px',
              background: c.surface,
              borderBottom: `1px solid ${c.line}` }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: c.ink }}>{group.label}</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>
              {scopeKindLabel(group.kind)}
            </span>
            <span style={{ ...monoText, fontSize: 10.5, marginLeft: 'auto' }}>
              {group.rates.length} rate{group.rates.length === 1 ? '' : 's'}
            </span>
          </div>
          {group.rates.map((rate) => (
            <Row key={rate.id} columns={RATE_COLUMNS}>
              <span style={mutedText}>
                {categoryLabel(rate.category)}
                {/* A letter's rate says so; every-class rows stay as they were. */}
                {rate.freight_class ? ` · ${freightClassLabel(rate.freight_class)}` : ''}
              </span>
              <span style={{ ...monoText, textAlign: 'right' }}>{rateFigure(rate)}</span>
              <span style={{ ...monoText, fontSize: 11.5 }}>{rate.effective_from}</span>
              <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {rate.note || '—'}
              </span>
            </Row>
          ))}
        </div>
      ))}
    </>
  )
}
