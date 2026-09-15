# CRM usability implementation plan

Goal: apply the authorised September UI/UX brief while preserving API contracts, staff workflows, the design tokens and demo boundaries.

Approach: separate commits and review patches for shared keyboard/confirmation chrome, each migrated screen, form primitives, detail back links, dense-list treatment and feedback identity. The supplied archive has no Git remote/history. `master` is the untouched imported baseline; review branches and patches can be applied to the actual repository. No remote PR can be created from this archive alone.

Constraints: read all of CLAUDE.md first and screen headers/tests before editing; JavaScript only, no new dependencies, no direct fetch in screens, no API or access-policy changes, preserve existing deliberate copy. No route/nav/tab changes or demo/data/store edits. Every commit passes `npm test` then `npm run build`.

1. Baseline: 1,544 tests pass; build passes with the existing chunk-size warning. Before screenshots captured at 1440 and 1024 for 42 live/mirror routes with an isolated QA session and explicit API-unavailable responses. No backend is supplied.
2. Shared confirmation: retain the delete kit and refusal behaviour; add an awaitable confirmation hook for replacing native browser confirms. Keep Cancel initially focused, trap focus, restore focus and ignore dismissal while a write is busy. Test cancellation, repeated requests and cleanup in pure JavaScript; verify actual focus behaviour in Chromium.
3. Migrate each native confirmation with unchanged body copy. Replace the Users email prompt with a labelled inline email form, preserve request body and API errors, and show returned credentials persistently.
4. Keyboard rows: use native links for Dashboard navigation, buttons for report selection; preserve targets/URL filter rules and report fixtures. Add back links inside existing PageHeader eyebrows on five deep screens.
5. Forms: add a native Select in parts.jsx based on inputStyle. Migrate live controls screen by screen with their existing options, controlled values and compact cell styles. Keep demo forms untouched. Use Field's 11px form labels and 12px sectionLabel for panel headings.
6. Dense lists: audit numeric cells once, correct demonstrated alignment/null-display exceptions; opt into sticky headers only on the three requested screens and verify scroll-container behaviour. Preserve inline editors, add accent selection/surface grouping and a sticky save footer where the existing actions support it.
7. Remove Userback's invented user_data. Verify toast at 640px; change only shared non-blocking toast behaviour if required.
8. Run final pure tests/build, browser before/after comparisons, cancellation/refusal/reload and keyboard checks. Package source, commit patches, screenshots and a handover stating backend/font/camera limitations.

Deferred decisions: Catalogue landing → Products, Reporting landing → Library, removal of Showroom Samples entry, and label/hide demo header search. API/product debts listed in the brief stay requests, not implementations.
