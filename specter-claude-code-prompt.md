# Build "Specter" — an AI Visibility Scanner (full-stack web app)

## What you are building

A web application that scans any webpage and shows the user which parts of it are
visible to AI crawlers (which fetch raw HTML and do NOT execute JavaScript) versus
what human users see in a fully rendered browser. The result is a region map of the
page with three verdicts — Visible (green), Partial (yellow), Invisible (red) — a
0–100 visibility score, per-region diagnostics, and a copy-ready prompt the user can
paste into an AI coding assistant to fix each issue.

This app must work fully on a local machine and must NOT require any LLM API to
perform its core analysis. The analysis is deterministic: fetch + render + diff +
rule-based classification + template-based prompt generation.

No design file is provided. Design the UI yourself from the design specification
below — it defines the principles and tokens; you own the execution details. The
look must feel fresh, minimal, and intentional — not like a default template, an
admin dashboard, or a generic shadcn page.

## Design specification

**Core principle — color carries meaning, nothing else does.** The entire interface
chrome is strictly monochrome: a cool off-white background, near-black ink,
hairline neutral borders. The ONLY color anywhere on screen is the three verdict
colors. This makes the diagnosis impossible to miss and gives the app its identity.

**Design tokens:**
- Background `#F5F6F5` (cool gray, not warm cream), surfaces `#FFFFFF`,
  ink `#191C1A`, muted text `#6E7572`, hairlines `#E4E7E5`
- Verdicts: visible `#2E8F5B`, partial `#B98A0E`, invisible `#CD4337` — each with a
  ~10% opacity tint variant for region backgrounds. Adjust shades only if needed to
  meet WCAG AA contrast on their tints.
- Type: **Hanken Grotesk** for UI and headings (800 weight, tight letter-spacing for
  display), **IBM Plex Mono** for everything machine-true: URLs, evidence, stats,
  scores, and the generated prompts. The mono face signals "this is real data".
- Spacing: generous whitespace, 10–14px radii, at most one soft shadow level.
  No gradients, no glassmorphism, no decorative illustrations, no emoji in UI.

**The three screens:**

1. **Input** — dead quiet. A centered headline ("See your page the way AI does."),
   one URL input with a single Scan button in a card, and a small three-dot legend
   (Visible / Partially visible / Invisible) that teaches the color language before
   the first scan. A compact "Recent scans" list below. Nothing else competes.

2. **Scanning** — the signature moment. Show a skeleton "ghost page" (gray bars in
   a card) with a thin dark sweep line passing over it, plus live status text
   driven by the REAL engine phases over SSE: "Fetching raw HTML…" →
   "Rendering in headless browser…" → "Diffing crawler view vs rendered DOM…" →
   "Classifying regions…", each with a mono sub-line of real telemetry (status
   code, response size, request count). On the final phase, the skeleton bars tint
   green/yellow/red one by one — the diagnosis develops in front of the user.

3. **Results** — split view. LEFT: the page reconstructed as a stylized region map
   inside a faux browser frame — each region is a clickable block tinted with its
   verdict, with a small uppercase status tag, region name, and abstract skeleton
   shapes (bars, a map blob, a table grid) hinting at the content type, scaled
   roughly from real bounding boxes. RIGHT: an inspector panel containing the
   visibility score (large mono number, animated count-up), a stacked
   green/yellow/red proportion bar, counts, and an issues-first region list.
   Clicking a region (on map or list) flips the inspector to a detail view:
   status chip → region name → "What the crawler found" (quantified evidence in a
   mono block) → "Why it matters" → "How to fix it" → a prompt box with a Copy
   button ("Copied ✓" feedback). Back link returns to the list. Below the
   inspector, a small page-level checks panel (robots.txt, JSON-LD, meta) and a
   permanent fine-print caveat: verdicts reflect what most AI crawlers retrieve;
   "invisible" means invisible to most crawlers, most of the time — not all.

**Motion:** restrained and purposeful — the scan sweep, the verdict tint reveal,
the score count-up, and subtle region fade-ins. Nothing else moves. All of it
disabled under `prefers-reduced-motion`.

**Copy tone:** plain, specific, expert. Evidence lines are quantified
("412 words rendered · 0 found in initial HTML"), never vague. Green regions still
explain why they pass. Buttons say what they do ("Scan page", "Copy", "New scan").

