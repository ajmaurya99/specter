import type { Browser } from "playwright";
import { createEnhancer, noopEnhancer, type PromptEnhancer } from "../enhancer";
import { classify } from "./classifier";
import { createDiffer } from "./differ";
import {
  assertPublicHost,
  fetchCrawlerView,
  type CrawlerView,
  type LookupFn,
} from "./fetcher";
import { fingerprint } from "./fingerprint";
import { buildFixPrompt } from "./prompts";
import { renderPage } from "./renderer";
import { parseRobots, robotsGrid } from "./robots";
import { BLOCKED_SCORE_CAP, computeScore } from "./scorer";
import type {
  LinkProber,
  PageChecks,
  ProbeOutcome,
  ScanPhase,
  ScanResult,
} from "./types";

export { EngineError, isEngineError } from "./errors";
export { normalizeUrl, isWithinDedupeWindow, DEDUPE_WINDOW_MS } from "./normalize";
export type * from "./types";

/**
 * The whole pipeline: fetch → render → diff → classify → score → prompts.
 * Pure orchestration over injected IO — importable and unit-testable without
 * a server (see scripts/scan-cli.ts). Throws EngineError only.
 */

export interface ScanInput {
  /** Normalized URL the scan runs against. */
  url: string;
  /**
   * The URL exactly as the user typed it. Normalization strips the fragment,
   * so the "requires JS routing" page check must look at the original.
   */
  originalUrl?: string;
  crawlerUserAgent: string;
  timeoutMs: number;
  allowLocal: boolean;
}

export interface ScanDeps {
  browser: Browser;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
  onProgress?: (phase: ScanPhase, telemetry: Record<string, unknown>) => void;
  enhancer?: PromptEnhancer;
  now?: () => Date;
}

export async function runScan(input: ScanInput, deps: ScanDeps): Promise<ScanResult> {
  const progress = deps.onProgress ?? (() => {});
  const enhancer = deps.enhancer ?? noopEnhancer;
  const fetchImpl = deps.fetchImpl ?? fetch;

  progress("fetching", { url: input.url });
  const view = await fetchCrawlerView(
    {
      url: input.url,
      crawlerUserAgent: input.crawlerUserAgent,
      allowLocal: input.allowLocal,
    },
    { fetchImpl: deps.fetchImpl, lookup: deps.lookup },
  );

  const analysisUrl =
    view.blocked && view.control ? view.control.finalUrl : view.crawler.finalUrl;

  progress("rendering", {
    statusCode: view.crawler.status,
    bytes: view.crawler.bytes,
    controlStatusCode: view.control?.status ?? null,
    blocked: view.blocked !== null,
  });
  const renderStarted = Date.now();
  const render = await renderPage(
    { url: analysisUrl, timeoutMs: input.timeoutMs },
    {
      browser: deps.browser,
      // The page's own JS runs in the renderer and can issue requests; keep
      // it away from private hosts unless local targets are allowed.
      isHostAllowed: input.allowLocal
        ? undefined
        : makeHostGate(deps.lookup),
    },
  );
  const renderDurationMs = Date.now() - renderStarted;

  progress("diffing", {
    requestCount: render.requestCount,
    regionCount: render.regions.length,
    rawBytes: view.crawler.bytes,
  });
  const differ = createDiffer(view.rawText, view.inlineScriptText);
  const diffedRegions = render.regions.map((region) => ({
    ...region,
    ...differ.diff(region.text),
  }));

  progress("classifying", {
    regionCount: render.regions.length,
    requestCount: render.requestCount,
  });
  const { regions } = await classify({
    regions: diffedRegions,
    hiddenBlocks: render.hiddenBlocks,
    rawText: view.rawText,
    rawHtml: view.rawHtml,
    baseUrl: analysisUrl,
    probeLinks: defaultProber(fetchImpl, analysisUrl),
  });

  // hidden_but_present entries are informational — they carry no weight and
  // must not move the score.
  const { score } = computeScore(
    regions.filter((r) => r.issueType !== "hidden_but_present"),
  );
  const finalScore = view.blocked ? Math.min(score, BLOCKED_SCORE_CAP) : score;

  const stack = fingerprint(view.rawHtml);
  const promptCtx = { url: analysisUrl, stack, rawHtml: view.rawHtml };
  await Promise.all(
    regions
      .filter((region) => region.issueType !== "fully_visible")
      .map(async (region) => {
        const template = buildFixPrompt(region, promptCtx);
        region.fixPrompt = await enhancer.enhance(template, {
          url: analysisUrl,
          issueType: region.issueType,
          stack: stack.stack,
        });
      }),
  );

  const scannedAt = (deps.now?.() ?? new Date()).toISOString();

  return {
    url: input.url,
    finalUrl: view.crawler.finalUrl,
    scannedAt,
    score: finalScore,
    blocked: view.blocked,
    stack,
    regions,
    pageChecks: buildPageChecks(view, input.originalUrl ?? input.url, analysisUrl),
    rawText: view.rawText,
    telemetry: {
      crawlerStatus: view.crawler.status,
      crawlerBytes: view.crawler.bytes,
      controlStatus: view.control?.status ?? null,
      controlBytes: view.control?.bytes ?? null,
      fetchDurationMs: view.crawler.durationMs,
      renderDurationMs,
      requestCount: render.requestCount,
    },
    pageHeight: render.pageHeight,
    viewportWidth: 1280,
    crawlerUserAgent: input.crawlerUserAgent,
  };
}

