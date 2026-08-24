// The trade-account picker — the layout half of ./tradeAccounts.js, shared by
// the check-out forms (register and scanner) and the outstanding-loans filter.
//
// Search-on-demand rather than a preloaded <select>: the roster is unbounded
// (every linked D365 account) where the showroom and supplier pickers read a
// small table whole. The pattern is AdminOrderNew's client search, with one
// difference forced by where this sits: the scanner's check-out form is a
// <form>, and a form cannot nest another, so the search is a type="button"
// click plus an Enter keydown that stops the outer form submitting a half
// -filled check-out when someone was only searching.
//
// Selection is ALWAYS optional. `holder_name` stands alone for a walk-in; the
// component only offers the link, and offers Clear as soon as one is made.

import { useState } from 'react'
import { c, font } from '../theme.js'
import { safeFetch } from '../lib/api.js'
import { GhostButton, inputStyle, messageOf } from './parts.jsx'
import { accountOption, tradeAccountSearchPath } from './tradeAccounts.js'

/**
 * @param {{
 *   value: { id: number|string, name?: string }|null,  // the current selection
 *   onPick: (option: {id, name, email}) => void,
 *   onClear: () => void,
 *   disabled?: boolean,
 *   label?: string|null,   // null renders no label row (the filter strip has its own rhythm)
 *   hint?: string,
 *   compact?: boolean,     // filter-row sizing (34px), like the list filters beside it
 * }} props
 */
export default function TradeAccountPicker({
  value = null,
  onPick,
  onClear,
  disabled = false,
  label = 'Trade account',
  hint,
  compact = false,
}) {
  const [term, setTerm] = useState('')
  // null = no search yet; [] = a search that matched nothing. The two render
  // differently, so they must not collapse into one falsy value.
  const [hits, setHits] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  const boxStyle = compact ? { ...inputStyle, height: 34, fontSize: 12.5 } : inputStyle

  const search = async () => {
    setSearching(true)
    setError('')
    // safeFetch never throws: a failed search leaves the field usable — the
    // holder name still works standalone, so the picker must not take the form
    // down with it.
    const { data, error: err } = await safeFetch(tradeAccountSearchPath(term))
    setSearching(false)
    if (err) {
      setHits(null)
      setError(messageOf(err, 'Could not search trade accounts.'))
      return
    }
    setHits((data?.trade_accounts ?? []).map(accountOption))
  }

  const pick = (option) => {
    onPick(option)
    setHits(null)
    setTerm('')
    setError('')
  }

  const clear = () => {
    onClear()
    setHits(null)
    setTerm('')
    setError('')
  }

  // Enter searches instead of submitting the surrounding check-out form.
  const keyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!disabled && !searching) search()
    }
  }

  return (
    <div style={{ minWidth: 0 }}>
      {label && (
        <span
          style={{
            display: 'block',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: c.muted,
            marginBottom: 7,
          }}
        >
          {label}
        </span>
      )}

      {value?.id ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              ...boxStyle,
              display: 'inline-flex',
              alignItems: 'center',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: c.surface,
            }}
          >
            {value.name || `Account ${value.id}`}
          </span>
          <GhostButton disabled={disabled} onClick={clear}>
            Clear
          </GhostButton>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={keyDown}
              disabled={disabled}
              placeholder="Company name"
              aria-label={label || 'Trade account'}
              style={{ ...boxStyle, flex: 1, minWidth: 0 }}
            />
            <GhostButton disabled={disabled || searching} onClick={search}>
              {searching ? 'Finding…' : 'Find'}
            </GhostButton>
          </div>
          {hits !== null && hits.length === 0 && (
            <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: c.muted }}>
              No linked trade account matches that. The name alone is fine for a walk-in.
            </span>
          )}
          {hits !== null && hits.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
              {hits.map((option) => (
                <GhostButton
                  key={option.id}
                  disabled={disabled}
                  onClick={() => pick(option)}
                  style={{ textAlign: 'left' }}
                >
                  {option.name}
                  {option.email && (
                    <span style={{ color: c.muted, fontFamily: font.mono, fontSize: 11 }}>
                      {' '}
                      · {option.email}
                    </span>
                  )}
                </GhostButton>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: c.danger }}>
          {error}
        </span>
      )}
      {hint && !error && (
        <span
          style={{ display: 'block', marginTop: 6, fontSize: 11, color: c.muted, lineHeight: 1.5 }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}
