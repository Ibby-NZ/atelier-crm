#!/usr/bin/env bash
# Render every screen (React app + original Claude design refs) to shots/ for visual review.
# Uses the cached Playwright Chromium + locally-vendored system libs (no sudo needed).
set -e
cd "$(dirname "$0")"
LIBS="$PWD/.browser-libs"
echo "› building…"; npm run build >/dev/null 2>&1
echo "› serving…"
( npm run preview -- --port 4288 >/tmp/atelier_prev.log 2>&1 & echo $! >/tmp/atelier_react.pid )
( cd ../design_handoff_atelier_platform && python3 -m http.server 4299 >/tmp/atelier_design.log 2>&1 & echo $! >/tmp/atelier_design.pid )
sleep 4
echo "› screenshotting…"
LD_LIBRARY_PATH="$LIBS" node screenshot.cjs
kill "$(cat /tmp/atelier_react.pid)" "$(cat /tmp/atelier_design.pid)" 2>/dev/null || true
echo "✓ shots/ updated  (react_*.png = the app, design_*.png = the original Claude designs)"
