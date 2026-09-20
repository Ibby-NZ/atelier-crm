// The row verbs (client, Sept 2026): "Edit / Archive / Delete in tables should
// be icons, obviously different, with the label as a tooltip"; Approve is a
// muted green fill with white type, Remove a burgundy fill — "apply to all".
//
// A button LABEL decides both. `verbTone(label)` is read by every button
// primitive (GhostButton, PrimaryButton, SecondaryButton, the dialog's own
// buttons) and lands as `data-tone`, which index.css colours: neutral white,
// positive green, danger burgundy. `verbIcon(label)` is read by GhostButton
// alone — the row verb — and turns a known label into a 32px icon button with
// the label as its accessible name and tooltip. A label not in the map stays
// text (Save, Add, Search, Import …).
import { c } from '../theme.js'

const S = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const VERB_ICONS = {
  Edit: <S><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5l3 3" /></S>,
  Close: <S><path d="M6 6l12 12M18 6L6 18" /></S>,
  Review: <S><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></S>,
  Archive: <S><path d="M3 5h18v4H3z" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 13h4" /></S>,
  Restore: <S><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></S>,
  Delete: <S><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></S>,
  'Delete form': <S><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></S>,
  Remove: <S><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8" /></S>,
  Approve: <S><path d="M5 12.5l4.5 4.5L19 7" /></S>,
  Decline: <S><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></S>,
  Unapprove: <S><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></S>,
  Disconnect: <S><path d="M12 3v9" /><path d="M6.5 7.5a7.5 7.5 0 1 0 11 0" /></S>,
  Up: <S><path d="M6 15l6-6 6 6" /></S>,
  Down: <S><path d="M6 9l6 6 6-6" /></S>,
}

const POSITIVE = new Set(['Approve', 'Restore', 'Confirm', 'Mark paid', 'Mark shipped', 'Accept'])
const DANGER = new Set(['Delete', 'Delete form', 'Remove', 'Decline', 'Disconnect', 'Cancel order', 'Reject', 'Discard'])

export function verbTone(label) {
  if (typeof label !== 'string') return undefined
  const key = label.trim()
  if (POSITIVE.has(key)) return 'positive'
  if (DANGER.has(key)) return 'danger'
  return undefined
}

export function verbIcon(label) {
  return typeof label === 'string' ? VERB_ICONS[label.trim()] ?? null : null
}

// the colour a positive / danger button paints, for anything drawn by hand
export const TONE_COLOUR = { positive: c.sage, danger: 'var(--burgundy)' }
