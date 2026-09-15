// The existing email prompt's normalisation, shared with its inline replacement.
export function signInEmailPatch(current, next) {
  const email = (next ?? '').trim().toLowerCase()
  return !email || email === current ? null : { email }
}
