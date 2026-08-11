// The correction panel for a staged Dynamics-365 record — the one write surface
// on the four otherwise read-only Dynamics screens. Mounted from the two detail
// screens (ClientAccount, SalesOrder) and inline from a row on the two
// list-only ones (PriceLists, Reserves); it lives here beside LegacyImportPanel,
// the existing precedent for a shared write surface on those screens.
//
// Every rule is in ../screens/dynamicsCorrections.js — this repo has no jsdom,
// so a .jsx cannot be tested and anything that is a decision belongs in the
// plain .js beside it. What is left here is layout and five pieces of state.
//
// THE PANEL FETCHES ITS OWN DETAIL RECORD from { entity, guid } and never takes
// a `record` prop. `override.stale_fields`, `override.base` and the full custom
// field map come from GET /admin/legacy/:entity/:guid ONLY — the list read
// carries none of them — so a panel fed a list row could not show the staleness
// queue at all. Owning the fetch gives ONE mount shape for both detail screens
// and list rows; the price is one duplicate primary-key GET on a detail screen,
// which is invisible.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { c, font, radius } from '../theme.js'
import { apiFetch, apiSend } from '../lib/api.js'
import { draftFrom } from '../admin/drafts.js'
import {
  ArchivedTag,
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  cellInput,
  inputStyle,
  monoText,
  mutedText,
  messageOf,
  panel,
  readOnlyInput,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import { useAccess, useAuth } from '../auth/AuthContext.jsx'
import {
  correctionBody,
  customDraftFrom,
  fieldState,
  panelFields,
  recordPath,
  restorePath,
} from '../screens/dynamicsCorrections.js'

const BADGE = {
  corrected: { text: 'Corrected', colour: c.accent },
  stale: { text: 'Dynamics moved', colour: c.clay },
}

export default function DynamicsCorrection({ entity, guid, onSaved }) {
  // The REAL can_view_finance, derived from /auth/me's report_access — never the
  // demo capability map in src/auth/roles.js, which would disagree with the
  // API's 403.
  const { finance } = useAccess()
  // Restore is DIRECTOR-only at the API, and the CRM role maps backoffice and
  // director to the same capability set — so the API role is the only thing that
  // can tell them apart, exactly as LegacyImportPanel gates its director-only
  // push. Same rule as the locked commercial fields: never offer a control whose
  // answer is a guaranteed 403.
  const isDirector = useAuth().user?.apiRole === 'director'
  const fields = useMemo(() => panelFields(entity, { finance }), [entity, finance])

  const [record, setRecord] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState({})
  const [revert, setRevert] = useState([])
  const [custom, setCustom] = useState([])
  const [newField, setNewField] = useState({ key: '', value: '' })
  const toast = useToast()

  // StrictMode double-mounts and a guid can change under an open panel, so a
  // late response must not overwrite a newer one. A counter rather than the
  // usual per-effect flag, because `load` is also the post-save reload.
  const runId = useRef(0)

  // The counter orders RESPONSES, which is not enough on its own. `useMutation`
  // captures `reload` at click time, so a save that outlives a navigation still
  // holds the OLD `load` — which would fetch the OLD guid and, by taking the
  // newest counter value, RETIRE the correct load rather than lose to it. The
  // panel would then show record A while its `guid` prop points at B, and the
  // next Save would write A's diff onto B: a durable override on the wrong
  // record, which survives every re-import. So a stale request is refused
  // BEFORE it is issued and before it touches the counter.
  const guidRef = useRef(guid)

  // A REJECTION is a state change like any other, so the counter is checked as
  // the first line of BOTH paths: this panel is reused across rows on the list
  // screens, and a slow failure for row A would otherwise replace a
  // correctly-loaded panel for row B with an error. `load` therefore owns its
  // whole failure surface and never rejects — which is also what makes every
  // bare `load()` call site (the effect, Discard changes) safe.
  const load = useCallback(async () => {
    if (guid !== guidRef.current) return
    const id = ++runId.current
    try {
      const body = await apiFetch(recordPath(entity, guid))
      if (id !== runId.current) return
      const next = body?.record ?? null
      setRecord(next)
      // Re-seeded from server truth on every load: overridden_fields,
      // custom_fields and stale_fields are all server-generated, and a stale
      // draft string would immediately overwrite the figure that was just saved.
      setDraft(draftFrom(next ?? {}, fields))
      setRevert([])
      setCustom(customDraftFrom(next))
      setNewField({ key: '', value: '' })
      setStatus(next ? 'ready' : 'error')
      setLoadError(next ? '' : 'That record is not in the Dynamics mirror.')
    } catch (err) {
      if (id !== runId.current) return
      setLoadError(messageOf(err, 'That record could not be loaded.'))
      // A failed REFRESH is not a failed load. Collapsing the panel to an error
      // note would throw away a record that is still on screen and still
      // correct — and after a successful save it reads as "the save failed",
      // which on a detail screen leaves no way back but a page reload. Only the
      // first load, with nothing to fall back to, is an error state.
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'))
    }
  }, [entity, guid, fields])

  useEffect(() => {
    // Set before the first load of this guid, so any load still in flight for
    // the previous one refuses itself rather than retiring this one.
    guidRef.current = guid
    setStatus('loading')
    setLoadError('')
    load()
  }, [load, guid])

  const reload = useCallback(async () => {
    await load()
    if (onSaved) await onSaved()
  }, [load, onSaved])

  const { busy, error, setError, run } = useMutation({ reload, flash: toast.flash })

  const baseDraft = useMemo(() => draftFrom(record ?? {}, fields), [record, fields])
  const setValue = (key) => (event) =>
    setDraft((d) => ({ ...d, [key]: event.target.value }))
  const toggleRevert = (key) =>
    setRevert((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]))

  const save = () => {
    const built = correctionBody(record, fields, { draft, revert, custom })
    if (built.error) return setError(built.error)
    // The API 400s an empty PATCH, and the test spans all four verbs — a lone
    // revert is a real request whose diff is legitimately empty.
    if (built.empty) return toast.flash('No changes to save.')
    run(() => apiSend('PATCH', recordPath(entity, guid), built.body), 'Correction saved.')
  }

  const addField = () => {
    setError('')
    setCustom((rows) => [...rows, { key: newField.key.trim(), value: newField.value }])
    setNewField({ key: '', value: '' })
  }

  if (status !== 'ready') {
    return (
      <section style={panel}>
        <PanelHead label="Correct this record" />
        <PanelNote tone={status === 'error' ? 'danger' : 'muted'}>
          {status === 'error' ? loadError : 'Loading the correction record…'}
        </PanelNote>
      </section>
    )
  }

  const suppressed = Boolean(record.archived_at)
  const base = record.override?.base ?? {}

  return (
    <section style={panel}>
      <PanelHead
        label="Correct this record"
        right={
          <span style={mutedText}>
            {record.origin === 'local' ? 'Raised in the back office' : 'From Dynamics'}
            {suppressed && <ArchivedTag />}
          </span>
        }
      />

      {/* A refresh that failed while a good record is on screen. The record
          below is the last one the server confirmed, so it is shown rather than
          thrown away — but it may no longer be what the server holds, and the
          reader has to know that before saving again. */}
      {loadError && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}>
          <PanelNote tone="danger">
            {loadError} Showing the last confirmed version — reopen this record before saving again.
          </PanelNote>
        </div>
      )}

      {suppressed && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.line}` }}>
          <PanelNote tone="danger">
            This record is suppressed from the Dynamics browser. The suppression survives every
            re-import — restore it to bring it back.
          </PanelNote>
          <GhostButton
            tone="accent"
            disabled={busy || !isDirector}
            style={{ marginLeft: 20 }}
            onClick={() => run(() => apiSend('POST', restorePath(entity, guid), {}), 'Record restored.')}
          >
            Restore
          </GhostButton>
          {/* Drawn disabled rather than hidden: the note above says restoring is
              the way back, so a missing button would read as no way back at all. */}
          {!isDirector && (
            <span style={{ ...mutedText, marginLeft: 10 }}>Needs the director role.</span>
          )}
        </div>
      )}

      <div style={{ padding: '20px 20px 24px' }}>
        <p style={{ ...mutedText, margin: '0 0 18px', lineHeight: 1.6, maxWidth: 640 }}>
          A correction is stored beside the Dynamics row, not on it, so it survives every re-import.
          Clearing a field overrides it to empty; <strong>Revert</strong> is the only way back to
          what Dynamics says.
        </p>

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
          className="r-grid-2"
        >
          {fields.map((field) => {
            const state = fieldState(record, field.key)
            const badge = BADGE[state]
            const reverting = revert.includes(field.key)
            const dirty = draft[field.key] !== baseDraft[field.key]
            return (
              // The Revert button sits OUTSIDE the Field: a Field renders a
              // <label>, and a label may not contain an interactive element
              // other than its own control.
              <div key={field.key} style={{ minWidth: 0 }}>
              <Field
                label={
                  <>
                    {field.label}
                    {badge && (
                      <span style={{ color: badge.colour, marginLeft: 7 }}>{badge.text}</span>
                    )}
                    {dirty && !reverting && (
                      <span style={{ color: c.accent, marginLeft: 6 }}>•</span>
                    )}
                  </>
                }
                hint={hintFor(field, state, base, record, reverting)}
              >
                <FieldInput
                  field={field}
                  value={draft[field.key] ?? ''}
                  disabled={busy || reverting || field.locked}
                  onChange={setValue(field.key)}
                />
              </Field>
              {badge && !field.locked && (
                <GhostButton
                  tone={reverting ? 'accent' : 'ink'}
                  disabled={busy}
                  style={{ marginTop: 8 }}
                  onClick={() => toggleRevert(field.key)}
                >
                  {reverting ? 'Keep the correction' : 'Revert to Dynamics'}
                </GhostButton>
              )}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 28 }}>
          <span style={sectionLabel}>Custom fields</span>
          <p style={{ ...mutedText, margin: '8px 0 14px', lineHeight: 1.6, maxWidth: 640 }}>
            Fields Dynamics has no column for. Leave a value blank to keep the field with no value;
            remove the row to drop it entirely.
          </p>

          {custom.length === 0 && (
            <div style={{ ...mutedText, fontStyle: 'italic' }}>None on this record.</div>
          )}

          {custom.map((row, index) => (
            <div
              key={row.key}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) auto',
                gap: 12,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span style={monoText}>{row.key}</span>
              <input
                value={row.value}
                disabled={busy}
                style={cellInput}
                onChange={(event) => {
                  const next = event.target.value
                  setCustom((rows) => rows.map((r, i) => (i === index ? { ...r, value: next } : r)))
                }}
              />
              <GhostButton
                tone="danger"
                disabled={busy}
                onClick={() => setCustom((rows) => rows.filter((_, i) => i !== index))}
              >
                Remove
              </GhostButton>
            </div>
          ))}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) auto',
              gap: 12,
              alignItems: 'center',
              marginTop: 14,
            }}
          >
            <input
              value={newField.key}
              disabled={busy}
              placeholder="field_name"
              style={{ ...cellInput, fontFamily: font.mono }}
              onChange={(event) => setNewField((f) => ({ ...f, key: event.target.value }))}
            />
            <input
              value={newField.value}
              disabled={busy}
              placeholder="Value"
              style={cellInput}
              onChange={(event) => setNewField((f) => ({ ...f, value: event.target.value }))}
            />
            {/* The key is not checked here: correctionBody refuses it on save in
                the API's own wording, which keeps one validation site. */}
            <GhostButton disabled={busy || newField.key.trim() === ''} onClick={addField}>
              Add field
            </GhostButton>
          </div>
        </div>

        <ErrorLine style={{ marginTop: 16 }}>{error}</ErrorLine>

        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <GhostButton tone="accent" disabled={busy} onClick={save}>
            Save correction
          </GhostButton>
          <GhostButton disabled={busy} onClick={() => load()}>
            Discard changes
          </GhostButton>
        </div>
      </div>

      <ToastLine message={toast.message} />
    </section>
  )
}

// --- sub-components (house style: they live at the bottom of the file) ----

// A tri-state boolean is a select, never a checkbox: the column is
// true/false/null and "not set" is a real state a tick box cannot draw.
function FieldInput({ field, value, disabled, onChange }) {
  const style = {
    ...(field.locked ? readOnlyInput : inputStyle),
    ...(field.kind === 'numeric' ? { fontFamily: font.mono } : null),
    borderRadius: radius.sm,
  }
  if (field.kind === 'tribool') {
    return (
      <select value={value} disabled={disabled} onChange={onChange} style={style}>
        <option value="">Not set</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder={field.kind === 'naive' ? 'YYYY-MM-DD HH:MM' : undefined}
      style={style}
    />
  )
}

// The panel never claims to show what Dynamics says NOW: the merged read returns
// the CORRECTED value, and `raw` is keyed by D365 logical name with no mapping
// on this side, so the live upstream value is simply not served. Naming the
// drift and quoting the snapshot is honest; inventing a current value would be a
// lie about the exact field the office is being asked to adjudicate. Revert is
// the route back to the live value.
function hintFor(field, state, base, record, reverting) {
  if (field.locked) return 'Needs the finance permission to edit.'
  if (reverting) return 'Will be handed back to Dynamics when you save.'
  if (state !== 'stale') return undefined
  const was = base?.[field.key]
  return `Dynamics said “${was == null ? '—' : String(was)}” when this was corrected, and has changed since. Your correction: “${record[field.key] == null ? '—' : String(record[field.key])}”. Revert to see what it says now.`
}
