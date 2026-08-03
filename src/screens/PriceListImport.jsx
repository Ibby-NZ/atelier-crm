import { useMemo, useRef, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, Em, PrimaryButton, SecondaryButton, Toast } from '../components/ui.jsx'
import { SectionTabs, priceListTabs } from '../components/sectionTabs.jsx'
import { suppliers, supplierById } from '../data/suppliers.js'
import { fxInfo, fxLine, isKnownCurrency } from '../data/fx.js'
import { nzd } from '../data/pricing.js'
import { parseCSV } from '../utils/csv.js'
import { buildPreview } from '../utils/importer.js'
import { IMPORT_COLUMNS, colefaxSampleCSV } from '../data/importSamples.js'
import { stageBatch, getStagedBatches } from '../data/importStore.js'
import { useIsNarrow } from '../hooks/useIsNarrow.js'

// Price-List Import Engine (GEN-02): supplier sheet → parsed → auto-mapped against the received
// Colefax & Fowler template → validated → priced through the live waterfall → staged in memory.
// The supplier chosen up front brings its defaults: currency, discount method and the 9 Jul
// discount-inclusive/exclusive flag (inclusive ⇒ P2 skipped on every row).

const STEPS = ['Supplier', 'Data', 'Mapping', 'Preview']
const micro = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }
const chipStyle = (col) => ({ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', border: `1px solid ${c.line}`, borderRadius: 4, fontSize: 10.5, color: col, fontFamily: font.ui, whiteSpace: 'nowrap' })
const PREVIEW_COLS = '86px 1.5fr 108px 86px 150px 104px 100px 116px 46px'

function Stepper({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {STEPS.map((name, i) => {
        const active = i === step
        const done = i < step
        const col = active ? c.accent : done ? c.sage : c.muted
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={{ width: 16, height: 1, background: c.line }} />}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: col }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 11, color: active ? c.ink : c.muted, fontWeight: active ? 600 : 400 }}>{name}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function GateButton({ enabled, onClick, children }) {
  return (
    <button disabled={!enabled} onClick={onClick} className={enabled ? 'ab-primary ab-t' : 'ab-t'}
      style={{ height: 44, padding: '0 22px', background: enabled ? c.accent : c.surfaceDeep, color: enabled ? c.paper : c.muted, border: 'none', borderRadius: 4, fontFamily: font.ui, fontSize: 13.5, fontWeight: 500, cursor: enabled ? 'pointer' : 'not-allowed' }}>
      {children}
    </button>
  )
}

function BackLink({ onClick }) {
  return (
    <button onClick={onClick} className="ab-t"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, color: c.muted, fontFamily: font.ui }}>
      ← Back
    </button>
  )
}

function IssueDot({ tone, issues }) {
  const col = { clay: c.clay, brass: c.brass, sage: c.sage }[tone]
  return (
    <span title={issues.map((i) => `${i.field}: ${i.message}`).join('\n')}
      style={{ width: 8, height: 8, borderRadius: '50%', background: col, display: 'inline-block', flex: 'none' }} />
  )
}

export default function PriceListImport() {
  const [step, setStep] = useState(0)
  const [supplierId, setSupplierId] = useState(null)
  const [rawText, setRawText] = useState('')
  const [fileErr, setFileErr] = useState(null)
  const [toast, setToast] = useState(null)
  const [stagedTick, setStagedTick] = useState(0)
  const fileRef = useRef(null)
  const narrow = useIsNarrow()

  const supplier = supplierId ? supplierById(supplierId) : null
  const parsed = useMemo(() => (rawText.trim() ? parseCSV(rawText) : null), [rawText])
  const preview = useMemo(() => (parsed && supplier ? buildPreview(parsed, supplier) : null), [parsed, supplier])
  const staged = useMemo(() => getStagedBatches(), [stagedTick])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  function onUpload(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setFileErr(null)
    if (file.name && !/\.(csv|txt)$/i.test(file.name)) {
      setFileErr('Could not read that file — expected a .csv')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setRawText(String(reader.result || ''))
    reader.onerror = () => setFileErr('Could not read that file — expected a .csv')
    reader.readAsText(file)
  }

  function commit() {
    if (!preview || !supplier) return
    const rows = preview.rows.filter((r) => !r.issues.some((i) => i.level === 'error'))
    if (!rows.length) return
    // Re-runnable import (15 Jul): staging the same supplier again replaces its batch, merging by code.
    const { replaced, added, updated } = stageBatch({ supplierName: supplier.name, rows })
    setStagedTick((t) => t + 1)
    flash(
      replaced
        ? `Re-import for ${supplier.name} — ${updated} updated · ${added} added (batch replaced, no duplicates).`
        : `${rows.length} products staged from ${supplier.name} — in-memory demo, no backend.`,
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Price-list import engine · GEN-02"
        title={<>From supplier sheet to <Em>sell price</Em></>}
        subtitle="Paste, upload or load the Colefax & Fowler template — auto-mapped, validated, priced through the live waterfall. Staged in memory only."
        right={<Stepper step={step} />}
      />

      <SectionTabs tabs={priceListTabs} active="import" />

      {/* Step 1 — choose the supplier (brings currency, terms and the inclusive/exclusive flag) */}
      {step === 0 && (
        <section style={{ marginTop: 30 }}>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            {suppliers.map((s) => {
              const on = s.id === supplierId
              const method = s.terms.method === 'per-brand' ? 'Per-brand exception' : `Averaged −${Math.round((s.terms.net || 0) * 100)}%`
              return (
                <button key={s.id} onClick={() => setSupplierId(s.id)} className="ab-t"
                  style={{ textAlign: 'left', cursor: 'pointer', padding: '16px 18px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: 4, background: on ? '#F3EADF' : c.paper }}>
                  <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{s.name}</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: c.muted }}>{s.currency} · {s.city} · {s.brands.length} brand{s.brands.length > 1 ? 's' : ''}</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={chipStyle(c.inkSoft)}>{method}</span>
                    {s.terms.discountIncluded ? (
                      <span style={chipStyle(c.sage)}>Discount-inclusive — P2 skipped</span>
                    ) : (
                      <span style={chipStyle(c.muted)}>
                        {s.terms.net != null ? `Discount exclusive — −${Math.round(s.terms.net * 100)}% applied` : 'Discount exclusive — per brand'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {supplier && (
            <div style={{ marginTop: 18, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: c.inkSoft, fontFamily: font.mono, lineHeight: 1.7, minWidth: 0 }}>
                {fxLine(supplier.currency)}
                <br />
                {supplier.agent} · Incoterm {supplier.incoterm} · {supplier.poEmail}
              </div>
              <span style={{ fontSize: 11, color: c.brass, fontStyle: 'italic', fontFamily: font.display, flex: 'none' }}>Indicative — real defaults owed under A13</span>
            </div>
          )}

          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
            <GateButton enabled={!!supplier} onClick={() => setStep(1)}>Continue — provide data</GateButton>
          </div>
        </section>
      )}

      {/* Step 2 — paste, upload, or load the received template */}
      {step === 1 && (
        <section style={{ marginTop: 30 }}>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1.5fr 1fr', gap: 18, alignItems: 'stretch' }}>
            <div>
              <div style={{ ...micro, marginBottom: 10 }}>Paste the price list (CSV)</div>
              <textarea
                value={rawText}
                onChange={(e) => { setRawText(e.target.value); setFileErr(null) }}
                rows={12}
                spellCheck={false}
                placeholder={IMPORT_COLUMNS.join(',') + '\n…'}
                aria-label="Price-list CSV"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '12px 14px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, fontFamily: font.mono, fontSize: 12, color: c.ink, lineHeight: 1.6 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ border: `1px dashed ${c.line}`, borderRadius: 4, padding: 18, background: c.surface }}>
                <div style={{ ...micro, marginBottom: 10 }}>Upload a file</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onUpload} style={{ display: 'none' }} />
                <SecondaryButton onClick={() => fileRef.current && fileRef.current.click()} style={{ height: 40, fontSize: 12.5, padding: '0 16px' }}>Upload .csv</SecondaryButton>
                <div style={{ marginTop: 10, fontSize: 11.5, color: c.muted, lineHeight: 1.5 }}>Reads the file locally — nothing leaves the browser.</div>
                {fileErr && <div style={{ marginTop: 10, fontSize: 12, color: c.clay }}>{fileErr}</div>}
              </div>
              <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, padding: 18, background: c.surface }}>
                <div style={{ ...micro, marginBottom: 10 }}>Or use the received template</div>
                <PrimaryButton onClick={() => { setRawText(colefaxSampleCSV); setFileErr(null) }} style={{ height: 40, fontSize: 12.5, padding: '0 16px' }}>Load Colefax &amp; Fowler sample</PrimaryButton>
                <div style={{ marginTop: 10, fontSize: 11.5, color: c.muted, lineHeight: 1.5 }}>The C&amp;F sheet received 9 Jul, expanded 15 Jul with the technical product fields (Repeat · Vertical Repeat · Pattern Match) — Duty &amp; Freight are CRM codes (blank = no duty, 'A' = wool 5%); the freight-code rates are still owed (A10).</div>
              </div>
            </div>
          </div>

          {parsed && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: font.mono, fontSize: 12.5, color: c.inkSoft }}>
                {parsed.rows.length} rows · {parsed.header.length} columns detected
              </div>
              {parsed.errors.map((er, i) => (
                <div key={i} style={{ marginTop: 4, fontSize: 12, color: c.clay }}>{er.message}</div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <BackLink onClick={() => setStep(0)} />
            <GateButton enabled={!!(parsed && parsed.rows.length)} onClick={() => setStep(2)}>Continue — check mapping</GateButton>
          </div>
        </section>
      )}

      {/* Step 3 — automatic column mapping against the known template */}
      {step === 2 && preview && (
        <section style={{ marginTop: 30 }}>
          <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 14 }}>
            Mapping is automatic against the received C&amp;F template — {IMPORT_COLUMNS.length} known columns.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 18, alignItems: 'start' }}>
            <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`, ...micro, fontSize: 9.5 }}>Mapped · {preview.mapped.length}</div>
              {preview.mapped.map((name) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: `1px solid ${c.line}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.sage, flex: 'none' }} />
                  <span style={{ fontSize: 12.5, color: c.inkSoft, flex: 1 }}>{name}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>→ col {preview.map[name] + 1}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ padding: '11px 16px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`, ...micro, fontSize: 9.5 }}>Not found · {preview.unmapped.length}</div>
                {preview.unmapped.length === 0 ? (
                  <div style={{ padding: '10px 16px', fontSize: 12.5, color: c.muted }}>Every template column is present.</div>
                ) : (
                  preview.unmapped.map((name) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: `1px solid ${c.line}` }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.clay, flex: 'none' }} />
                      <span style={{ fontSize: 12.5, color: c.inkSoft, flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 11, color: c.muted }}>not found in file</span>
                    </div>
                  ))
                )}
              </div>
              {preview.extras.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: c.muted }}>
                  Extra columns in the file (ignored): {preview.extras.join(' · ')}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <BackLink onClick={() => setStep(1)} />
            <GateButton enabled onClick={() => setStep(3)}>Continue — price the rows</GateButton>
          </div>
        </section>
      )}

      {/* Step 4 — resolved pricing preview + stage */}
      {step === 3 && preview && supplier && (
        <section style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontFamily: font.mono, fontSize: 13, color: c.inkSoft }}>
              {preview.rows.length} rows · <span style={{ color: c.sage }}>{preview.stageable} priced</span> · <span style={{ color: preview.errorCount ? c.clay : c.muted }}>{preview.errorCount} errors</span> · {preview.warnCount} with warnings
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>Per metre/roll · NZD · Indicative</div>
          </div>

          {preview.pendingNotes?.length > 0 && (
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {preview.pendingNotes.map((n, i) => (
                <div key={i} style={{ fontSize: 11.5, fontStyle: 'italic', color: c.brass }}>{n}</div>
              ))}
            </div>
          )}

          <div className="r-scroll-x" style={{ border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: PREVIEW_COLS, gap: 12, padding: '11px 16px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`, minWidth: 1020 }}>
              {['Code', 'Description', 'Currency', 'Wholesale', 'Discount', 'Duty', 'COGS NZ$', 'Trade sell NZ$', 'Flags'].map((h, i) => (
                <div key={h} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, textAlign: [3, 6, 7].includes(i) ? 'right' : i === 8 ? 'center' : 'left' }}>{h}</div>
              ))}
            </div>
            {preview.rows.map((r) => {
              const err = r.issues.some((i) => i.level === 'error')
              const warn = !err && r.issues.some((i) => i.level === 'warn')
              const dutyWarned = r.issues.some((i) => i.field === 'Duty Rate')
              const known = isKnownCurrency(r.currency)
              const sym = known ? fxInfo(r.currency).symbol : ''
              return (
                <div key={r.n} style={{ display: 'grid', gridTemplateColumns: PREVIEW_COLS, gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${c.line}`, borderLeft: `2px solid ${err ? c.clay : 'transparent'}`, minWidth: 1020, opacity: err ? 0.8 : 1 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft, minWidth: 0 }}>
                    <span style={{ display: 'block' }}>{r.code}</span>
                    {r.rawCode && r.rawCode !== r.code && (
                      <span title="Standardised on import (decision 6)" style={{ display: 'block', fontSize: 9.5, color: c.muted, textDecoration: 'line-through' }}>{r.rawCode}</span>
                    )}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: c.muted, marginTop: 1 }}>
                      {r.range}{r.itemType ? ` · ${r.itemType}` : ''}{r.unit ? ` · per ${r.unit}` : ''}
                      {r.repeat ? ` · Repeat ${r.repeat}` : ''}{r.patternMatch ? ` · ${r.patternMatch}` : ''}
                    </span>
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 11.5, color: known ? c.inkSoft : c.clay }}>
                    {known ? `${sym} ${fxInfo(r.currency).actual}/NZ$` : (r.currency || '—')}
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink, textAlign: 'right' }}>
                    {r.wholesaleForeign == null ? '—' : `${sym}${r.wholesaleForeign.toFixed(2)}`}
                  </span>
                  <span style={{ fontSize: 11.5, color: c.inkSoft }}>{r.discountLabel}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft }}>
                    {r.dutyPct ? `${Math.round(r.dutyPct * 100)}%` : <span style={{ color: c.muted }}>none</span>}
                    {dutyWarned && <span style={{ display: 'block', fontSize: 9.5, color: c.clay, fontStyle: 'italic', fontFamily: font.ui }}>confirm (A10)</span>}
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink, textAlign: 'right' }}>{r.wf ? nzd(r.wf.cogs) : '—'}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: r.wf ? c.accent : c.muted, textAlign: 'right', fontWeight: 500 }}>{r.wf ? nzd(r.wf.trade) : '—'}</span>
                  <span style={{ textAlign: 'center' }}>
                    <IssueDot tone={err ? 'clay' : warn ? 'brass' : 'sage'} issues={r.issues} />
                  </span>
                </div>
              )
            })}
          </div>

          {preview.rows.some((r) => r.issues.length > 0) && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {preview.rows.flatMap((r) =>
                r.issues.map((i, k) => (
                  <div key={`${r.n}-${k}`} style={{ fontSize: 12, color: i.level === 'error' ? c.clay : c.muted }}>
                    Row {r.n} · {i.field}: {i.message}
                  </div>
                )),
              )}
            </div>
          )}

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <BackLink onClick={() => setStep(2)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 12, color: c.muted }}>Staged in memory — no backend.</span>
              <GateButton enabled={preview.stageable > 0} onClick={commit}>Stage {preview.stageable} products</GateButton>
            </div>
          </div>
        </section>
      )}

      {/* Batches staged this session */}
      {staged.length > 0 && (
        <div style={{ marginTop: 36, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}`, ...micro, fontSize: 9.5 }}>Staged this session</div>
          {staged.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${c.line}` }}>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.inkSoft }}>
                Batch {String(b.id).padStart(2, '0')} · {b.supplierName} · {b.count} products
                {b.updatedAt && b.updatedAt !== b.at && (
                  <span style={{ color: c.brass }}> · re-imported</span>
                )}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>{b.updatedAt || b.at}</span>
            </div>
          ))}
          <div style={{ padding: '10px 16px', fontSize: 11.5, color: c.muted }}>
            Session-only staging — a production build writes to the catalogue after review. Re-importing a supplier replaces its batch (no duplicates).
          </div>
        </div>
      )}

      {toast && <Toast>{toast}</Toast>}
    </>
  )
}
