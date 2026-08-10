// Build-time break-glass credential, read once.
//
// Split out from ./breakGlass.js so that module stays pure and testable under
// vitest's Node environment. The members are read individually (not by spreading
// `import.meta.env`) because that is the form Vite guarantees to replace
// statically at build time.
//
// Unset vars ⇒ readBreakGlassConfig returns null ⇒ the feature does not exist in
// that build. That is the default: emergency access is opt-in per deployment.

import { readBreakGlassConfig } from './breakGlass.js'

export const BREAK_GLASS = readBreakGlassConfig({
  email: import.meta.env.VITE_BREAKGLASS_EMAIL,
  passwordHash: import.meta.env.VITE_BREAKGLASS_PASSWORD_SHA256,
  name: import.meta.env.VITE_BREAKGLASS_NAME,
})

export const breakGlassEnabled = BREAK_GLASS !== null
