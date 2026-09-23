// The image field — a Strapi-style media input for every column that holds a
// storefront image (the five in IMAGE_FIELDS, ./imageUpload.js). It replaces the
// bare "paste an address" input those columns had.
//
// Three states in one frame:
//   empty      a drop zone — drop a file on it, or click it to browse
//   uploading  the local preview, a progress bar, Cancel
//   set        an asset card — preview, file name, dimensions, Replace / Open /
//              Remove; a file dropped on the card replaces the image
// plus "Paste a link instead", which is the old input, for an image that is
// already hosted somewhere (and for as long as the API has no upload route).
//
// **The value is still the address.** An upload ends in onChange(url), exactly
// what typing the address used to do, so each screen keeps its field
// declaration, its draft and its Save button: nothing reaches the record until
// the person saves, and "Not saved yet" says so. `savedValue` is what the record
// holds now; leave it out on a create form, where nothing is saved yet anyway.
//
// **Not a <label>.** Field wraps its control in one, and a label holding a drop
// zone, three buttons and a file input would forward clicks between them — so
// this is a labelled group drawn with Field's own label and hint styles.
//
// `compact` is the table-cell form the colourway rows use: a 34px thumbnail and
// the verbs, no drop-zone box and no visible label (pass `label` anyway — it
// becomes the group's accessible name). `readOnly` is the record lock: the image
// shows, nothing changes it.
//
// No test renders this (there is no jsdom here); every decision it makes is a
// function in ./imageUpload.js, which is tested.

import { useEffect, useId, useRef, useState } from 'react'
import { c, font } from '../theme.js'
import { IconExternal, IconImage, IconUpload } from '../components/icons.jsx'
import { parseUrl } from './drafts.js'
import {
  ErrorLine,
  GhostButton,
  cellInput,
  fieldHint,
  fieldLabel,
  inputStyle,
  mutedText,
  readOnlyInput,
} from './parts.jsx'
import {
  MAX_IMAGE_BYTES,
  describeImage,
  fileNameFromUrl,
  formatBytes,
  imageField,
  uploadImage,
} from './imageUpload.js'

// Transparency shows as the usual checks; a white-on-nothing logo is drawn on
// the dark ground instead, or it would vanish into them.
const GROUNDS = {
  light: `repeating-conic-gradient(${c.surfaceDeep} 0% 25%, ${c.paper} 0% 50%) 50% / 14px 14px`,
  dark: c.inverse,
}

