// A list row that opens its record when it is clicked ANYWHERE, not only on
// the record's name (23 Sep 2026). The Accounts roster lost its expanding row
// to the company's own page, and what was left to click was the name — a
// strip of plain text a few characters wide, with the rest of the row doing
// nothing — so the office read the roster as unclickable. `LinkRow` makes the
// whole row the way in; these are the rules it clicks by, kept pure so they
// test without a DOM.
//
// The name stays a real <Link>: it is what the keyboard tabs to and what a
// screen reader announces, so the row itself carries no role and no tabindex
// (an interactive element wrapping other interactive elements is invalid, and
// a row that is also a button would swallow the buttons inside it).

// A click that lands on one of these belongs to that control, not to the row:
// the row's own buttons (Open, Archive, Delete), a link to somewhere else (a
// contact's company), or a form control.
export const ROW_CONTROLS =
  'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]'

/**
 * Whether a click on the row should open its record.
 *
 * @param {{ button?: number, insideControl?: boolean, selectedText?: string }} click
 *   `button` is the mouse button (0 = primary); `insideControl` whether the
 *   target sits in one of ROW_CONTROLS; `selectedText` the page's selection —
 *   someone dragging across an email address to copy it has not asked to
 *   leave the list.
 */
export function rowClickOpens({ button = 0, insideControl = false, selectedText = '' } = {}) {
  return button === 0 && !insideControl && String(selectedText ?? '').trim() === ''
}

/**
 * Where the record opens: a modified click asks for a new tab, the same
 * promise the name's own <Link> keeps.
 */
export function rowClickDestination({ metaKey = false, ctrlKey = false, shiftKey = false } = {}) {
  return metaKey || ctrlKey || shiftKey ? 'new-tab' : 'here'
}