## Tech stack (use latest stable versions)

- **Next.js (App Router) + TypeScript (strict mode)** — single app serving both UI and API
- **Playwright** (chromium only) for the rendered-DOM capture
- **SQLite via Prisma** (or better-sqlite3 if simpler) for scan history — local file DB, no external services
- **Zod** for env validation and API input validation
- **Tailwind CSS v4** for styling, implementing the design tokens from the design specification above
- **Vitest** for unit tests, Playwright test for one e2e smoke test
- npm only (no pnpm/yarn/bun). Node 22 LTS.

Do not add: Redis, Docker, external queues, auth, or any paid service. Keep it
runnable with `npm install && npm run dev`.

## Architecture

```
/app                  → Next.js routes (UI pages + route handlers)
  /api/scan           → POST: start a scan (with dedupe), returns scanId + queuePosition
  /api/scan/[id]      → GET: scan status + results (+ SSE /events for live progress)
  /api/scan/[id]/fix-plan → GET: combined markdown fix plan download
/lib/engine           → the analysis engine (pure, testable, no Next.js imports)
  fetcher.ts          → crawler-view fetch + browser-UA control fetch, robots/llms.txt
  renderer.ts         → Playwright render → segmented DOM regions w/ text + bounding info
  differ.ts           → text-presence diffing between raw HTML and rendered regions
  classifier.ts       → rule-based verdicts + issue taxonomy (incl. crawler_blocked)
  scorer.ts           → weighted 0–100 score
  prompts.ts          → fix-prompt templates per issue type, filled with scan evidence
  comparer.ts         → rescan comparison (score delta + per-region status changes)
  fingerprint.ts      → detect stack (WordPress, Next.js, React, Vue, Nuxt, plain) from HTML
/components           → UI components
/prisma or /db        → schema + migrations
```

The engine must be importable and unit-testable without a server running.

## The analysis engine (the important part — be precise)

### 1. Crawler view (fetcher.ts)
- `fetch()` the URL with a configurable user agent (default `GPTBot`-like string),
  follow up to 5 redirects, 15s timeout, capture: final URL, status, raw HTML,
  response size.
- **Bot-blocking detection:** perform a second control fetch of the same URL with a
  normal desktop browser user agent. Compare the two responses: if the crawler-UA
  fetch returns 401/403/429, a CDN/WAF challenge page (detect common markers:
  Cloudflare "Just a moment", "Checking your browser", captcha markup, unusually
  tiny HTML vs the browser response), or content whose stripped text differs from
  the browser response by more than 60%, set a page-level verdict
  `crawler_blocked` with evidence (both status codes and sizes). This verdict
  OVERRIDES region analysis in the UI: regions are still computed (from the
  browser-UA response) but the report leads with "AI crawlers are blocked at the
  door — fix this first," and the score is capped at 10.
- **SSRF protection (mandatory):** before fetching, resolve the hostname and reject
  private/reserved IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
  169.254.0.0/16, ::1, fc00::/7) — UNLESS the env flag `ALLOW_LOCAL_TARGETS=true` is
  set (so developers running locally can scan their own localhost sites; default to
  false). Re-check after every redirect. Block non-http(s) schemes.
- Fetch `/robots.txt` once and evaluate the scanned path per crawler for each of:
  GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot — produce an
  allowed/disallowed grid (informational, not a region verdict).
- Also check for `/llms.txt` (HEAD or GET): report present/absent, and if present,
  whether it links to the scanned path.
- **Non-HTML and error handling:** if the response is not HTML (PDF, image, JSON),
  stop with a typed engine error `unsupported_content_type`; likewise produce typed
  errors for `timeout`, `dns_or_network`, `login_redirect` (redirect chain lands on
  a URL matching /login|signin|auth/ patterns or the page is dominated by a
  password field), and `render_failed`. Typed errors flow through to the UI.

### 2. Rendered view (renderer.ts)
- Launch Playwright chromium (headless, reuse a single browser instance across scans,
  one context per scan). Block image/font/media requests to keep renders fast.
  `waitUntil: networkidle` with a hard 25s cap, viewport 1280×2000.
