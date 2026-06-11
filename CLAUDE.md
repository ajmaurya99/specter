@AGENTS.md

# Specter — AI Visibility Scanner

Scans a URL two ways — raw HTML fetch (what AI crawlers see, no JS) and a
Playwright-rendered DOM (what humans see) — diffs them, classifies page
regions Visible/Partial/Invisible, scores 0–100, and generates copy-ready fix
prompts. Fully local, deterministic, no LLM key needed.

**Status: feature-complete and verified.** All phases built, adversarially
reviewed (20 findings fixed), 175 unit tests + 3 e2e green. Git history is
one descriptive commit per phase — read `git log` for the full work record.

**The contract is `specter-claude-code-prompt.md`** (the original spec).
Every intentional deviation from it is listed in README "Spec deviations" —
check there before "fixing" something that looks off-spec. User-facing docs
(taxonomy, features, limitations) live in README.md; don't duplicate them here.

## Commands

```sh
npm run setup        # fresh machine: install + chromium + migrate
npm run dev          # app on :3000
npm test             # vitest unit suite (tests/unit)
npm run test:e2e     # Playwright e2e — needs port 3000 FREE (stop dev first)
npm run lint         # eslint . (next lint no longer exists)
npm run typecheck    # tsc --noEmit
npx tsx scripts/scan-cli.ts <url>   # run the engine with no server
```

If `npm run build` typechecking complains about deleted routes, `rm -rf .next`
(stale generated route types).

## Architecture (load-bearing invariants)

- `lib/engine/` is **pure**: no Next.js imports, all IO injected
  (`browser`, `fetchImpl`, `lookup`, `probeLinks`, `saveScreenshot`,
  `enhancer`). Keep it importable without a server — `scan-cli.ts` is the proof.
- Client components import **types only** from the engine
  (`import type ... from "@/lib/engine/types"`); an eslint
  `no-restricted-imports` guard enforces it. Engine code must never reach the
  client bundle.
- All long-lived server state (queue, EventEmitter, Playwright browser,
  Prisma, SSE ring buffers, rate limiter) lives on `globalThis` via
  `Symbol.for` keys in `lib/server/registry.ts` — dev HMR re-evaluates
  modules. **One server instance only.**
- Scan pipeline: `POST /api/scan` → dedupe (10 min, per normalized URL) →
  in-process FIFO queue (concurrency 2) → `lib/server/scan-runner.ts` bridges
  engine→SQLite→event bus → SSE at `/api/scan/[id]/events` (replay via
  Last-Event-ID; `compress:false` in next.config is REQUIRED for SSE).
- Design tokens live ONLY in `app/globals.css` `@theme` (Tailwind v4
  CSS-first; default palette disabled via `--color-*: initial`).
  `tests/unit/contrast.test.ts` parses that CSS and enforces WCAG AA — change
  a color there and the test tells you if it's legal.
- Screenshots: JPEG files in `.specter-screenshots/` (gitignored), served by
  `/api/scan/[id]/screenshot`. The result JSON stores only {width, height},
  parsed from the actual JPEG bytes.

## Hard-won gotchas (do not re-learn these)

- **Stack realities (verified June 2026):** Next 16 = Turbopack default,
  `next lint` removed, `middleware.ts` → `proxy.ts`, route-handler `params`
  is a Promise. Prisma 7 = driver adapter mandatory
  (`@prisma/adapter-better-sqlite3`), `prisma.config.ts` + explicit dotenv,
  generated client in gitignored `lib/generated/` (postinstall runs
  `prisma generate`). ESLint pinned to ^9 (jsx-a11y peer range).
- **Playwright screenshots:** `screenshot({clip})` without `fullPage: true`
  silently captures only the viewport — this caused a serious overlay
  misalignment bug. Keep `fullPage: true` + clip, and keep advertising the
  JPEG's parsed dimensions.
- **Renderer settle pass:** before measuring geometry or screenshotting, the
  renderer freezes animations and walks the scroll height to fire
  lazy-loaders. Geometry, screenshot, and text must all come from that one
  settled state — never measure before settling.
- **cheerio `.text()`** glues block elements together ("DomainThis") —
  `extractRawText` inserts block-boundary newlines first. Real scoring bug
  once; don't simplify it away.
- **jsx-a11y severity escalation** in eslint.config.mjs must preserve each
  rule's options array and skip "off" rules — flattening to plain "error"
  resurrects deprecated rules and breaks configured ones.
- e2e asserts headings via `getByRole("heading", ...)` — bare `getByText`
  collides with Next's route announcer (strict-mode flake).
- The 10-minute dedupe returns cached scans: when testing scan changes, POST
  with `{"force": true}` or you'll be looking at stale results.

## Conventions

- Commit as the user (`Ajay <ajmaurya101@gmail.com>`) with the Claude
  co-author trailer; descriptive multi-line commit messages, one commit per
  coherent unit of work.
- Quality gate before any commit: `npm test && npm run lint && npm run
  typecheck` (plus e2e + `next build` for substantial changes).
- Copy tone is "plain, specific, expert": quantified evidence, buttons say
  what they do, errors give direction, never apologies. No emoji in UI, no
  gradients, monochrome chrome — color carries verdicts only.
- New engine behavior needs a unit test (fixture per issueType pattern in
  `tests/unit/classifier.test.ts`); UI a11y changes should keep the jsdom axe
  test and contrast test green.
