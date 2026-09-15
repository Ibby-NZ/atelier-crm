# Page Navigation and Workspace Layout Implementation Plan

> **For agentic workers:** Execute the isolated tasks with the existing pure-test/build gates and review each contribution before integration.

**Goal:** Make core workflows visibly independent pages and free the working area from section tabs.

**Architecture:** Pure navigation metadata resolves the current page and inherited actions. InternalLayout provides that context to PageHeader, while SectionTabs becomes a compatibility component for existing consumers. Screen-specific presentation edits preserve existing requests and rule helpers.

**Tech Stack:** Vite5, React18, JavaScript ESM, inline token styles, native React Router links, Vitest pure logic, existing Playwright/Chromium.

**Spec:** docs/ux-review/v2/design.md

## Global constraints

Read CLAUDE.md fully and current screen headers/tests. No new dependencies, API/filter/body/finance/auth changes, demo/data/store edits or widened breakpoints. Preserve all original URLs, quoted client copy and server truth. Every commit: npm test then npm run build. Baseline is iteration1 commit6f22dab.

## Task1: baseline and independent QA

- [ ] Use the existing isolated fixture harness, with iteration1 as before and crm-v2 as after.
- [ ] Capture core list/detail pages at1440/1024 before edits; retain API-unavailable limitations.
- [ ] Prepare direct-navigation, current-route, action retention, no-tab, keyboard and layout checks.

## Task2: page navigation and shared header

Files: components/workspaceNavigation.js, workspaceNavigation.test.js, WorkspaceContext.js, layout.jsx, ui.jsx, sectionTabs.jsx, index.css; CLAUDE.md.
Interfaces: workspacePage(pathname) returns page metadata; workspaceGroups(can) filters nav using the existing CAPS; workspaceActions(pathname) returns existing sectionActions with no new request. Context contains page/actions.
- [ ] Write literal behavioural cases for detail-v-list specificity, mirror-client ownership, create pages, unknown paths, capability filtering and retained create destinations.
- [ ] Observe failures, implement pure resolver and then shared layout.
- [ ] Render individual sidebar links, keep core order pages visible, open active secondary group, use aria-current and native disclosure buttons.
- [ ] Compact operations PageHeader, carry old section actions and remove the strip via its compatibility component.
- [ ] Check keyboard/mobile navigation, unused imports, source scans; gate and commit by concern.

## Task3: dashboard presentation

Files: screens/Dashboard.jsx only, plus handover note.
- [ ] Preserve existing dashboard helpers/API while presenting KPI cards and two bordered work queues.
- [ ] Improve labels, row spacing and existing navigation affordances without new figures.
- [ ] Gate and commit; review before/after at both widths.

## Task4: order desks

Files: screens/AdminOrders.jsx, AdminPurchaseOrders.jsx, AdminSupplierInvoices.jsx and existing pure twins only if a real new UI decision needs testing.
- [ ] Read each header and test, then improve existing filters/row information grouping.
- [ ] Let the purchasing list lead; retain plan/generate in a collapsed native disclosure with its current callbacks and notices.
- [ ] Keep URL drafts, page counts, currency, state gates, record editors and API bodies exact.
- [ ] Gate one screen/concern at a time and review browser evidence.

## Task5: final review and delivery

- [ ] Verify all routes/actions, responsive geometry, browser interactions, invariants and build.
- [ ] Compare to iteration1, document decisions and unverified connected API/camera behaviour.
- [ ] Deliver revised source, iteration2 patches, screenshots and a concise handover.
