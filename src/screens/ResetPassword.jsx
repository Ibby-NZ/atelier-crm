// Reset password — lands from the emailed link (#/reset-password?token=…) and
// POSTs /auth/reset-password. Two fields so a typo does not lock the person
// out of the account they just recovered. The API sets no session on a
// reset, so success is a "Sign in" link, not a redirect into the app.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PrimaryButton, ButtonLink } from '../components/ui.jsx'
import { apiSend, ApiError } from '../lib/api.js'
import AuthFrame, { Field, AuthAlt, authLink } from './AuthFrame.jsx'
import { newPasswordError, readResetToken } from './passwordReset.js'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = readResetToken(params.toString())
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const problem = newPasswordError(password, confirm)
    if (problem) return setError(problem)
    setError('')
    setSubmitting(true)
    try {
      await apiSend('POST', '/auth/reset-password', { token, password })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthFrame title="Reset password" note="This reset link is missing its code. Open the link from the email, or request a new one.">
        <AuthAlt><Link to="/forgot-password" style={authLink}>Request a new reset link</Link></AuthAlt>
      </AuthFrame>
    )
  }

  if (done) {
    return (
      <AuthFrame title="Password changed" note="Sign in with the password you just chose.">
        <div style={{ marginTop: 22 }}>
          <ButtonLink to="/login">Sign in</ButtonLink>
        </div>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame
      title="Choose a new password"
      note="Pick something at least 12 characters long. You will sign in with it straight away."
    >
      <form onSubmit={submit} style={{ marginTop: 6 }}>
        <Field label="New password" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
        <Field label="Confirm new password" value={confirm} onChange={setConfirm} type="password" autoComplete="new-password" />
        {error && (
          <div role="alert" style={{ marginTop: 14, fontSize: 12.5, color: c.clay, fontFamily: font.ui }}>{error}</div>
        )}
        <PrimaryButton type="submit" disabled={submitting} style={{ marginTop: 22, width: '100%' }}>
          {submitting ? 'Saving…' : 'Set new password'}
        </PrimaryButton>
        <AuthAlt>Link expired? <Link to="/forgot-password" style={authLink}>Request a new one</Link></AuthAlt>
      </form>
    </AuthFrame>
  )
}
