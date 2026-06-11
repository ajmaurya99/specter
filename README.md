# Specter — AI Visibility Scanner

Specter scans any webpage and shows you which parts of it are visible to AI
crawlers versus what human visitors see. AI crawlers (GPTBot, ClaudeBot,
PerplexityBot, and friends) fetch your raw HTML and do **not** execute
JavaScript — so everything your page renders client-side simply does not exist
for them. Specter fetches your page the way a crawler does, renders it the way
a browser does, diffs the two, and draws you a region map of the page with
three verdicts: **Visible** (green), **Partially visible** (yellow), and
**Invisible** (red), plus a 0–100 visibility score.

Every red or yellow region comes with quantified evidence ("412 words
rendered · 0 found in initial HTML") and a copy-ready prompt you can paste
into an AI coding assistant to fix the issue with progressive enhancement.
The analysis is fully deterministic — fetch + render + diff + rule-based
classification + template prompts — and runs entirely on your machine. **No
LLM API key is needed for anything Specter does.**

## Quickstart

Requires Node 22+ and npm.

```sh
npm run setup   # installs deps, downloads chromium, migrates the local SQLite db
npm run dev     # http://localhost:3000
```

That's it — paste a URL and scan. Everything (engine, queue, database, UI)
runs in the one Next.js process; there are no external services.

## How a scan works

1. **Crawler view** — the URL is fetched twice: once with an AI-crawler user
   agent (`GPTBot/1.0` by default) and once with a desktop-browser user agent.
   Comparing the two detects bot blocking at the CDN/WAF layer. robots.txt and
   llms.txt are checked too.
2. **Rendered view** — headless Chromium renders the page (images/fonts/media
   blocked, 25 s budget) and segments it into regions from the semantic
   structure with real bounding boxes.
3. **Diff** — each region's visible text is searched for in the raw HTML using
   shingled 6-word sequences (distinctive tokens for short regions), plus a
   separate check against inline `<script>` payloads.
4. **Classify & score** — each region gets a verdict from the taxonomy below.
   A region's weight is its share of the page, `max(word share, area share)`,
   normalized so weights sum to 1; score = Σ weight × (ok=1, warn=0.5, bad=0) × 100.

## Issue taxonomy

| Issue | Verdict | Meaning |
| --- | --- | --- |
| `fully_visible` | green | ≥ 90 % of the region's text is in the raw HTML. |
| `partial_content` | yellow | Between 15 % and 90 % is in the raw HTML — the rest arrives via JS. |
| `data_in_script_variable` | yellow | The content ships only as JSON inside an inline `<script>` — code, not indexable text. |
| `client_side_routes` | yellow | Most of the region's links are `#/…` or `javascript:` routes a crawler cannot follow (verified by probing them server-side). |
| `js_rendered_content` | red | The region is rendered entirely client-side; its text is absent from the raw response. |
| `iframe_embed` | red | The content lives in an iframe — crawlers index the parent page, not frames. |
| `canvas_or_image_data` | red | The data exists only as pixels (canvas, or images without alt text). |
| `hidden_but_present` | green (note) | Text is in the raw HTML but CSS-hidden in the render. Crawlers read it; make sure that's intentional. |
| `crawler_blocked` | **page-level** | The crawler UA gets 401/403/429, a challenge page, or substantially different content while a browser UA gets the real page. This verdict leads the report ("AI crawlers are blocked at the door — fix this first"), caps the score at 10, and ships a CDN/WAF allowlisting prompt. Regions are still analyzed from the browser view. |

## Rescan & compare

Scans are stored per normalized URL (lowercase host, default port/fragment/
tracking params stripped). When a URL with a previous completed scan is
rescanned, Specter stores a comparison with the score delta and per-region
changes (`improved / regressed / unchanged / new / removed`, matched by
selector then by name similarity) — the report permalink leads with
"62 → 84 (+22)" and marks changed regions on the map and list.

Scanning the same URL twice within 10 minutes returns the cached scan with a
"Scanned N min ago" notice and a **Rescan now** button that bypasses the cache.

## Exports

- **Download fix plan** — one markdown document: scan summary, page-level
  checks, then every red/yellow region's full fix prompt ordered by score
  impact. Hand it to your dev team.
- **Export report** — a self-contained HTML file of the results (no scripts,
  inline styles) you can attach or archive.

Every scan also has a shareable server-rendered permalink at `/scan/<id>`.

## Scanning localhost sites

By default Specter refuses private/reserved targets (SSRF protection —
127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1,
fc00::/7, re-checked on every redirect hop). To scan your own local dev
server, set this in `.env` and restart:

```
ALLOW_LOCAL_TARGETS=true
```

## Optional AI features

Specter never needs an LLM. If you set `ANTHROPIC_API_KEY` in `.env`, the
generated fix prompts are additionally polished by Claude (`claude-opus-4-8`)
via the `PromptEnhancer` seam in `lib/enhancer.ts`; with no key — or on any
API failure — the app silently uses the built-in templates. Nothing else
changes and nothing degrades.

## Configuration

`.env` (see `.env.example` — all values have working defaults):

```
DATABASE_URL="file:./dev.db"
ALLOW_LOCAL_TARGETS=false        # set true to allow scanning localhost/private IPs
CRAWLER_USER_AGENT="GPTBot/1.0"  # user agent used for the crawler-view fetch
SCAN_TIMEOUT_MS=25000
ANTHROPIC_API_KEY=               # optional — enables AI prompt enhancement only
```

## Development

```sh
npm run dev        # dev server
npm test           # unit tests (engine, classifier fixtures, contrast, axe)
npm run test:e2e   # Playwright e2e against a local fixture site
npm run lint       # eslint (incl. jsx-a11y at error severity)
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run analyze    # Turbopack bundle analyzer (next experimental-analyze)
npx tsx scripts/scan-cli.ts <url>   # run the engine with no server at all
```

The analysis engine (`lib/engine/`) is pure: no Next.js imports, all IO
injected, fully unit-testable — `scripts/scan-cli.ts` is the proof.

**Run exactly one server instance.** The scan queue, progress events, and
rate limiter live in process memory; a cluster/PM2 multi-instance setup would
split them. Scans interrupted by a restart are marked as errors at boot and
can simply be rescanned.

**Keyboard walkthrough** (covered by the a11y tests; worth repeating by hand
after UI changes): Tab to the URL field → type a URL → Enter submits → the
scanning screen announces phases via `aria-live` → on the results page, Tab
reaches tabs, map regions (real buttons), and the inspector list; Enter on a
region moves focus into the detail view; "← All regions" returns focus to
where you were. The verdict colors are never the only signal — every verdict
is paired with a text label.

## Spec deviations (flagged intentionally)

- `lint` runs `eslint .` — `next lint` was removed in Next.js 16.
- `analyze` runs `next experimental-analyze` — `@next/bundle-analyzer` is
  webpack-only and Next 16 builds with Turbopack.
- ESLint is pinned to 9.x (`eslint-plugin-jsx-a11y`'s peer range).
- Contrast-driven shade adjustments (the spec authorizes these): amber
  `#B98A0E` → fill `#A87E0D` / text `#8C680B`, green text `#207147`, red text
  `#B03A2F`, muted gray `#6E7572` → `#69706D`. Locked by `tests/unit/contrast.test.ts`.
- Scorer weights are normalized to sum to 1 after `max(wordShare, areaShare)`
  (raw maxes can exceed 1; normalization keeps the score ≤ 100).
- CSP is nonce-based (`script-src 'self' 'nonce-…' 'strict-dynamic'`) with
  `style-src 'unsafe-inline'` — the App Router's inline hydration scripts make
  bare `script-src 'self'` impossible, and Next injects inline styles.
- `postinstall: prisma generate` and `typecheck` scripts were added (Prisma 7
  generates its client into the gitignored `lib/generated/`).

## Known limitations

- **The honest caveat:** verdicts reflect what most AI crawlers retrieve —
  the raw HTML response, without executing JavaScript. "Invisible" means
  invisible to *most crawlers, most of the time*, not all: some AI products
  answer from search indexes that do render JavaScript.
- The dual-UA bot-block check detects UA-based blocking; IP-reputation-based
  blocking (which may not trigger from your machine) can differ in production.
- Region segmentation is heuristic. Unusual layouts may merge or split
  regions differently than you'd draw them — the crawler-view tab always
  shows the ground truth text.
- One page per scan; Specter doesn't crawl your whole site.
- The SSRF guard resolves DNS before fetching but does not pin the resolved
  address (a hostile DNS server could in theory rebind between check and
  fetch). Don't expose Specter as a public service without addressing this.
