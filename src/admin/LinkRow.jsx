// A <Row> that opens its record when clicked anywhere on it — see
// ./rowLink.js for why, and for the rules (tested there). The record's name
// inside the row stays a <Link> for the keyboard and for screen readers.

import { useHref, useNavigate } from 'react-router-dom'
import { Row } from './parts.jsx'
import { ROW_CONTROLS, rowClickDestination, rowClickOpens } from './rowLink.js'

export default function LinkRow({ to, columns, archived, style, children }) {
  const navigate = useNavigate()
  const href = useHref(to)

  const open = (event) => {
    const opens = rowClickOpens({
      button: event.button,
      insideControl: Boolean(event.target.closest?.(ROW_CONTROLS)),
      selectedText: window.getSelection?.()?.toString() ?? '',
    })
    if (!opens) return
    if (rowClickDestination(event) === 'new-tab') window.open(href, '_blank', 'noopener')
    else navigate(to)
  }

  return (
    <Row columns={columns} archived={archived} style={style} className="ab-rowhover" onClick={open}>
      {children}
    </Row>
  )
}
