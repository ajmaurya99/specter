---
name: run-specter
description: Launch the Specter app and drive a scan end-to-end (start server, trigger scans via API, watch SSE phases, check results/screenshot). Use when asked to run the app, verify a change against a real scan, or reproduce a scan-related bug.
---

# Run & drive Specter

## Launch

```sh
npm run dev          # http://localhost:3000 (background it; ready when / returns 200)
```

For production behavior (CSP, real chunking): `npx next build && npx next start -p 3000`.
The e2e suite (`npm run test:e2e`) builds and starts its own server on port
3000 — stop any dev server first or it fails with "port already used".

After engine/server changes, **restart the server** — the engine runs
server-side and HMR doesn't reliably reload the globalThis registry pieces.

## Drive a scan from the shell

```sh
# Always force:true while testing — a 10-min dedupe cache returns stale scans otherwise.
ID=$(curl -s -X POST localhost:3000/api/scan -H 'content-type: application/json' \
  -d '{"url":"https://example.com","force":true}' | python3 -c "import json,sys;print(json.load(sys.stdin)['scanId'])")

curl -sN localhost:3000/api/scan/$ID/events | head -30   # live SSE phases
curl -s  localhost:3000/api/scan/$ID | python3 -m json.tool | head -40  # status/result
curl -s  localhost:3000/api/scan/$ID/screenshot -o /tmp/shot.jpg        # page capture
open http://localhost:3000/scan/$ID                                      # results UI
```

A scan takes ~5–30 s (fetch + settled render + diff). Engine-only check with
no server: `npx tsx scripts/scan-cli.ts <url>`.

## Known-outcome URLs

| URL | Expected |
| --- | --- |
| `https://example.com` | score 100, one green `fully_visible` region |
| `https://excalidraw.com` | score 0, red `js_rendered_content` (canvas SPA) |
| `https://stories.hilton.com/` | ~97, one red region (JS brand carousel) — good Page-view overlay test |
| any PDF URL | `unsupported_content_type` error screen |
| `http://127.0.0.1:<port>` | `ssrf_blocked` unless `ALLOW_LOCAL_TARGETS=true` in .env |

To scan localhost fixtures (e.g. e2e/fixture-server.ts), set
`ALLOW_LOCAL_TARGETS=true` in `.env` and restart.

## Visual checks

Screenshot the UI with a throwaway Playwright script (pattern used throughout
this project's history):

```ts
import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:1100}});
await p.goto(`http://localhost:3000/scan/${id}`); await p.waitForTimeout(1500);
await p.getByRole("tab", { name: "Page view" }).click(); await p.waitForTimeout(1500);
await p.screenshot({ path: "/tmp/ui.png" }); await b.close();
```

Read the PNG to verify. For overlay-alignment checks, crop the served
screenshot at a region's stored boundingBox (`sips -c <h> <w> --cropOffset <y> <x>`)
and confirm the pictured content matches the region's verdict.
