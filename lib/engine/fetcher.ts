import { lookup as dnsLookup } from "node:dns/promises";
import { EngineError } from "./errors";
import { buildBlockedFixPrompt } from "./prompts";
import {
  countWords,
  extractInlineScripts,
  extractRawText,
  shingles,
  tokenize,
} from "./text";
import type { BotBlockVerdict, FetchOutcome } from "./types";

/**
 * Crawler-view fetch: what an AI crawler receives, plus a control fetch with
 * a desktop-browser user agent to detect bot blocking at the door.
 * SSRF guard is mandatory: hostnames are resolved and private/reserved
 * ranges rejected before EVERY request, including each redirect hop.
 */

export const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

export const MAX_REDIRECTS = 5;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 3_000_000;

export type LookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export interface FetcherDeps {
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
}

export interface FetcherInput {
  url: string;
  crawlerUserAgent: string;
  browserUserAgent?: string;
  allowLocal: boolean;
  timeoutMs?: number;
}

export interface CrawlerView {
  crawler: FetchOutcome;
  control: FetchOutcome | null;
  blocked: BotBlockVerdict | null;
  robotsContent: string | null;
  robotsSitemaps: string[];
  llmsTxt: { present: boolean; linksToPath: boolean | null };
  /** HTML used for region analysis: control's when blocked, else crawler's. */
  rawHtml: string;
  rawText: string;
  inlineScriptText: string;
}

// ---------------------------------------------------------------------------
// SSRF guard

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
];

export function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return V4_BLOCKED.some(([base, bits]) => {
    const baseInt = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (baseInt & mask);
  });
}

export function isPrivateIPv6(ip: string): boolean {
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (norm === "::1" || norm === "::") return true;
  // IPv4-mapped (::ffff:1.2.3.4) — check the embedded v4.
  const mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const head = norm.split(":")[0];
  if (head.length === 4) {
    const block = parseInt(head, 16);
    if (block >= 0xfc00 && block <= 0xfdff) return true; // fc00::/7
    if (block >= 0xfe80 && block <= 0xfebf) return true; // fe80::/10
  }
  return false;
}

export function isPrivateAddress(address: string, family: number): boolean {
  return family === 6 || address.includes(":")
    ? isPrivateIPv6(address)
    : isPrivateIPv4(address);
}

const defaultLookup: LookupFn = async (hostname) =>
  dnsLookup(hostname, { all: true });

/** Throws EngineError('ssrf_blocked') unless every resolved address is public. */
export async function assertPublicHost(
  hostname: string,
  lookup: LookupFn = defaultLookup,
): Promise<void> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (ipv4ToInt(bare) !== null || bare.includes(":")) {
    if (isPrivateAddress(bare, bare.includes(":") ? 6 : 4)) {
      throw new EngineError(
        "ssrf_blocked",
        `Refusing to fetch private/reserved address ${bare}. Set ALLOW_LOCAL_TARGETS=true to scan local sites.`,
      );
    }
    return;
  }
  if (/^localhost$/i.test(bare) || bare.endsWith(".localhost")) {
    throw new EngineError(
      "ssrf_blocked",
      "Refusing to fetch localhost. Set ALLOW_LOCAL_TARGETS=true to scan local sites.",
    );
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(bare);
  } catch {
    throw new EngineError("dns_or_network", `Could not resolve ${bare}.`, {
      hostname: bare,
    });
  }
  if (records.length === 0) {
    throw new EngineError("dns_or_network", `Could not resolve ${bare}.`);
  }
  for (const record of records) {
    if (isPrivateAddress(record.address, record.family)) {
      throw new EngineError(
        "ssrf_blocked",
        `${bare} resolves to private/reserved address ${record.address}. Set ALLOW_LOCAL_TARGETS=true to scan local sites.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Guarded fetch with manual redirect following

export async function guardedFetch(
  url: string,
  userAgent: string,
  opts: {
    allowLocal: boolean;
    timeoutMs: number;
    fetchImpl: typeof fetch;
    lookup?: LookupFn;
  },
): Promise<FetchOutcome> {
  const redirects: string[] = [];
  const started = Date.now();
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new EngineError("invalid_url", `Not a valid URL: ${current}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new EngineError(
        "ssrf_blocked",
        `Refusing non-http(s) scheme "${parsed.protocol}" at ${current}`,
      );
    }
    // Re-checked on every hop: a public page may redirect to a private host.
    if (!opts.allowLocal) {
      await assertPublicHost(parsed.hostname, opts.lookup);
    }

    const remaining = opts.timeoutMs - (Date.now() - started);
    if (remaining <= 0) {
      throw new EngineError("timeout", `Fetch exceeded ${opts.timeoutMs}ms`, {
        url: current,
      });
    }

    let res: Response;
    try {
      res = await opts.fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(remaining),
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en",
        },
      });
    } catch (err) {
      throw mapFetchError(err, current, opts.timeoutMs);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (location) {
        await res.body?.cancel().catch(() => {});
        const nextUrl = new URL(location, current).toString();
        redirects.push(nextUrl);
        current = nextUrl;
        if (hop === MAX_REDIRECTS) {
          throw new EngineError(
            "dns_or_network",
            `Gave up after ${MAX_REDIRECTS} redirects (last: ${nextUrl})`,
          );
        }
        continue;
      }
    }

    let body: string;
    try {
      body = await res.text();
    } catch (err) {
      throw mapFetchError(err, current, opts.timeoutMs);
    }
    const bytes = Buffer.byteLength(body);
    return {
      requestedUrl: url,
      finalUrl: current,
      status: res.status,
      contentType: res.headers.get("content-type"),
      bytes,
      html: body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) : body,
      redirects,
      durationMs: Date.now() - started,
    };
  }
  // Unreachable: the loop always returns or throws.
  throw new EngineError("dns_or_network", "Redirect loop");
}