export default function ImageField({
  field,
  label,
  hint,
  value,
  onChange,
  savedValue,
  disabled = false,
  readOnly = false,
  compact = false,
  style,
}) {
  const spec = imageField(field)
  const labelId = useId()
  const pickerRef = useRef(null)
  const controllerRef = useRef(null)
  const [mode, setMode] = useState('upload') // upload | link
  const [upload, setUpload] = useState(null) // { name, preview, progress }
  const [uploaded, setUploaded] = useState({ url: null, bytes: 0 })
  const [loaded, setLoaded] = useState({ src: null })
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  // Leaving the screen mid-upload cancels it rather than landing an address in
  // a draft nobody is looking at.
  useEffect(() => () => controllerRef.current?.abort(), [])

  const current = (value ?? '').trim()
  const busy = disabled || upload != null
  const unsaved = savedValue !== undefined && current !== (savedValue ?? '').trim()

  const start = async (file) => {
    const controller = new AbortController()
    controllerRef.current = controller
    const preview = URL.createObjectURL(file)
    setError('')
    setMode('upload')
    setUpload({ name: file.name, preview, progress: 0 })
    try {
      const { url, media } = await uploadImage(file, field, {
        signal: controller.signal,
        onProgress: (progress) => setUpload((now) => (now ? { ...now, progress } : now)),
      })
      setUploaded({ url, bytes: Number(media?.size) || file.size })
      onChange(url)
    } catch (err) {
      if (!err.aborted) setError(err.message)
    } finally {
      URL.revokeObjectURL(preview)
      if (controllerRef.current === controller) controllerRef.current = null
      setUpload(null)
    }
  }

  const pick = (files) => {
    const file = files?.[0]
    if (file && !busy && !readOnly) start(file)
  }
  const browse = () => pickerRef.current?.click()
  const cancel = () => controllerRef.current?.abort()
  const remove = () => {
    setError('')
    onChange('')
  }

  // A file dropped here while the field cannot take it (mid-upload, locked) is
  // still swallowed: the browser's default would open the image in place of the
  // CRM and lose the unsaved form around it.
  const accepting = !busy && !readOnly
  const dropTarget = {
    onDragOver: (event) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = accepting ? 'copy' : 'none'
      if (accepting && !dragging) setDragging(true)
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
    },
    onDrop: (event) => {
      event.preventDefault()
      setDragging(false)
      if (accepting) pick(event.dataTransfer?.files)
    },
  }

  // What the card says under the name: the size once the preview has loaded,
  // the byte count only for a file uploaded here (a typed address has none).
  const shown = loaded.src === current ? loaded : null
  const meta = shown?.broken
    ? 'This address did not load as an image.'
    : shown
      ? describeImage({
          width: shown.width,
          height: shown.height,
          name: fileNameFromUrl(current),
          bytes: uploaded.url === current ? uploaded.bytes : 0,
        })
      : 'Loading preview…'
  const onLoad = (event) =>
    setLoaded({
      src: current,
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    })
  const onError = () => setLoaded({ src: current, broken: true })
  // Only an http(s) address becomes a link: colourway and hi-res columns are
  // not URL-checked by the API, and a stored `javascript:` must not be clickable.
  const openable = parseUrl(current).value != null

  const picker = (
    <input
      ref={pickerRef}
      type="file"
      accept={spec.types.join(',')}
      hidden
      tabIndex={-1}
      onChange={(event) => {
        pick(event.target.files)
        // Cleared so choosing the same file again (after a failure) still fires.
        event.target.value = ''
      }}
    />
  )

  const linkToggle = !readOnly && !upload && (
    <LinkToggle
      disabled={disabled}
      onClick={() => {
        setError('')
        setMode((now) => (now === 'link' ? 'upload' : 'link'))
      }}
    >
      {mode === 'link' ? 'Upload a file instead' : 'Paste a link instead'}
    </LinkToggle>
  )
  const unsavedNote = unsaved && !upload && (
    <span style={{ fontSize: 12, fontWeight: 500, color: c.accentDeep }}>Not saved yet.</span>
  )

  if (compact) {
    return (
      <div role="group" aria-label={label} style={{ minWidth: 0, ...style }} {...dropTarget}>
        {picker}
        {mode === 'link' && !readOnly ? (
          <input
            value={value ?? ''}
            disabled={disabled}
            autoFocus
            onChange={(event) => onChange(event.target.value)}
            style={cellInput}
            placeholder="https://…"
            aria-label={label}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              outline: dragging ? `1px dashed ${c.accent}` : 'none',
              outlineOffset: 3,
            }}
          >
            <Thumb
              src={upload?.preview ?? current}
              ground={spec.ground}
              size={34}
              onLoad={upload ? undefined : onLoad}
              onError={upload ? undefined : onError}
              broken={!upload && shown?.broken}
            />
            {upload ? (
              <>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Bar progress={upload.progress} label={`Uploading ${upload.name}`} />
                </span>
                <GhostButton onClick={cancel}>Cancel</GhostButton>
              </>
            ) : (
              !readOnly && (
                <>
                  <GhostButton disabled={disabled} onClick={browse} aria-label={`${current ? 'Replace' : 'Upload'} the ${label}`}>
                    {current ? 'Replace' : 'Upload'}
                  </GhostButton>
                  {current && (
                    <GhostButton disabled={disabled} onClick={remove} aria-label={`Remove the ${label}`}>
                      Remove
                    </GhostButton>
                  )}
                </>
              )
            )}
          </div>
        )}
        {(linkToggle || unsavedNote) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 5 }}>
            {linkToggle}
            {unsavedNote}
          </div>
        )}
        <ErrorLine style={{ marginTop: 4, fontSize: 12 }}>{error}</ErrorLine>
      </div>
    )
  }

  let body
  if (mode === 'link' && !readOnly) {
    body = (
      <input
        value={value ?? ''}
        disabled={disabled}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
        placeholder="https://…"
        aria-labelledby={labelId}
      />
    )
  } else if (upload) {
    const finished = upload.progress >= 1
    body = (
      <Card>
        <Thumb src={upload.preview} ground={spec.ground} size={88} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={nameStyle}>{upload.name}</span>
          <Bar progress={upload.progress} label={`Uploading ${upload.name}`} />
          <span style={metaStyle}>
            {/* The bytes are all sent; the API is still handing them on. */}
            {finished
              ? 'Adding it to the media library…'
              : upload.progress > 0
                ? `Uploading… ${Math.round(upload.progress * 100)}%`
                : 'Uploading…'}
          </span>
        </span>
        <GhostButton onClick={cancel}>Cancel</GhostButton>
      </Card>
    )
  } else if (current) {
    body = (
      <Card active={dragging}>
        <Thumb
          src={current}
          ground={spec.ground}
          size={88}
          onLoad={onLoad}
          onError={onError}
          broken={shown?.broken}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={nameStyle} title={current}>
            {fileNameFromUrl(current) || current}
          </span>
          <span style={{ ...metaStyle, color: shown?.broken ? c.clay : c.muted }}>{meta}</span>
        </span>
        <span style={{ display: 'flex', gap: 8, flex: 'none' }}>
          {!readOnly && (
            <GhostButton disabled={disabled} onClick={browse}>
              Replace
            </GhostButton>
          )}
          {openable && (
            <a
              href={current}
              target="_blank"
              rel="noreferrer"
              className="ab-row-button ab-t ab-icon-button"
              data-tip="Open"
              aria-label={`Open the ${label} in a new tab`}
            >
              <IconExternal size={16} color="currentColor" />
            </a>
          )}
          {!readOnly && (
            <GhostButton disabled={disabled} onClick={remove} aria-label={`Remove the ${label}`}>
              Remove
            </GhostButton>
          )}
        </span>
      </Card>
    )
  } else if (readOnly) {
    body = <div style={{ ...readOnlyInput, display: 'flex', alignItems: 'center' }}>No image.</div>
  } else {
    body = (
      <button
        type="button"
        onClick={browse}
        disabled={disabled}
        className="ab-t"
        style={{
          width: '100%',
          minHeight: 112,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: 16,
          border: `1px dashed ${dragging ? c.accent : c.lineStrong}`,
          borderRadius: 0,
          background: dragging ? c.surfaceDeep : c.paper,
          color: c.inkSoft,
          fontFamily: font.ui,
          fontSize: 13,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <IconUpload size={22} color={c.muted} />
        <span>
          <span style={{ color: c.ink, fontWeight: 500 }}>Drop an image here</span> or{' '}
          <span style={{ color: c.accentDeep, textDecoration: 'underline', textUnderlineOffset: 3 }}>browse</span>
        </span>
        <span style={{ fontSize: 12, color: c.muted }}>
          {spec.label} · up to {formatBytes(MAX_IMAGE_BYTES)}
        </span>
      </button>
    )
  }

  return (
    <div role="group" aria-labelledby={labelId} style={{ display: 'block', minWidth: 0, ...style }} {...dropTarget}>
      <span id={labelId} style={fieldLabel}>
        {label}
      </span>
      {picker}
      {body}
      {(linkToggle || unsavedNote) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
          {linkToggle || <span />}
          {unsavedNote}
        </div>
      )}
      {hint && <span style={fieldHint}>{hint}</span>}
      <ErrorLine style={{ marginTop: 6 }}>{error}</ErrorLine>
    </div>
  )
}

