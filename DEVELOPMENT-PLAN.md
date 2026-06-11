> **Archived development plan.** This is the plan drawn up and approved on
> 2026-06-11, before any code was written (researched by a 6-agent web fan-out,
> drafted by an architect agent, then synthesized). It was executed in full —
> one git commit per phase. Post-plan additions not covered here: the
> 20 review fixes (commit 04d0b97), the Page view screenshot tab (45bc528,
> 1c3bccf), CLAUDE.md + run-specter skill (3d5cf04). The live list of spec
> deviations is maintained in README.md; where this plan and the code differ,
> the code and README win.

# Specter — Development Plan

## Context

Greenfield build of **Specter** (spec: `specter-claude-code-prompt.md`), an AI-visibility scanner:
scan a URL two ways — raw HTML fetch (what AI crawlers see, no JS) and a Playwright-rendered DOM
(what humans see) — diff them, classify page regions Visible/Partial/Invisible, compute a 0–100
score, and generate copy-ready fix prompts. Fully local, deterministic, no LLM API needed.
The directory contains only the spec; nothing exists yet. The spec mandates build order
(engine → API → UI) and asks that every deviation be flagged — see §2.

Stack verified against June 2026 releases by a research fan-out (6 web-research agents):
**Next.js 16.2.9** (Turbopack default for dev+build, `next lint` removed, `middleware.ts` → `proxy.ts`),
React 19.2.7, **Tailwind 4.3** (CSS-first `@theme`, no config file), **Prisma 7.8** (driver adapters
mandatory, `prisma.config.ts`, explicit generated-client output; `Json` IS supported on SQLite since 6.2),
**Playwright 1.60** (already in Next's default `serverExternalPackages`), Vitest 4.1, Zod 4.4 (root import),
Node 22 (Maintenance LTS until 2027-04 — acceptable per spec). Will `git init` and commit per phase.

## 1. Deviations from spec (flagged upfront, as the spec requests)

1. **`"lint": "eslint ."` not `"next lint"`** — `next lint` is fully removed in Next 16; `next build` no longer lints either.
2. **`"analyze": "next experimental-analyze"` not `ANALYZE=true next build`** — @next/bundle-analyzer is webpack-only and produces nothing under Turbopack (Next 16's default); this is the official replacement.
3. **ESLint pinned to 9.x** (not latest 10.x) — `eslint-plugin-jsx-a11y@6.10.2` (spec-required) peer-ranges stop at ^9.
4. **Amber `#B98A0E` → `#8C680B` for text/icon use** — computed contrast 3.13:1 on white and 2.83:1 on its own 10% tint (fails WCAG AA, even the 3:1 large-text bar); replacement passes 5.12:1 / 4.50:1. Green/red get similarly darkened `*-text` variants for normal-size text on tints; original hues stay for fills/dots/bars. Spec explicitly authorizes shade adjustment.
5. **Nonce-based CSP** (`script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'unsafe-inline'`) in `proxy.ts` — bare `script-src 'self'` is impossible with App Router's inline flight scripts; style nonces break on Next's route announcer + client-nav style injection. Dev-only `'unsafe-eval'`. Spec pre-authorizes "adjust for Next requirements".
6. **`compress: false`** in next.config — Next's default gzip buffers SSE; the live phase streaming is otherwise unreliable.
7. **Scorer weights normalized to sum 1** after `max(wordShare, areaShare)` — raw maxes sum > 1; normalization is the only reading that keeps score ≤ 100. (Interpretation, flagged.)
8. **Added scripts** `"postinstall": "prisma generate"` (Prisma 7 generates the client to a gitignored path; codegen must precede build/test) and `"typecheck": "tsc --noEmit"`. Additive only — all spec scripts keep their exact names/semantics.
9. **`prisma.config.ts` + dotenv + `DATABASE_URL` fallback** to `file:./dev.db` — Prisma 7 no longer reads url from schema or auto-loads `.env`; the fallback keeps `npm run setup` working on a fresh machine with no `.env`.
10. IBM Plex Mono has **no 800 weight** (static family, 100–700) — mono uses 400–700; Hanken Grotesk is variable (includes 800) so display headings are unaffected.

## 2. Build phases

### Phase 0 — Scaffold + de-risking smoke tests
- `npx create-next-app@latest .` (TS, ESLint flat config, Tailwind v4, App Router, **no src dir** — spec mandates top-level `/app`, `/lib`, `/components`; decline React Compiler), then pin deps per §Context. Add `cheerio` (server-side raw-HTML parsing for snippets/stripping).
- Prisma 7 init: `prisma/schema.prisma` (`provider = "sqlite"`, generator `prisma-client` with `output = "../lib/generated/prisma"`), `prisma.config.ts`, first migration, `lib/server/prisma.ts` globalThis singleton with `PrismaBetterSqlite3` adapter.
- `next.config.ts` (compress: false, security headers), `proxy.ts` (nonce CSP), `instrumentation.ts` stub, `lib/server/env.ts` (Zod-validated env, defaults per `.env.example`), fonts via `next/font/google` in `app/layout.tsx`, design tokens as Tailwind `@theme` in `app/globals.css`, `vitest.config.ts`, `playwright.config.ts`, npm scripts exactly as §1 resolves them.
- **Three day-one smoke tests for the known integration risks:** (a) `next build` with Prisma 7's generator under Turbopack (open WASM-resolution issue — fallbacks ready: `serverExternalPackages: ['@prisma/client']` + `turbopack.resolveAlias`, or `prisma-client-js` provider); (b) an SSE echo route streaming 1 event/sec, verified incremental under both `next dev` and `next start`; (c) a route that launches Playwright chromium and returns a page title.
- **Done when:** `npm run setup && npm run dev` works from clean state; build/test/lint pass; smoke routes verified; placeholder page shows both fonts + gray palette.

### Phase 1 — Engine + unit tests (pure, zero Next.js imports, deps injected)
Module order, each tested before the next: `types` → `text` (normalize/shingles) → `normalize` (URL) → `fingerprint` → `differ` → `scorer` → `classifier` → `prompts` → `comparer` → `robots` → `fetcher` → `renderer` → `index` (`runScan` orchestrator), plus `lib/enhancer.ts` (`PromptEnhancer` interface, no-op default, env-gated Anthropic impl that never breaks without a key).
Key decisions:
- **fetcher**: manual redirect following (max 5), SSRF check via `dns.lookup({all:true})` re-run before EVERY hop (reject private/reserved v4+v6 ranges, IP-literal hosts, non-http(s) schemes; skipped when `ALLOW_LOCAL_TARGETS=true`); dual-UA bot-block detection with multi-signal thresholds (status 401/403/429 while control 2xx; challenge markers; shingle-similarity < 0.4 AND crawler text < 50% of control length — guards false positives; control-fetch failure ⇒ never claim blocked); typed errors `unsupported_content_type | timeout | dns_or_network | login_redirect | render_failed`; injectable `fetchImpl` so tests use canned Responses.
- **renderer**: injected Browser; one context per scan, viewport 1280×2000, `context.route` aborts image/font/media (never stylesheets — layout matters); `goto(url, {waitUntil:'domcontentloaded', timeout:15s})` then `waitForLoadState('networkidle', {timeout:25s}).catch(()=>{})` — the built-in timeout is the hard cap, partial render proceeds. Segmentation in ONE `page.evaluate`: landmarks + direct children of main (sections / divs >80px), recursive descent if <3 regions, merge <40px neighbors, cap ~24; returns `{selector, name, text, rect, flags, links}`; selectors are plain CSS so they round-trip into cheerio against the raw HTML. Real-chromium integration test gated behind `RUN_RENDERER_TESTS=1`; main suite never launches a browser.
- **differ**: 6-word shingle sets, regions <~12 words fall back to distinctive tokens (numbers, rare words); identical check against inline-script text (with JSON-unescape variant) → `foundInScripts`.
- **classifier**: rule precedence `hidden_but_present → iframe_embed → canvas_or_image_data → data_in_script_variable → js_rendered_content → client_side_routes (injected HEAD-prober, ≤3 links) → fully_visible → partial_content`; builds quantified evidence strings. Fixtures: one dir per issueType — `tests/fixtures/<issueType>/{raw.html, regions.json}` (hand-authored renderer output) so classifier tests are Playwright-free.
- **scorer**: `weight = max(wordShare, areaShare)` normalized to sum 1; `score = round(Σ w × {ok:1, warn:0.5, bad:0} × 100)`; `crawler_blocked` caps at 10.
- **prompts**: spec's exact template skeleton per issueType + CDN/WAF template; raw snippet via cheerio lookup of the region selector (~600 chars; absence is itself evidence). Snapshot tests assert real URL/stack/selector/evidence embedded.
- **comparer**: selector-exact match, then name token-Jaccard ≥ 0.6; `improved/regressed/unchanged/new/removed`.
- `scripts/scan-cli.ts` (tsx) runs `runScan` from the terminal — proves "importable without a server".
- **Done when:** `vitest run` covers every item in the spec's Testing expectations; CLI scan of a real URL prints a sane ScanResult.

### Phase 2 — Persistence, queue, API
- **Schema** (one table suffices): `Scan { id cuid, inputUrl, normalizedUrl, status, errorType?, errorMessage?, score?, result Json?, comparison Json?, createdAt, finishedAt? }` + indexes on `(normalizedUrl, createdAt)` and `status`. Blobs are opaque (SQLite has no JSON filtering) — exactly our access pattern; Zod-validate at read boundary; truncate stored `rawText` at 500KB.
- **`lib/server/registry.ts`** — all long-lived state on `globalThis` under `Symbol.for('specter.registry')` (queue, EventEmitter, browser promise, per-scan event ring buffers, rate-limit map): survives dev HMR and route-bundle duplication.
- **`browser.ts`** — lazy `chromium.launch()` promise on the registry; `on('disconnected')` clears cache so next scan relaunches; scan-runner retries once on disconnect.
- **`queue.ts`** — in-process FIFO, concurrency 2, returns queuePosition; worker updates `Scan.status`, appends to ring buffer, emits `scan:<id>`; kickoff wrapped in `after()` for graceful-shutdown draining; on completion runs comparer vs previous done scan for the normalizedUrl and persists `comparison`.
- **`instrumentation.ts`** — `register()` (gated `NEXT_RUNTIME === 'nodejs'`): boot-sweep non-terminal scans to error "interrupted by server restart"; SIGTERM/SIGINT browser close.
- **Routes**: `POST /api/scan` (Zod → IP rate limit 10/min sliding window → normalize → 10-min dedupe unless `force` → create+enqueue); `GET /api/scan/[id]`; `GET /api/scan/[id]/events` (SSE: `force-dynamic`, `text/event-stream` + `no-transform` + `X-Accel-Buffering: no`, replay buffer honoring Last-Event-ID, 15s heartbeats, teardown in BOTH `request.signal` abort and stream `cancel()`); `GET /api/scan/[id]/fix-plan` (markdown, prompts ordered by weight × severity); `GET /api/scan/[id]/report` (self-contained HTML export); `GET /api/scans` (recent, latest per URL + delta).
- **Done when (curl-only):** POST → `{scanId, queuePosition}`; `curl -N` streams the four real phases + telemetry → done; re-POST within 10 min → `cached: true`; `force` bypasses; 11th/min → 429; 3rd concurrent → queuePosition 1; localhost rejected unless `ALLOW_LOCAL_TARGETS=true`.

### Phase 3 — UI (three screens + states)
- **Boundary rule:** engine imported only by `lib/server/*` + route handlers; client components get plain JSON props and `import type` only. ESLint `no-restricted-imports` guard enforces it. Verify input page ships no results-view JS.
- `/` — server component: headline, `<ScanForm/>` (client; reads `?url=` for error-retry prefill; `cached:true` response → navigate with cached age), three-dot `<VerdictLegend/>`, `<RecentScans/>` (direct Prisma query; score + mono ±delta).
- `/scan/[id]` — server component, THE permalink; branches on status:
  - in-progress → `<ScanProgress/>` (client): EventSource-driven ghost-page skeleton + CSS sweep (motion-safe only), real phase text + mono telemetry, queue position, final-phase verdict tinting bar-by-bar; `done`/`error` → `router.refresh()`. aria-live status. Polling fallback after two EventSource failures.
  - error → `<ErrorState/>`: dedicated panel per typed error, URL preserved for one-tap retry; direction, never apologies.
  - done → `<ResultsExplorer/>` (client, owns selection): `<BlockedPanel/>` lead when blocked (both fetch outcomes, CDN/WAF prompt, de-emphasized map below); `<CompareBanner/>` ("62 → 84, +22", link to previous permalink); left `<ViewTabs/>` → `<RegionMap/>` | `<CrawlerViewTab/>` (exact differ input text, mono, scrollable); right `<Inspector/>` (animated `<ScoreCountUp/>`, stacked bar, issues-first list with icon+text change markers) flipping to detail (status chip → evidence mono block → why → fix → `<PromptBox/>` with "Copied ✓"); below: `<PageChecksPanel/>`, honesty caveat, `<ExportButtons/>` (plain anchors to report/fix-plan), `<CachedNotice/>` with "Rescan now" (force POST).
- **Region-map scaling:** regions are real `<button>`s, percentage-positioned from bounding boxes (`x/1280·100%`), min-height clamp 28px, tint background + uppercase status tag + name + flag-driven skeleton shapes (table→grid, canvas→blob, default→bars).
- **Focus choreography:** select region → focus inspector detail heading; back → returns focus; detail `aria-live="polite"`; landmarks; single h1/view.
- **Done when:** manual walkthrough — CSR SPA shows red, server-rendered article green, Cloudflare-challenged site leads blocked, PDF URL shows its error screen with retry; rescan shows compare banner; exports download.

### Phase 4 — a11y, e2e, polish, README, verification
- jsx-a11y recommended at error severity (all fixed); jsdom axe unit test on Results view (color/page-level rules disabled — meaningless in jsdom); **contrast unit test** computing WCAG ratios for every (text, bg) token pair — locks in the darkened verdict shades; reduced-motion pass; keyboard-only walkthrough.
- e2e (`e2e/scan.spec.ts` + `fixture-server.ts`): plain `node:http` fixture server with mutable mode — `/page` serves *before* (server-rendered section + JS-injected section) or *after* (improved); plus `/pdf`, `/login-redirect`, `/blocked` (403 for GPTBot UA). Playwright `webServer` runs `next build && next start` with `ALLOW_LOCAL_TARGETS=true` + throwaway DB. Test: scan → ≥1 green + ≥1 red + sane score → flip mode → force rescan → positive delta + improved markers → `@axe-core/playwright` pass (real Chromium covers color-contrast).
- README per spec (incl. taxonomy table, crawler_blocked, localhost scanning, optional AI layer, limitations); `next build` zero TS/ESLint errors; CSP verified under `next start` (no console violations, SSE works).
- **Done when:** all 9 acceptance criteria pass (each mapped to a concrete check: fresh-machine setup script run, fixture-driven red/green, prompt snapshot tests, blocked fixture, rescan delta, crawler-tab text assertion, typed-error screens, keyboard+axe, full suite green with no ANTHROPIC_API_KEY).

## 3. Top risks & mitigations

| Risk | Mitigation |
|---|---|
| Turbopack × Prisma 7 generator WASM resolution at build (open issue) | Phase-0 smoke test; fallbacks: serverExternalPackages + resolveAlias → `prisma-client-js` provider → `next build --webpack` |
| SSE buffered or broken (gzip, dev, flaky abort) | compress:false + no-transform + X-Accel-Buffering; teardown in abort AND cancel(); heartbeats; Phase-0 smoke in dev+start; UI polling fallback |
| `networkidle` hangs on pollers/websockets | domcontentloaded goto + capped waitForLoadState with .catch() — proceed with partial render; pipeline budget timer → typed timeout |
| Bot-block false positives (consent walls, control fetch fails) | Multi-signal thresholds; divergence never triggers without size guard; control failure ⇒ crawler-only note, never `crawler_blocked` |
| Segmentation garbage on arbitrary pages (1 giant region / 200 slivers) | Recursive descent <3 regions, merge <40px, cap 24; areaShare floor; tune on saved real-world fixtures; honest fallback: single "page body" region |
| HMR/restart leaks (chromium, queue, stale 'running' rows) | globalThis registry; disconnected-handler relaunch; instrumentation boot sweep |
| JSON blob bloat / type drift | Zod-parse at read boundary; 500KB rawText cap; list queries use scalar columns only |

## 4. Target file map

```
app/{layout,page}.tsx · app/globals.css · app/scan/[id]/page.tsx
app/api/scan/route.ts · app/api/scan/[id]/{route,events/route,fix-plan/route,report/route}.ts · app/api/scans/route.ts
lib/engine/{types,index,fetcher,renderer,differ,classifier,scorer,prompts,comparer,fingerprint,normalize,text,robots,errors}.ts
lib/server/{registry,queue,scan-runner,browser,prisma,rate-limit,env}.ts · lib/enhancer.ts
components/{ScanForm,VerdictLegend,RecentScans,ScanProgress,ResultsExplorer,RegionMap,Inspector,RegionList,ScoreCountUp,StackedBar,PromptBox,CopyButton,CrawlerViewTab,CompareBanner,BlockedPanel,PageChecksPanel,ErrorState,ExportButtons,CachedNotice}.tsx
prisma/schema.prisma · prisma.config.ts · proxy.ts · instrumentation.ts · next.config.ts
eslint.config.mjs · vitest.config.ts · playwright.config.ts · postcss.config.mjs
tests/unit/* · tests/fixtures/<issueType>/{raw.html,regions.json} · tests/fixtures/botblock/*
e2e/{scan.spec.ts,fixture-server.ts} · scripts/scan-cli.ts · README.md · .env.example
```

## 5. Verification summary

Engine: full Vitest suite per the spec's Testing expectations (differ math, per-issueType classifier fixtures, scorer, SSRF incl. redirect re-check, prompt snapshots, bot-block fixtures, comparer, normalization+dedupe, typed errors). API: curl checklist (Phase 2 done-when). UI/a11y: axe in jsdom + real-Chromium axe in e2e + contrast token test + keyboard walkthrough. End-to-end: fixture-server e2e covering acceptance criteria 2–7; fresh-machine `npm run setup && npm run dev` for criterion 1; suite runs with no `ANTHROPIC_API_KEY` for criterion 9.