function mapFetchError(err: unknown, url: string, timeoutMs: number): EngineError {
  if (err instanceof EngineError) return err;
  const name = (err as Error)?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new EngineError("timeout", `${url} did not respond within ${timeoutMs}ms`, {
      url,
    });
  }
  const cause = (err as { cause?: { code?: string } })?.cause;
  const code = cause?.code ?? "";
  return new EngineError(
    "dns_or_network",
    `Could not fetch ${url}${code ? ` (${code})` : ""}`,
    { url, code },
  );
}

// ---------------------------------------------------------------------------
// Bot-block detection (dual-UA comparison)

const CHALLENGE_MARKERS =
  /just a moment|checking your browser|verify you are human|cf-chl|cf_chl|challenge-platform|attention required|ddos protection|h?captcha|enable javascript and cookies to continue/i;
/** Challenge interstitials are small; real pages aren't. */
const CHALLENGE_MAX_WORDS = 300;
export const DIVERGENCE_SIMILARITY_THRESHOLD = 0.4;

function textSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length < 12 || tb.length < 12) {
    const sa = new Set(ta);
    const common = tb.filter((t) => sa.has(t)).length;
    return tb.length === 0 ? 0 : common / tb.length;
  }
  const sa = new Set(shingles(ta));
  const sb = shingles(tb);
  if (sb.length === 0) return 0;
  const common = sb.filter((s) => sa.has(s)).length;
  return common / sb.length;
}