const nameStyle = {
  display: 'block',
  fontSize: 13.5,
  fontWeight: 500,
  color: c.ink,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const metaStyle = { ...mutedText, display: 'block', fontSize: 12, marginTop: 4 }

function Card({ active = false, children }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 10,
        border: `1px ${active ? 'dashed' : 'solid'} ${active ? c.accent : c.lineStrong}`,
        background: active ? c.surfaceDeep : c.paper,
      }}
    >
      {children}
    </div>
  )
}

function Thumb({ src, ground, size, onLoad, onError, broken }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        background: src && !broken ? GROUNDS[ground] : c.surfaceDeep,
      }}
    >
      {src && !broken ? (
        <img
          key={src}
          src={src}
          alt=""
          onLoad={onLoad}
          onError={onError}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <IconImage size={Math.min(22, Math.round(size / 2))} color={c.muted} />
      )}
    </span>
  )
}

function Bar({ progress, label }) {
  const percent = Math.round(Math.min(Math.max(Number(progress) || 0, 0), 1) * 100)
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ display: 'block', height: 4, marginTop: 8, background: c.surfaceDeep, overflow: 'hidden' }}
    >
      <span
        style={{
          display: 'block',
          width: `${percent}%`,
          height: '100%',
          background: c.accent,
          transition: 'width 120ms linear',
        }}
      />
    </span>
  )
}

function LinkToggle({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ab-link"
      style={{
        background: 'none',
        border: 0,
        padding: 0,
        fontFamily: font.ui,
        fontSize: 12,
        color: c.accentDeep,
        textDecoration: 'underline',
        textUnderlineOffset: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
