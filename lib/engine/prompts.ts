import * as cheerio from "cheerio";
import type { BotBlockVerdict, Fingerprint, RegionResult } from "./types";

/**
 * Copy-ready fix prompts, one template per issue type. Every prompt embeds
 * real scan data — page URL, detected stack, the region's selector, a
 * truncated snippet of its raw-response state, and the quantified evidence —
 * then numbered progressive-enhancement requirements and a no-JS
 * verification step.
 */

export const SNIPPET_MAX_CHARS = 600;

export interface PromptContext {
  url: string;
  stack: Fingerprint;
  rawHtml: string;
}

export function rawSnippetFor(rawHtml: string, selector: string): string {
  try {
    const $ = cheerio.load(rawHtml);
    const el = $(selector).first();
    if (el.length === 0) {
      return `(selector ${selector} is absent from the raw response — that absence is the problem)`;
    }
    const html = $.html(el).replace(/\s+/g, " ").trim();
    return html.length > SNIPPET_MAX_CHARS
      ? `${html.slice(0, SNIPPET_MAX_CHARS)}…`
      : html;
  } catch {
    return `(selector ${selector} could not be located in the raw response)`;
  }
}

function header(opening: string, region: RegionResult, ctx: PromptContext): string {
  return `${opening}

Page: ${ctx.url}
Stack: ${ctx.stack.stack}${ctx.stack.signals.length ? ` (signals: ${ctx.stack.signals.join(", ")})` : ""}
Region: "${region.name}" — selector ${region.selector}
Current state: ${region.evidence}
Raw response snippet for ${region.selector}:
${rawSnippetFor(ctx.rawHtml, region.selector)}`;
}

const VERIFY = (url: string, what: string) =>
  `Verify by fetching the page without JavaScript — \`curl -A "GPTBot" "${url}"\` — and confirming ${what}.`;

type Template = (region: RegionResult, ctx: PromptContext) => string;

