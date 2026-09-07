// The pure half of the two reset screens. Mirrors the API's floor
// (MIN_PASSWORD_LENGTH in atelier-api src/auth/passwords.js) so a short
// password is refused with a sentence rather than the raw schema 400.
export const MIN_PASSWORD_LENGTH = 12

// The token rides in ?token= on the emailed link (inside the hash, so it
// arrives through react-router's search params, not window.location.search).
export function readResetToken(search) {
  return new URLSearchParams(search || '').get('token')?.trim() || ''
}

// '' when the pair is acceptable, otherwise the sentence to show.
export function newPasswordError(password, confirm) {
  if (!password) return 'Choose a new password.'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password !== confirm) return 'The two passwords do not match.'
  return ''
}
