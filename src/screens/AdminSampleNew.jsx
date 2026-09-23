// Register a sample — its own page since 23 Sep 2026. The client asked that
// "any kind of data entry … open in their own individual page instead of a
// tabbed drop down", and this form used to drop down above the register.
//
//   POST /admin/samples   → { sample }  (201)
//
// The form is <SampleFields>, the one the sample's own page edits with, so the
// two cannot drift. What differs on create is the barcode: a blank asks the
// server to mint the next tag, which createSampleBody expresses by OMITTING the
// key — never the explicit null bodyFrom would send, which the API answers with
// a 400.
//
// Once the sample exists it is worked from its own page, and this page is
// replaced by it in history: Back from the new sample returns to the register,
// not to an empty form that reads as "it did not save". The toast travels with
// that navigation in router state (arrivalNote), because this page unmounts the
// moment it would have been shown — and the toast is the minted barcode, the
// office's one chance to read the new tag off the screen while the object is
// still in hand.
//
// WHAT A SAMPLE COST IS FINANCE-GATED (C18): the Value pair is drawn and sent
// only with the finance grant (sampleFieldsFor), because the API deletes the
// keys from every response a login without it gets and 403s a write naming
// them. The usual fill is automatic — receipting a priced sample line on a
// purchase order writes them by barcode — and these fields are the manual
// fallback for a tag registered after the fact.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { useAccess } from '../auth/AuthContext.jsx'
import SampleFields from './SampleFields.jsx'
import { useSamplePickers } from './useSamplePickers.js'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  ToastLine,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  NEW_SAMPLE,
  SAMPLES_PATH,
  createSampleBody,
  createdSampleNote,
  sampleFieldsFor,
  sampleRoute,
} from './adminSamples.js'

export default function AdminSampleNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this page, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })
  const [newSample, setNewSample] = useState(NEW_SAMPLE)
  const { showrooms, suppliers } = useSamplePickers()

  // The API's own derived report_access, via /auth/me: without finance the
  // cost pair is neither drawn nor sent. The 403 stays the real gate.
  const { finance } = useAccess()
  const fields = sampleFieldsFor(finance)

  // createSampleBody, not bodyFrom over the field list: a blank barcode is
  // OMITTED from the body (asking the server to mint a tag), never sent as the
  // explicit null bodyFrom would produce — which the API answers with a 400.
  // The finance-aware `fields` rides in so a finance login's Value inputs
  // reach the body and nobody else's body ever names the cost keys.
  const createSample = async (event) => {
    event.preventDefault()
    const built = createSampleBody(newSample, fields)
    if (built.error) return setError(built.error)
    let created = null
    const ok = await run(() =>
      apiSend('POST', SAMPLES_PATH, built.body).then((body) => {
        created = body.sample
        return body
      })
    )
    if (ok && created) {
      navigate(sampleRoute(created.id), {
        replace: true,
        state: { flash: createdSampleNote(built.body, created) },
      })
    }
    return undefined
  }

  const setNewField = (key) => (event) => setNewSample((n) => ({ ...n, [key]: event.target.value }))

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={
          <>
            <Link to={SAMPLES_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Back to the sample register
            </Link>
            {' · live'}
          </>
        }
        title={<>Register a sample</>}
        subtitle="A physical sample joining the library. Leave the barcode blank and the register numbers the tag itself — the new number is on the sample's page as it opens."
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="The sample" />
        <form onSubmit={createSample} style={{ padding: 20 }}>
          <SampleFields
            values={newSample}
            onChange={setNewField}
            disabled={busy}
            showrooms={showrooms}
            suppliers={suppliers}
            finance={finance}
            creating
          />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Register sample
            </GhostButton>
            <Link to={SAMPLES_PATH} style={{ textDecoration: 'none' }}>
              <GhostButton disabled={busy}>Cancel</GhostButton>
            </Link>
          </div>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