const TEMPLATES: Record<string, Template> = {
  js_rendered_content: (region, ctx) => `${header(
    "My page renders this region entirely client-side, which makes its content invisible to AI crawlers that don't execute JavaScript. Help me fix it with progressive enhancement.",
    region,
    ctx,
  )}

What I need:
1. Render the same content as semantic HTML inside ${region.selector} in the initial server response (real headings, paragraphs, lists or a <table> — whatever matches the data).
2. Keep the existing client script, but have it hydrate or replace that server-rendered markup once it initializes — zero visual change for users.
3. If the data comes from an API the client calls, fetch it server-side at render time instead (or in addition).
${VERIFY(ctx.url, `the region's text appears in the response body`)}

Constraints: don't break the current UX, keep the markup accessible, and avoid a flash of unstyled content.`,

  data_in_script_variable: (region, ctx) => `${header(
    "This region's content exists in the initial response only as a JavaScript variable (JSON in an inline <script>), not as readable HTML. Most AI crawlers won't index script payloads as content. Help me fix it with progressive enhancement.",
    region,
    ctx,
  )}

What I need:
1. On the server, render the same data as semantic HTML inside ${region.selector} in the initial response (caption/thead/tbody if tabular, headings and paragraphs otherwise).
2. Keep the existing script and bootstrap variable, but have the client enhance the server-rendered markup in place instead of building it from scratch.
3. Make sure no content exists ONLY in the script payload.
${VERIFY(ctx.url, "the region's values are present as visible HTML text, not just inside <script>")}

Constraints: don't duplicate state in a way that can drift — the HTML and the variable must come from the same source of truth.`,

  iframe_embed: (region, ctx) => `${header(
    "This region's content lives inside an iframe. Crawlers index the parent page, not embedded frames, so everything inside the iframe is invisible here. Help me fix it with progressive enhancement.",
    region,
    ctx,
  )}

What I need:
1. Render a meaningful server-side HTML summary of the iframe's content inside ${region.selector} in the initial response (key facts, figures, or an excerpt — enough that a crawler understands what this region conveys).
2. Keep the iframe for interactive users; place the summary as adjacent content or replace it client-side once the frame loads.
3. If the embed is first-party, consider rendering its data directly into this page server-side instead of framing it.
${VERIFY(ctx.url, "the summary text appears in the response body")}

Constraints: the summary must stay in sync with the embedded content's source of truth.`,

  canvas_or_image_data: (region, ctx) => `${header(
    "My page renders this region's data as pixels (canvas or images without alt text), which makes the data invisible to AI crawlers that don't execute JavaScript. Help me fix it with progressive enhancement.",
    region,
    ctx,
  )}

What I need:
1. On the server, render the same data as a semantic HTML <table> inside ${region.selector} in the initial response (caption, thead, tbody) — or descriptive alt text if these are content-bearing images.
2. Keep the existing visualization, but have the script replace the table with the interactive version once it initializes — zero visual change for users.
3. Keep the table accessible (it doubles as the screen-reader path).
${VERIFY(ctx.url, "the table and its values are present")}

Constraints: don't break the current UX, keep the table accessible, and avoid a flash of unstyled content.`,

  partial_content: (region, ctx) => `${header(
    "Part of this region's content only appears after JavaScript runs, so AI crawlers see an incomplete version. Help me close the gap with progressive enhancement.",
    region,
    ctx,
  )}

What I need:
1. Identify what ${region.selector} gains client-side (lazy-loaded copy, \"read more\" expansions, API-fetched fragments) and render that remainder into the initial server response.
2. Keep client behavior as enhancement only — collapse/expand may hide text visually but the full text must exist in the HTML.
3. Watch for content behind intersection observers or tab panels that never makes it into the initial response.
${VERIFY(ctx.url, "the previously missing sentences appear in the response body")}

Constraints: no duplicate rendering paths that can drift apart.`,

  client_side_routes: (region, ctx) => `${header(
    "This region's navigation uses JavaScript-only routes (#/… or javascript:), which crawlers can't follow — every destination behind them is undiscoverable. Help me fix the routing.",
    region,
    ctx,
  )}

What I need:
1. Replace hash/JS routes in ${region.selector} with real URL paths (history API routing with server-rendered entry points), keeping client-side navigation as the enhancement.
2. Each destination must be fetchable server-side at its own URL with meaningful initial HTML.
3. Add the real URLs to internal links and the sitemap.
${VERIFY(ctx.url, "each linked destination returns its own content at a real path")}

Constraints: keep existing deep links working with redirects from the old #/ routes.`,

  hidden_but_present: (region, ctx) => `${header(
    "This content is present in the raw HTML but hidden via CSS in the rendered page. Crawlers can read it even though users don't see it — this is informational, but worth a deliberate decision.",
    region,
    ctx,
  )}

What I need:
1. Confirm the hidden text in ${region.selector} is intentional (e.g. a no-JS fallback, collapsed accordion, or screen-reader text) — those are fine.
2. If it's stale or contradicts the visible page, remove it: crawlers may quote it.
3. If it's the no-JS fallback for an interactive region, keep it — it's doing exactly the right job.
${VERIFY(ctx.url, "the hidden text matches what you intend crawlers to read")}`,

  fully_visible: (region, ctx) => `${header(
    "This region is fully visible to AI crawlers — no fix needed. For the record:",
    region,
    ctx,
  )}

Why it passes: the region's text exists in the initial HTML response, so crawlers index it without executing JavaScript.`,
};

export function buildFixPrompt(region: RegionResult, ctx: PromptContext): string {
  const template = TEMPLATES[region.issueType];
  return template(region, ctx);
}

export function buildBlockedFixPrompt(input: {
  url: string;
  crawlerUserAgent: string;
  crawler: { status: number; bytes: number };
  control: { status: number; bytes: number };
  evidence: string;
}): string {
  return `AI crawlers are blocked at my CDN/WAF before they ever see the page. Help me allowlist them safely.

Page: ${input.url}
Current state: a fetch with the AI-crawler user agent "${input.crawlerUserAgent}" gets HTTP ${input.crawler.status} (${input.crawler.bytes} bytes) while a normal desktop browser user agent gets HTTP ${input.control.status} (${input.control.bytes} bytes). ${input.evidence}

What I need:
1. Identify where the block happens (CDN bot-management rule, WAF managed challenge, or origin middleware) by checking which layer returns the ${input.crawler.status}.
2. Add an allow rule for the AI crawlers I want indexed — at minimum GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot — matching on verified user agent (and published IP ranges where the vendor supports it, e.g. Cloudflare "Verified Bots").
3. Keep protections for unverified scrapers: allowlist specific bots, don't disable bot management globally.
4. Verify with: curl -A "${input.crawlerUserAgent}" -sI "${input.url}" — expect HTTP 200 and the real page, not a challenge.

Constraints: this must be a deliberate policy change — confirm with whoever owns security that these crawlers are wanted.`;
}

export type { BotBlockVerdict };