export function detectBotBlock(
  crawler: FetchOutcome,
  control: FetchOutcome | null,
  crawlerUserAgent: string,
): BotBlockVerdict | null {
  // Never claim "blocked" when the control fetch also failed — that's a site
  // problem, not selective bot blocking.
  if (!control || control.status < 200 || control.status >= 300) return null;

  const base = {
    crawler: { status: crawler.status, bytes: crawler.bytes },
    control: { status: control.status, bytes: control.bytes },
  };
  const finish = (reason: BotBlockVerdict["reason"], evidence: string): BotBlockVerdict => ({
    reason,
    ...base,
    evidence,
    fixPrompt: buildBlockedFixPrompt({
      url: crawler.requestedUrl,
      crawlerUserAgent,
      ...base,
      evidence,
    }),
  });

  if ([401, 403, 429].includes(crawler.status)) {
    return finish(
      "status",
      `The crawler user agent received HTTP ${crawler.status} (${crawler.bytes} bytes) while a desktop browser received HTTP ${control.status} (${control.bytes} bytes).`,
    );
  }

  const crawlerText = extractRawText(crawler.html);
  const controlText = extractRawText(control.html);
  const crawlerWords = countWords(crawlerText);
  const controlWords = countWords(controlText);

  if (
    CHALLENGE_MARKERS.test(crawler.html) &&
    !CHALLENGE_MARKERS.test(control.html) &&
    crawlerWords <= CHALLENGE_MAX_WORDS
  ) {
    return finish(
      "challenge",
      `The crawler user agent received a CDN/WAF challenge page (${crawlerWords} words, ${crawler.bytes} bytes) while a desktop browser received the real page (${controlWords} words, ${control.bytes} bytes).`,
    );
  }

  if (crawler.status >= 200 && crawler.status < 300 && controlWords > 0) {
    const similarity = textSimilarity(controlText, crawlerText);
    if (
      similarity < DIVERGENCE_SIMILARITY_THRESHOLD &&
      crawlerWords < controlWords * 0.5
    ) {
      return finish(
        "divergence",
        `The crawler user agent received substantially different, thinner content (${crawlerWords} words, ${crawler.bytes} bytes; ${Math.round(similarity * 100)}% text overlap) than a desktop browser (${controlWords} words, ${control.bytes} bytes).`,
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Typed-error checks on the crawler outcome

const LOGIN_PATH = /\/(log[-_]?in|sign[-_]?in|auth(?:enticate|orize)?|sso)(\/|$|\?)/i;

export function checkUnsupportedContentType(outcome: FetchOutcome): void {
  const type = (outcome.contentType ?? "").toLowerCase();
  const isHtml =
    type.includes("text/html") || type.includes("application/xhtml+xml");
  if (isHtml && !outcome.html.startsWith("%PDF-")) return;

  const label = outcome.html.startsWith("%PDF-")
    ? "application/pdf"
    : type.split(";")[0] || "unknown";
  if (!type && looksLikeHtml(outcome.html)) return; // missing header but clearly HTML
  throw new EngineError(
    "unsupported_content_type",
    `This URL serves ${label}, not an HTML page.`,
    { contentType: label, url: outcome.finalUrl },
  );
}

function looksLikeHtml(body: string): boolean {
  return /^\s*(<!doctype html|<html|<head|<body)/i.test(body);
}

export function checkLoginRedirect(outcome: FetchOutcome): void {
  let pathname = "";
  try {
    pathname = new URL(outcome.finalUrl).pathname;
  } catch {
    return;
  }
  const landedOnLogin =
    outcome.redirects.length > 0 && LOGIN_PATH.test(pathname);
  const passwordDominated =
    /<input[^>]+type=["']?password/i.test(outcome.html) &&
    countWords(extractRawText(outcome.html)) < 80;
  if (landedOnLogin || passwordDominated) {
    throw new EngineError(
      "login_redirect",
      `This page requires signing in — the crawler was sent to ${pathname || "a login form"}.`,
      { finalUrl: outcome.finalUrl },
    );
  }
}

// ---------------------------------------------------------------------------
// Top-level crawler view

export async function fetchCrawlerView(
  input: FetcherInput,
  deps: FetcherDeps = {},
): Promise<CrawlerView> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? FETCH_TIMEOUT_MS;
  const common = {
    allowLocal: input.allowLocal,
    timeoutMs,
    fetchImpl,
    lookup: deps.lookup,
  };

  const crawler = await guardedFetch(input.url, input.crawlerUserAgent, common);

  let control: FetchOutcome | null = null;
  try {
    control = await guardedFetch(
      input.url,
      input.browserUserAgent ?? DEFAULT_BROWSER_UA,
      common,
    );
  } catch {
    control = null; // control problems must never fail the scan
  }

  const blocked = detectBotBlock(crawler, control, input.crawlerUserAgent);

  if (!blocked) {
    checkUnsupportedContentType(crawler);
    checkLoginRedirect(crawler);
  }

  const analysisOutcome = blocked && control ? control : crawler;
  const rawHtml = analysisOutcome.html;

  const origin = new URL(analysisOutcome.finalUrl).origin;
  const path = new URL(analysisOutcome.finalUrl).pathname;

  const robots = await fetchTextFile(`${origin}/robots.txt`, input, common);
  const llms = await fetchTextFile(`${origin}/llms.txt`, input, common);

  return {
    crawler,
    control,
    blocked,
    robotsContent: robots,
    robotsSitemaps: [],
    llmsTxt: {
      present: llms !== null,
      linksToPath:
        llms === null
          ? null
          : llms.includes(analysisOutcome.finalUrl) ||
            (path !== "/" && llms.includes(path)),
    },
    rawHtml,
    rawText: extractRawText(rawHtml),
    inlineScriptText: extractInlineScripts(rawHtml),
  };
}

async function fetchTextFile(
  url: string,
  input: FetcherInput,
  common: {
    allowLocal: boolean;
    timeoutMs: number;
    fetchImpl: typeof fetch;
    lookup?: LookupFn;
  },
): Promise<string | null> {
  try {
    const outcome = await guardedFetch(url, input.crawlerUserAgent, {
      ...common,
      timeoutMs: Math.min(common.timeoutMs, 10_000),
    });
    if (outcome.status !== 200) return null;
    const type = (outcome.contentType ?? "").toLowerCase();
    // SPAs love returning index.html for any path; that's not a robots/llms file.
    if (type.includes("html") || looksLikeHtml(outcome.html)) return null;
    return outcome.html;
  } catch {
    return null;
  }
}