- Segment the rendered page into **regions**: walk top-level semantic/structural
  blocks (header, nav, main's direct sections, article, aside, footer, and large
  divs > 80px tall that are direct children of main containers). For each region
  capture: a stable selector, a human name (derived from headings/aria-label/tag),
  visible text content (normalized), word count, bounding box, and flags:
  contains-canvas, contains-iframe (+ iframe src), contains-table, contains-img
  (with/without alt), links (href + whether each href is a hash/JS route).
- Also capture from the RAW html: full text content with scripts stripped, AND
  separately the concatenated contents of inline `<script>` tags (for the
  "data-in-JS-variable" check).

### 3. Diffing (differ.ts)
For each rendered region, compute what fraction of its visible text exists in the
raw-HTML text (normalize whitespace/entities; match on shingled 6-word sequences for
robustness, fall back to distinctive tokens like numbers and rare words for short
regions). Output `coverage: 0..1` per region, plus `foundInScripts: 0..1` (same check
against inline script content).

### 4. Classification (classifier.ts) — issue taxonomy
Assign each region a status and an `issueType`:

- `fully_visible` (ok): coverage ≥ 0.9
- `js_rendered_content` (bad): coverage < 0.15 and foundInScripts < 0.15
- `data_in_script_variable` (warn): coverage < 0.5 but foundInScripts ≥ 0.5
- `iframe_embed` (bad): region dominated by iframe and coverage < 0.15
- `canvas_or_image_data` (bad): region dominated by canvas, or images without alt
  carrying the content, with low coverage
- `partial_content` (warn): 0.15 ≤ coverage < 0.9
- `client_side_routes` (warn): region links where >50% of hrefs are `#/...` or
  `javascript:` routes — verify by HEAD-requesting up to 3 of them server-side and
  checking they don't resolve to distinct content
- `hidden_but_present` (informational ok-with-note): text present in raw HTML but
  hidden via CSS in render

Each region result: `{ selector, name, status, issueType, coverage, evidence,
boundingBox, weight }` where `evidence` is concrete and quantified, e.g.
`"412 words rendered · 0 found in initial HTML · container <div id=\"map-root\"> is empty in raw response"`.

### 5. Scoring (scorer.ts)
Weight = region's share of rendered word count, with a floor so big empty
interactive regions still count (use max(wordShare, areaShare)). Score =
Σ weight × (ok=1, warn=0.5, bad=0) × 100, rounded.

### 6. Fix prompts (prompts.ts)
One template per issueType. Each generated prompt MUST embed real scan data:
page URL, detected stack from fingerprint.ts, the region's selector and an HTML
snippet (truncated ~600 chars) of its raw-response state, the quantified evidence,
numbered requirements describing the progressive-enhancement fix, and a
verification step ("fetch with curl and confirm X appears without JavaScript").
Structure each prompt like this example:

```
My page renders a data map entirely client-side, which makes the data invisible
to AI crawlers that don't execute JavaScript. Help me fix it with progressive
enhancement.

Page: {url}
Stack: {detected stack, e.g. WordPress + custom JS bundle}
Current state: {evidence, e.g. rendered DOM contains a <canvas> with 51 values;
container in raw response is <div id="map-root"></div> (empty)}

What I need:
1. On the server, render the same data as a semantic HTML <table> inside
   {selector} in the initial response (caption, thead, tbody).
2. Keep the existing script, but have it replace the table with the interactive
   version once it initializes — zero visual change for users.
3. Verify by fetching the URL with curl (no JS) and confirming the table and its
   values are present.

Constraints: don't break the current UX, keep the table accessible, and avoid a
flash of unstyled content.
```

### 7. Page-level checks (shown in a summary panel, not the region map)
Bot-blocking verdict (from the dual-UA fetch), robots.txt allowed/disallowed grid
per AI crawler, `llms.txt` presence, presence of JSON-LD structured data, title/meta
description present in raw HTML, sitemap reference, and whether the URL itself
required JS routing to resolve.

### 8. Rescan & compare (comparer.ts)
Scans are stored per normalized URL (lowercase host, strip trailing slash and
tracking params). When a scan completes for a URL that has a previous completed
scan, compute a comparison: score delta, and per-region status changes by matching
regions on selector first, then on name similarity as fallback
(`improved` / `regressed` / `unchanged` / `new` / `removed`). Persist the
comparison with the scan so report permalinks show it.

