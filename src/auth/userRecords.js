// Pure builders + merge for the user roster. No React, no storage — just data shaping — so the
// validation is unit-testable and reused by AppStore (the store wiring) and UserManagement (the UI).
//
// The seeded cast (roles.js USERS) is the scripted demo baseline and is READ-ONLY: it is merged in
// at read time, never persisted, never removed. Only ADMIN-created users live in the store and can be
// added, edited or removed. That guarantees a Director (Liz) always exists, so admin can never be
// locked out of the app.
import { USERS, ROLES } from './roles.js'
import { slugify, uniqueId } from '../store/records.js'

// The seeded users, tagged so the UI can lock them (no edit / no remove).
export function seedUsers() {
  return USERS.map((u) => ({ ...u, seeded: true }))
}

// Seed cast first, then admin-created — the shape every consumer reads.
export function allUsers(created = []) {
  return [...seedUsers(), ...created]
}

// Minimal email sanity check — good enough to reject an obvious typo in the demo, not RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Turn add-user form input into a store record, or return { error } so the form can show it inline
// and NOT commit. `existing` is the full current roster (seed + created) — used for the id and to
// reject a duplicate email. A blank/unknown role fails closed rather than silently defaulting.
export function buildUser(form = {}, existing = []) {
  const name = String(form.name || '').trim()
  if (!name) return { error: 'Name is required.' }

  const email = String(form.email || '').trim().toLowerCase()
  if (!email) return { error: 'Email is required.' }
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' }
  if (existing.some((u) => String(u.email || '').toLowerCase() === email)) {
    return { error: 'An account with that email already exists.' }
  }

  const role = String(form.role || '')
  if (!ROLES[role]) return { error: 'Choose a role.' }

  // owner is the salesperson name this login attributes to (own-sales scoping, RPT-03). Optional:
  // blank ⇒ null, exactly like Liz and the shared Showroom login.
  const owner = String(form.owner || '').trim() || null

  const existingIds = existing.map((u) => u.id)
  return {
    id: uniqueId(slugify(name) || 'user', existingIds),
    seeded: false,
    name,
    email,
    role,
    owner,
    createdAt: new Date().toISOString(),
  }
}
