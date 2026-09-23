// One supplier rate on its own page. "For any kind of data entry … they will
// open in their own individual page instead of a tabbed drop down" (the client,
// 23 Sep 2026) — the move the sales order and the supplier made before it: the
// list is the list, the rate is the desk. This block used to open INSIDE the row
// on /admin/price-lists, above a table of 19,500 that it pushed down the screen.
//
//   GET   /admin/price-list-items/:id                → { item }
//   PATCH /admin/price-list-items/:id                → { item }
//   GET   /admin/price-list-items/:id/price-history  → { changes }   (finance)
//   GET   /admin/price-list-items/:id/rate?as_at=    → { rate }      (finance)
//
// The detail read carries exactly what the list row did — the same projection,
// drop-detection flag and all — so nothing the expanded row drew is lost by
// reading one record instead of a page of them. It also answers for an ARCHIVED
// rate (the API filters nothing on the by-id read), which is what lets a link
// into the list's "Show archived" view open.
//
// Archive, restore and delete stay on the list: they are lifecycle verbs on a
// row, and the row is where the office reaches for them — and a delete here
// would leave the page standing on a record that is gone.
//
// Three rules came with the editor, unchanged:
//   - **A save that MOVES the wholesale rate must carry a `reason`.** The API
//     answers 422 without one (requireChangeReason, recorded against the old and
//     new rate in the price-history ledger), so the reason box sits beside the
//     rate. Restating the same rate needs nothing, which diffFields already
//     guarantees by dropping an unmoved field. See src/admin/priceChange.js.
//   - **The rate, its currency and the cloth's text are DIRECTOR-ONLY to edit**
//     (Userback 8287677) — locked, not removed, and only on this edit path; the
//     hand-keying page still declares every field. The lever is the declared
//     field list the save diffs over, not the styling. See
//     src/screens/recordLock.js, which also says why the API is still the gate.
//   - **`wholesale_rate` stays in the SUPPLIER's currency**, never NZD: the
//     pricing waterfall converts downstream, and rewriting it here would
//     double-convert.