**Scan dedupe:** if the same normalized URL was scanned successfully within the
last 10 minutes, return the cached scan immediately with a `cached: true` flag and
its age; the UI shows "Scanned 4 min ago" with an explicit "Rescan now" action
that bypasses the cache.

## Optional AI layer (build the seam, not the dependency)

Define an interface `PromptEnhancer` with a no-op default. If `ANTHROPIC_API_KEY` is
set in env, an implementation may post-process the template prompt via the API to
tailor it further; if unset, the app silently uses templates. The app must never
fail or degrade when no API key exists. Document this in the README under
"Optional AI features".

## API design

- `POST /api/scan` `{ url: string }` → validates with zod, normalizes the URL,
  applies the 10-minute dedupe (returns cached result with `cached: true` unless
  `force: true`), creates scan record, kicks off engine (in-process; serialize
  concurrent scans with a simple queue of max 2), returns `{ scanId, queuePosition }`.
- `GET /api/scan/:id` → `{ status: 'fetching'|'rendering'|'diffing'|'classifying'|'done'|'error', progress, queuePosition?, result?, comparison? }`.
  Typed engine errors surface as `{ status: 'error', errorType, message }`.
  Prefer Server-Sent Events at `/api/scan/:id/events` so the scanning screen's
  status text reflects real engine phases (the four phases listed in the design
  specification); fall back to polling.
- `GET /api/scan/:id/fix-plan` → downloads a single markdown document: scan
  summary (URL, score, date, page-level checks) followed by every red/yellow
  region's full fix prompt, ordered by score impact (weight × severity), each
  under a heading with its evidence. This is the "hand it to your dev team" doc.
- `GET /api/scans` → recent scan history (url, latest score, score delta vs
  previous, date) for a small "Recent scans" list on the input screen.
- Rate limit: max 10 scans per minute per IP (in-memory limiter is fine).

## Frontend requirements

Implement the three screens exactly as defined in the design specification above:
1. **Input** — centered URL box, verdict legend, recent scans list below (each
   entry shows latest score and a small +/− delta vs its previous scan).
2. **Scanning** — sweep animation over a skeleton, status text driven by REAL SSE
   phases, skeleton rows tint with verdicts as classification completes; show
   queue position when waiting.
3. **Results** — region map (left) rendered from the real region data, scaled from
   bounding boxes into the stylized page canvas; inspector (right) with score,
   stacked score bar, issues-first list, detail view with evidence / why it matters /
   how to fix / copy-prompt box. Include the page-level checks panel and the
   honesty caveat fine print.

Additional results-view requirements:
- **Crawler view tab.** Next to the region map, a second tab showing the actual
  extracted raw-HTML text exactly as the differ sees it (scripts stripped, mono
  type, scrollable). This is the proof behind every verdict — when users doubt a
  red region, this tab settles it.
- **Compare banner.** When the scan has a `comparison`, lead the inspector with
  the delta ("62 → 84, +22") and mark changed regions in the list and on the map
  with improved/regressed indicators (icon + text, never color alone). Provide a
  link to the previous scan's permalink.