function buildPageChecks(
  view: CrawlerView,
  // The PRE-normalization URL: normalizeUrl strips fragments, so #/ routes
  // are only detectable on what the user actually typed.
  inputUrl: string,
  analysisUrl: string,
): PageChecks {
  const path = safePathname(analysisUrl);
  const sitemaps = view.robotsContent
    ? parseRobots(view.robotsContent).sitemaps
    : [];
  return {
    robotsTxt: {
      present: view.robotsContent !== null,
      grid: robotsGrid(view.robotsContent, path),
    },
    llmsTxt: view.llmsTxt,
    hasJsonLd: /<script[^>]+type=["']application\/ld\+json["']/i.test(view.rawHtml),
    hasTitle: /<title[^>]*>\s*[^<\s]/i.test(view.rawHtml),
    hasMetaDescription:
      /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i.test(
        view.rawHtml,
      ) ||
      /<meta[^>]+content=["'][^"']+["'][^>]+name=["']description["']/i.test(
        view.rawHtml,
      ),
    hasSitemapReference:
      sitemaps.length > 0 || /<link[^>]+rel=["']sitemap["']/i.test(view.rawHtml),
    requiresJsRouting: inputUrl.includes("#/"),
  };
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

/**
 * Per-host allow/deny for renderer subresource requests, with a cache so a
 * page with many same-host requests resolves DNS once.
 */
function makeHostGate(lookup?: LookupFn): (hostname: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return (hostname: string) => {
    let cached = cache.get(hostname);
    if (!cached) {
      cached = assertPublicHost(hostname, lookup).then(
        () => true,
        () => false,
      );
      cache.set(hostname, cached);
    }
    return cached;
  };
}

/**
 * Spec-mandated verification for client_side_routes: HEAD up to 3 candidate
 * links and check whether they resolve to distinct content. Hash routes strip
 * to the page itself; a route that 200s at a different path with its own
 * content-length is treated as distinct (clears the issue).
 */
function defaultProber(fetchImpl: typeof fetch, pageUrl: string): LinkProber {
  return async (urls: string[]): Promise<ProbeOutcome[]> => {
    const page = new URL(pageUrl);
    return Promise.all(
      urls.map(async (url): Promise<ProbeOutcome> => {
        try {
          const target = new URL(url);
          target.hash = "";
          page.hash = "";
          if (target.toString() === page.toString()) {
            // A fragment can never reach the server — same document.
            return { url, status: null, distinctContent: false };
          }
          const res = await fetchImpl(target.toString(), {
            method: "HEAD",
            redirect: "manual",
            signal: AbortSignal.timeout(5_000),
          });
          return {
            url,
            status: res.status,
            distinctContent: res.status >= 200 && res.status < 300,
          };
        } catch {
          return { url, status: null, distinctContent: false };
        }
      }),
    );
  };
}

export { createEnhancer, noopEnhancer };
export type { PromptEnhancer };