import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import { RATE_PRICE_KEYS, withReason } from '../admin/priceChange.js'
import {
  asAtLookup,
  dayOf,
  isDenied,
  rateHistoryPath,
  rateMove,
  sourceLabel,
} from '../admin/priceHistory.js'
import { useCategories } from '../admin/useCategories.js'
import {
  ArchivedTag,
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import RateFields, { FlagTag } from './RateFields.jsx'
import { describeRate } from './adminLists.js'
import {
  ITEM_FIELDS,
  RATE_NOT_POSITIVE,
  priceListItemPath,
  rateListReturn,
} from './adminPriceListItems.js'
import {
  LOCKED_RATE_KEYS,
  RECORD_LOCK_NOTE,
  canEditRecords,
  editableFields,
  isFieldLocked,
} from './recordLock.js'

// The rate-history table: changed day, the move, the supplier's effective date,
// provenance, reason.
const HISTORY_COLUMNS = '90px 1.1fr 90px 1.4fr 1.6fr'

export default function AdminPriceListItem() {
  const { id } = useParams()
  // The list as it was left, when the page was opened from it; the bare list
  // after a deep link.
  const listRoute = rateListReturn(useLocation().state)
  const { message: toast, flash } = useToast()
  // The live vocabulary: the category select, and the subtitle's word for a
  // stored value — including one added since this build shipped.
  const { values: CATEGORIES, labelFor: categoryLabel } = useCategories()

  const [item, setItem] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [itemDraft, setItemDraft] = useState({})
  // The change-reason note. Not part of the draft: it is not a column and must
  // never be diffed against the record.
  const [reason, setReason] = useState('')

  const isDirector = canEditRecords(useAuth().user)
  // The list a SAVE works over. The draft is still built from the full
  // declaration below, so a locked box shows its value; this is what keeps the
  // value out of the patch.
  const editableItemFields = editableFields(ITEM_FIELDS, LOCKED_RATE_KEYS, isDirector)
  const locked = (key) => isFieldLocked(key, LOCKED_RATE_KEYS, isDirector)

  const load = useCallback(async () => {
    const body = await apiFetch(priceListItemPath(id))
    setItem(body.item ?? null)
    return body.item ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload: the
  // re-read is what the history below keys on, so a saved move appears in it.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this rate.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Re-seed the form from server truth whenever the record reloads.
  useEffect(() => {
    if (!item) return
    setItemDraft(draftFrom(item, ITEM_FIELDS))
  }, [item])

  const backLink = (
    <>
      <Link to={listRoute} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to supplier rates
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Rate not found"
        backTo={listRoute}
        backLabel="Back to supplier rates"
        message="That rate could not be found — it may have been deleted, or the link is out of date. A deleted rate comes back with the next supplier-file import."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Supplier rate" />
        <PanelNote>Loading rate…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Supplier rate" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!item) return null

  const setDraft = (key) => (event) => setItemDraft((d) => ({ ...d, [key]: event.target.value }))

  const saveItem = async () => {
    const diff = diffFields(item, itemDraft, editableItemFields)
    if (diff.error) return setError(diff.error)
    if (Object.hasOwn(diff.patch, 'wholesale_rate') && diff.patch.wholesale_rate <= 0) {
      return setError(RATE_NOT_POSITIVE)
    }
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    // A moved rate must carry its reason or the API 422s; an unmoved one must
    // not be nagged for a note about a change that is not happening.
    const noted = withReason(diff.patch, reason, RATE_PRICE_KEYS)
    if (noted.error) return setError(noted.error)
    const ok = await run(
      () => apiSend('PATCH', priceListItemPath(item.id), noted.patch),
      'Rate saved.'
    )
    // The note belongs to the change it explained, not to the next edit.
    if (ok) setReason('')
  }

  const subtitle = [categoryLabel(item.category), item.description || item.product_range]
    .filter(Boolean)
    .join(' · ')

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {describeRate(item) ?? 'Supplier rate'}
            {item.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={subtitle || undefined}
        right={
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>
              {item.wholesale_rate ?? '—'} {item.currency}
            </span>
            <FlagTag item={item} />
          </div>
        }
      />

      {/* `overflow: clip`, not the panel's hidden: hidden makes the panel a
          scroll container and the sticky Save bar below would stop sticking. */}
      <section style={{ ...panel, overflow: 'clip', marginTop: 30 }}>
        <PanelHead label="Rate" />
        {/* The same stack the row expansion held, in the same order — the lock
            note, the form, the rate history, and the Save bar. */}
        <div style={{ padding: '20px 20px 0' }}>
          {!isDirector && (
            <p style={{ ...mutedText, margin: '0 0 16px', lineHeight: 1.6 }}>
              {RECORD_LOCK_NOTE}
            </p>
          )}
          <RateFields
            values={itemDraft}
            onChange={setDraft}
            disabled={busy}
            record={item}
            locked={locked}
            categories={CATEGORIES}
            categoryLabel={categoryLabel}
          >
            {/* A note about a rate move nobody can make would be a box that
                cannot do anything: the rate above is read-only without the
                director role, so diffFields never names it and the API never
                asks. */}
            {isDirector && (
              <Field
                label="Reason for the rate change"
                hint="Needed only when the wholesale rate moves — recorded against the old and new rate in the history."
              >
                <input
                  value={reason}
                  placeholder='e.g. "supplier increase"'
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            )}
          </RateFields>

          <RateHistory item={item} />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ position: 'sticky', bottom: 0, zIndex: 3, marginTop: 18, padding: '12px 0', display: 'flex', gap: 8, background: c.panel, borderTop: `1px solid ${c.line}` }}>
            <GhostButton tone="accent" disabled={busy} onClick={saveItem}>
              Save rate
            </GhostButton>
            {/* Cancel is what Close was on the row: it leaves without writing. */}
            <Link to={listRoute} style={{ textDecoration: 'none' }}>
              <GhostButton disabled={busy}>Cancel</GhostButton>
            </Link>
          </div>
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// One rate's recorded history plus the as-at lookup, under the form.
//
// FINANCE-GATED, unlike everything else on this page: a wholesale rate is
// Atelier's buy side, so both reads sit behind `can_view_finance` and a login
// without it gets a 403 whose message says what was needed. That sentence is
// rendered as the standard masked note — muted, not an error — the same
// treatment the report library gives a masked table; the lookup is hidden with
// it, because it sits behind the same gate.
//
// Keyed on the ITEM OBJECT, not the id: every save re-reads the rate, the
// re-read record is a fresh object, and refetching then is what keeps the panel
// showing the change that was just saved (the reload-not-reconcile rule).
function RateHistory({ item }) {
  const [history, setHistory] = useState({ status: 'loading', changes: [], note: '' })
  const [asAt, setAsAt] = useState('')
  const [lookup, setLookup] = useState({ status: 'idle', rate: null, note: '' })

  useEffect(() => {
    let active = true
    setHistory({ status: 'loading', changes: [], note: '' })
    apiFetch(rateHistoryPath(item.id))
      .then((body) => {
        if (active) setHistory({ status: 'ready', changes: body.changes ?? [], note: '' })
      })
      .catch((err) => {
        if (!active) return
        setHistory({
          status: isDenied(err) ? 'denied' : 'error',
          changes: [],
          note: messageOf(err, 'Could not load the rate history.'),
        })
      })
    return () => {
      active = false
    }
  }, [item])

  const lookUp = async () => {
    const built = asAtLookup(item.id, asAt)
    if (built.error) return setLookup({ status: 'error', rate: null, note: built.error })
    setLookup({ status: 'loading', rate: null, note: '' })
    try {
      const body = await apiFetch(built.path)
      setLookup({ status: 'ready', rate: body.rate ?? null, note: '' })
    } catch (err) {
      // A 404 here is an ANSWER, not a fault: the API names which kind of miss
      // it is (the rate has never moved, or the ledger starts later). Only a
      // network drop or a real fault is drawn as an error.
      setLookup({
        status: isDenied(err) || err?.status === 404 ? 'noted' : 'error',
        rate: null,
        note: messageOf(err, 'Could not look that rate up.'),
      })
    }
  }

  return (
    <div style={{ marginTop: 26 }}>
      <span style={sectionLabel}>Rate history</span>
      <div style={{ ...panel, marginTop: 12, background: c.surface }}>
        {history.status === 'loading' && <PanelNote>Loading rate history…</PanelNote>}
        {history.status === 'denied' && <PanelNote>{history.note}</PanelNote>}
        {history.status === 'error' && <PanelNote tone="danger">{history.note}</PanelNote>}
        {history.status === 'ready' && history.changes.length === 0 && (
          <PanelNote>
            No recorded changes — the ledger starts the first time this rate moves.
          </PanelNote>
        )}
        {history.status === 'ready' && history.changes.length > 0 && (
          <>
            <HeaderRow
              columns={HISTORY_COLUMNS}
              labels={['Changed', 'Rate', 'Effective', 'Source', 'Reason']}
              numeric={[1]}
            />
            {history.changes.map((change) => (
              <Row key={change.id} columns={HISTORY_COLUMNS}>
                <span style={{ ...monoText, fontSize: 11.5 }}>{dayOf(change.changed_at)}</span>
                <span style={{ ...monoText, textAlign: 'right' }}>{rateMove(change)}</span>
                <span style={{ ...monoText, fontSize: 11.5 }}>
                  {change.date_effective ?? '—'}
                </span>
                <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sourceLabel(change)}
                </span>
                <span style={{ ...mutedText, minWidth: 0 }}>{change.reason ?? '—'}</span>
              </Row>
            ))}
          </>
        )}
        {history.status === 'ready' && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '14px 20px' }}>
              <span style={{ ...mutedText, whiteSpace: 'nowrap' }}>What was the rate on</span>
              <input
                type="date"
                value={asAt}
                disabled={lookup.status === 'loading'}
                onChange={(e) => {
                  setAsAt(e.target.value)
                  // A new date makes the old answer a claim about the wrong day.
                  setLookup({ status: 'idle', rate: null, note: '' })
                }}
                aria-label="Look up the rate as at"
                style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 170 }}
              />
              <GhostButton disabled={lookup.status === 'loading'} onClick={lookUp}>
                Look up
              </GhostButton>
            </div>
            {lookup.status === 'noted' && (
              <div style={{ padding: '0 20px 16px', ...mutedText, lineHeight: 1.55 }}>{lookup.note}</div>
            )}
            {lookup.status === 'error' && (
              <ErrorLine style={{ padding: '0 20px 16px' }}>{lookup.note}</ErrorLine>
            )}
            {lookup.status === 'ready' && lookup.rate && (
              <div style={{ padding: '0 20px 16px', fontSize: 13, color: c.ink, fontFamily: font.ui, lineHeight: 1.6 }}>
                <span style={{ fontFamily: font.mono }}>
                  {lookup.rate.wholesale_rate ?? '—'} {lookup.rate.currency}
                </span>{' '}
                as at {lookup.rate.as_at} — set {dayOf(lookup.rate.changed_at)},{' '}
                {sourceLabel(lookup.rate)}
                {lookup.rate.reason ? ` · ${lookup.rate.reason}` : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