- **Blocked state.** When the page-level verdict is `crawler_blocked`, the results
  view leads with a prominent explanation panel ("AI crawlers are blocked at the
  door — fix this first"), shows both fetch outcomes as evidence, includes a fix
  prompt for allowlisting AI crawlers at the CDN/WAF, and visually de-emphasizes
  the region map (still available below).
- **Export.** Two buttons: "Export report" (self-contained HTML of the results)
  and "Download fix plan" (the markdown from /fix-plan).
- **Cached result affordance.** When a dedupe hit is served, show "Scanned N min
  ago" with a "Rescan now" action.
- **Error states.** A dedicated, helpful screen per typed engine error —
  unsupported content type (e.g. "This is a PDF — Specter analyzes HTML pages"),
  timeout (suggest retrying; heavy pages may exceed the render budget),
  login-gated pages, network/DNS failure, and render failure. Each states what
  happened and what to try next; errors give direction, never apologies, and the
  URL stays in the input for one-tap retry.

Also add: a shareable report — `GET /scan/[id]` is a permalinked server-rendered
results page (including comparison if present).

## Accessibility (non-negotiable)

- Full keyboard operability: regions are buttons (real `<button>` or role=button
  with Enter/Space), visible focus rings, logical tab order, focus moves to the
  inspector detail when a region is selected and returns on back.
- Inspector detail announced via `aria-live=polite`; scan progress via aria-live.
- Color is never the only signal: every verdict pairs color with a text label
  (status tags on regions, labels in legends and lists).
- Verify contrast of the verdict colors on their tinted backgrounds meets WCAG AA;
  adjust shades if needed.
- `prefers-reduced-motion` disables the sweep and count-up animations.
- Semantic landmarks (header/main/aside), single h1 per view, labelled form input.
- Run `eslint-plugin-jsx-a11y` and fix all findings; add an automated axe check
  (vitest + axe-core) on the results view.

## Asset & build best practices

- Fonts via `next/font` (self-hosted Hanken Grotesk + IBM Plex Mono, swap, subset).
- No client-side fetching libraries beyond native fetch; keep the client bundle
  lean — engine code must never be imported into client components.
- Route-level code splitting (default in App Router) — verify the input page ships
  no results-view JS.
- Production build must pass `next build` with zero TypeScript or ESLint errors;
  add `npm run analyze` using @next/bundle-analyzer.
- Strict CSP headers (script-src self; adjust for Next requirements), no inline
  third-party scripts, security headers via next.config.

## NPM scripts (exact)

```json
{
  "setup": "npm install && npx playwright install chromium && npm run db:migrate",
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "db:migrate": "prisma migrate dev",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "lint": "next lint",
  "analyze": "ANALYZE=true next build"
}
```

## Environment (.env.example)

```
DATABASE_URL="file:./dev.db"
ALLOW_LOCAL_TARGETS=false        # set true to allow scanning localhost/private IPs
CRAWLER_USER_AGENT="GPTBot/1.0"  # user agent used for the crawler-view fetch
SCAN_TIMEOUT_MS=25000
ANTHROPIC_API_KEY=               # optional — enables AI prompt enhancement only
```

## Testing expectations

- Unit tests for differ (coverage math, script-variable detection), classifier
  (one fixture per issueType using saved HTML fixtures), scorer, SSRF guard
  (private IPs rejected, redirect re-check), prompt generation (snapshot tests
  asserting evidence values are embedded), bot-blocking detection (403-to-crawler
  fixture, challenge-page fixture, divergent-content fixture), comparer (delta and
  region matching incl. renamed/new/removed regions), URL normalization + dedupe
  window, and typed error mapping (non-HTML response, login redirect).
- One Playwright e2e: scan a local fixture page served by the test (a page with a
  server-rendered section + a JS-injected section), assert one green and one red
  region and a sensible score; then rescan an improved fixture of the same URL
  (with force) and assert the comparison shows a positive delta.

## README

Include: what the tool does (2 paragraphs), `npm run setup` + `npm run dev`
quickstart, the note that it runs fully offline-from-AI (no API keys needed),
the optional AI layer, how to scan localhost sites, the issue taxonomy table
(including the page-level `crawler_blocked` verdict), the rescan/compare and
fix-plan export features, and known limitations (the "invisible to most crawlers,
most of the time" caveat — some AI products use rendering search indexes).

## Acceptance criteria

1. `npm run setup && npm run dev` works on a fresh machine with Node 22.
2. Scanning a JS-heavy public page (e.g. a client-rendered SPA) yields red regions;
   scanning a server-rendered article yields mostly green.
3. Every red/yellow region produces a copyable prompt containing the real URL,
   detected stack, selector, and quantified evidence.
4. A site that blocks the crawler UA produces the `crawler_blocked` lead verdict
   with both fetch outcomes shown as evidence and a CDN/WAF fix prompt.
5. Rescanning a URL shows the score delta and per-region changes; "Download fix
   plan" produces one markdown doc with all prompts ordered by impact.
6. The crawler-view tab shows the exact stripped raw-HTML text used by the differ.
7. Each typed engine error (PDF URL, timeout, login-gated page) renders its
   dedicated helpful error state, with the URL preserved for retry.
8. Keyboard-only walkthrough of the entire flow is possible; axe reports no
   critical violations.
9. No LLM API key present → app fully functional.

Build it step by step: engine first with unit tests, then API, then UI. Show me the
plan before writing code, and flag any decision where you deviate from this spec.
