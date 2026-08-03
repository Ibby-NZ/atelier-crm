# Atelier Textiles — Platform Demo (React)

A clickable, pixel-faithful prototype of Atelier's platform, rebuilt from the Claude-design screens as a real React SPA and seeded with **Atelier's own catalogue** (real brands, designs, compositions and photography scraped from atelier.co.nz). Prepared by Verum for the client walkthrough. Every figure on screen is **indicative**.

## Run it

```bash
cd atelier-app
npm install      # already done if node_modules exists
npm run dev      # → http://localhost:5273  (live, hot-reload)
```

Or run the production build (what to use in the meeting — fully offline, no wifi needed):

```bash
npm run build
npm run preview  # → serves dist/ on http://localhost:4173
```

Best viewed full-screen at ≥1280px. `/` is not a page — it is a redirect: no session sends you to **sign in** (`/login`), a live session straight to the **Dashboard** (`/dashboard`). Sign in, then click through.

## The walkthrough (suggested order)

**Act 1 — fix the pain (operations tool):** Dashboard → Pricing Engine (the waterfall) → Sales Order (auto-PO from a stock shortage) → Reporting (comparative, self-serve).
**Act 2 — the moat (brand world):** Library → Product page → The Atelier Journal → Trade/Public Storefront.

Navigation is real — the SideNav, the editorial top-nav, and the cross-links (shortage → PO, catalogue → pricing engine, library → product → project → samples, storefront pricing toggle) all route.

## What's real

- **Brands / designs / collections** — Pierre Frey, Manuel Canovas, Rubelli, Jim Thompson, de Le Cuona, Larsen, Colefax & Fowler, Dominique Kieffer, Fabricut family… all genuinely Atelier's.
- **Photography** — 60 real Atelier product/collection images vendored into `public/img/` (offline-safe).
- **Pricing** — the documented 8-step cost-plus waterfall, applied to a real design (Pierre Frey · Atlas), indicative numbers.
- **Trade pricing is hidden behind sign-in** on the public surfaces — mirroring Atelier's real site.

## Structure

```
src/
  theme.js              design tokens (palette, fonts, weave gradient)
  data/
    realCatalogue.js    AUTO-GENERATED real brands/collections/products (+ image refs)
    atelier.js          operational spine — orders, pricing, samples, reporting, CRM, journal
  components/
    ui.jsx              PageHeader, SwatchStrip, WeaveImage, StatusPill, buttons…
    icons.jsx           inline brass-stroke icons
    layout.jsx          SideNav + internal TopBar / editorial brand TopBar + the two layouts
  screens/              the 15 screens + 2 (Collections, Sample Request) + Login
  App.jsx               routes
public/img/             60 real Atelier images
```

## See every screen (visual review)

The build environment has no system browser, so a headless Chromium is wired up with its
system libs vendored locally (no sudo). One command renders **every** screen — the React app
*and* the original Claude design refs — into `shots/` so they can be compared side by side:

```bash
./screenshot.sh        # → shots/react_<name>.png  vs  shots/design_<name>.png
```

`react_dashboard.png` ↔ `design_dashboard.png`, `react_pricing.png` ↔ `design_pricing.png`, etc.
(`screenshot.cjs` is the harness; `.browser-libs/` holds the vendored libs.) This is how the
build was visually verified against the designs.

## Notes for next iteration

- Images use a graceful fallback (local file → remote URL → woven gradient), so nothing ever shows broken.
- Verified: production build passes; all 18 routes render without runtime errors (Vite SSR check); app + images serve over HTTP. A live browser couldn't be run in the build environment, so give it a quick click-through and flag any visual/interaction polish.
