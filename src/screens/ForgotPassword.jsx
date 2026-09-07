// Forgot password — POST /auth/forgot-password. The API answers 202 with the
// same sentence whether or not the address is registered, so the "sent" state
// repeats that sentence rather than claiming an email is on its way.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PrimaryButton } from '../components/ui.jsx'
import { apiSend, ApiError } from '../lib/api.js'
import AuthFrame, { Field, AuthAlt, authLink } from './AuthFrame.jsx'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) return setError('Enter the email you sign in with.')
    setSubmitting(true)
    try {
      const body = await apiSend('POST', '/auth/forgot-password', { email: email.trim() })
      setSent(body?.message || 'If an account exists for that address, a reset link has been emailed to it.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the link. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFrame
      title="Forgot your password?"
      note="Enter the email you sign in with and we will send you a link to choose a new one."
    >
      {sent ? (
        <div style={{ marginTop: 22 }}>
          <div role="status" style={{ fontSize: 13.5, lineHeight: 1.6, color: c.ink, fontFamily: font.ui }}>{sent}</div>
          <AuthAlt>The link works once and expires in an hour. <Link to="/login" style={authLink}>Back to sign in</Link></AuthAlt>
        </div>
      ) : (
        <form onSubmit={submit} style={{ marginTop: 6 }}>
          <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
          {error && (
            <div role="alert" style={{ marginTop: 14, fontSize: 12.5, color: c.clay, fontFamily: font.ui }}>{error}</div>
          )}
          <PrimaryButton type="submit" disabled={submitting} style={{ marginTop: 22, width: '100%' }}>
            {submitting ? 'Sending…' : 'Email me a reset link'}
          </PrimaryButton>
          <AuthAlt>Remembered it? <Link to="/login" style={authLink}>Back to sign in</Link></AuthAlt>
        </form>
      )}
    </AuthFrame>
  )
}
