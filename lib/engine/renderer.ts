import type { Browser } from "playwright";
import { EngineError } from "./errors";
import { countWords, normalizeWhitespace } from "./text";
import type { RegionCapture, RenderResult } from "./types";

/**
 * Rendered-DOM capture: one shared Browser (injected — the singleton lives in
 * lib/server), a fresh context per scan, image/font/media requests blocked,
 * and the whole page segmented into regions in a single page.evaluate.
 */

export const VIEWPORT = { width: 1280, height: 2000 } as const;
export const RENDER_HARD_CAP_MS = 25_000;
const GOTO_TIMEOUT_MS = 15_000;

export interface RendererInput {
  url: string;
  timeoutMs?: number;
}

export interface RendererDeps {
  browser: Browser;
  /**
   * When set, subresource requests to hosts this rejects are aborted —
   * the scanned page's own JS must not reach private hosts (SSRF).
   */
  isHostAllowed?: (hostname: string) => Promise<boolean>;
}

interface RawRegion {
  selector: string;
  name: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  flags: RegionCapture["flags"];
  links: RegionCapture["links"];
}

interface SegmentationResult {
  regions: RawRegion[];
  hiddenBlocks: Array<{ selector: string; text: string }>;
  pageHeight: number;
  title: string;
}

export async function renderPage(
  input: RendererInput,
  deps: RendererDeps,
): Promise<RenderResult> {
  const timeoutMs = input.timeoutMs ?? RENDER_HARD_CAP_MS;
  const context = await deps.browser.newContext({ viewport: { ...VIEWPORT } });
  let requestCount = 0;

  try {
    // Identical blocking on every render keeps region geometry comparable
    // between scans of the same URL. Stylesheets stay — layout matters.
    await context.route("**/*", async (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") {
        return route.abort();
      }
      if (deps.isHostAllowed) {
        try {
          const host = new URL(route.request().url()).hostname;
          if (!(await deps.isHostAllowed(host))) return route.abort();
        } catch {
          return route.abort();
        }
      }
      return route.continue();
    });

    const page = await context.newPage();
    page.on("request", () => {
      requestCount += 1;
    });

    const renderDeadline = Date.now() + timeoutMs;
    try {
      await page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(GOTO_TIMEOUT_MS, timeoutMs),
      });
    } catch (err) {
      throw mapRenderError(err, input.url, "goto");
    }

    // networkidle is the pragmatic choice for arbitrary pages. The remaining
    // budget (not a fresh one) is the hard cap, and timing out here is fine —
    // analyze what rendered (README: known limitation).
    const idleBudget = Math.max(1_000, renderDeadline - Date.now());
    await page
      .waitForLoadState("networkidle", { timeout: idleBudget })
      .catch(() => {});

    let seg: SegmentationResult;
    try {
      seg = (await page.evaluate(SEGMENT_PAGE_SCRIPT)) as SegmentationResult;
    } catch (err) {
      throw mapRenderError(err, input.url, "segment");
    }

    return {
      regions: seg.regions.map(toRegionCapture),
      hiddenBlocks: seg.hiddenBlocks,
      pageHeight: seg.pageHeight,
      requestCount,
      title: seg.title,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function toRegionCapture(raw: RawRegion): RegionCapture {
  const text = normalizeWhitespace(raw.text);
  return {
    selector: raw.selector,
    name: raw.name,
    text,
    wordCount: countWords(text),
    boundingBox: {
      x: Math.round(raw.rect.x),
      y: Math.round(raw.rect.y),
      width: Math.round(raw.rect.width),
      height: Math.round(raw.rect.height),
    },
    flags: raw.flags,
    links: raw.links,
  };
}

function mapRenderError(err: unknown, url: string, stage: string): EngineError {
  if (err instanceof EngineError) return err;
  const message = (err as Error)?.message ?? String(err);
  if (/Timeout.*exceeded/i.test(message) || (err as Error)?.name === "TimeoutError") {
    return new EngineError(
      "timeout",
      `The page did not finish loading within the render budget.`,
      { url, stage },
    );
  }
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET/i.test(message)) {
    return new EngineError("dns_or_network", `The browser could not reach ${url}.`, {
      url,
      stage,
    });
  }
  return new EngineError(
    "render_failed",
    `Headless rendering failed while ${stage === "goto" ? "loading" : "analyzing"} the page.`,
    { url, stage, message: message.slice(0, 300) },
  );
}

/**
 * Runs inside the rendered page. Walks top-level semantic/structural blocks
 * (landmarks + direct children of main, descending while fewer than 3
 * regions emerge), captures stable plain-CSS selectors (they must round-trip
 * into cheerio against the raw HTML), visible text, geometry, and
 * content-type flags, plus CSS-hidden blocks that carry substantial text.
 */
const SEGMENT_PAGE_SCRIPT = `(() => {
  const SEMANTIC = ["header", "nav", "footer", "aside", "article", "section", "table", "form", "figure", "ul", "ol"];
  const CONTAINERS = ["div", "main", "section", "article"];
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "BR", "HR"]);
  const MIN_DIV_HEIGHT = 80;
  const MIN_KEEP_HEIGHT = 40;
  const MAX_REGIONS = 24;
  const MAX_DESCENTS = 4;

  const docEl = document.documentElement;

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function idUsable(el) {
    return el.id && /^[A-Za-z][\\w-]*$/.test(el.id) && document.querySelectorAll("#" + el.id).length === 1;
  }

  function selectorFor(el) {
    if (idUsable(el)) return "#" + el.id;
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur !== document.body && depth < 8) {
      if (idUsable(cur)) { parts.unshift("#" + cur.id); return parts.join(" > "); }
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      const sameTag = parent ? Array.from(parent.children).filter((c) => c.tagName === cur.tagName) : [cur];
      parts.unshift(sameTag.length > 1 ? tag + ":nth-of-type(" + (sameTag.indexOf(cur) + 1) + ")" : tag);
      cur = parent;
      depth++;
    }
    if (cur === document.body) {
      parts.unshift("body");
      return parts.join(" > ");
    }
    // Depth budget ran out before reaching body: a child-combinator chain
    // anchored at body would match NOTHING. Use a descendant-rooted chain.
    return parts.join(" > ");
  }

  const FALLBACK_NAMES = { header: "Header", nav: "Navigation", footer: "Footer", aside: "Sidebar", article: "Article", table: "Table", form: "Form", figure: "Figure", ul: "List", ol: "List" };

  function nameFor(el, index) {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim().slice(0, 60);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ref = document.getElementById(labelledBy.split(/\\s+/)[0]);
      if (ref && ref.innerText.trim()) return ref.innerText.trim().slice(0, 60);
    }
    const heading = el.querySelector("h1, h2, h3, h4, h5, h6");
    if (heading && heading.innerText.trim()) return heading.innerText.trim().slice(0, 60);
    const caption = el.querySelector("caption, figcaption, legend");
    if (caption && caption.innerText.trim()) return caption.innerText.trim().slice(0, 60);
    const tag = el.tagName.toLowerCase();
    if (FALLBACK_NAMES[tag]) return FALLBACK_NAMES[tag];
    return "Section " + index;
  }

  function isCandidate(el) {
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (!visible(el)) return false;
    const tag = el.tagName.toLowerCase();
    const h = el.getBoundingClientRect().height;
    if (SEMANTIC.includes(tag)) return h >= MIN_KEEP_HEIGHT;
    if (CONTAINERS.includes(tag)) return h >= MIN_DIV_HEIGHT;
    return h >= MIN_DIV_HEIGHT && (el.innerText || "").trim().length > 0;
  }

  function walkChildren(root) {
    const out = [];
    for (const child of Array.from(root.children)) {
      if (isCandidate(child)) out.push(child);
    }
    return out;
  }

  // Landmarks outside <main> first.
  const main = document.querySelector("main") || document.body;
  let els = [];
  for (const lm of Array.from(document.querySelectorAll("header, nav, aside, footer"))) {
    if (main !== document.body && main.contains(lm)) continue;
    if (els.some((e) => e.contains(lm) || lm.contains(e))) continue;
    if (visible(lm)) els.push(lm);
  }

  let contentEls = walkChildren(main).filter((el) => !els.some((e) => e.contains(el) || el.contains(e)));

  // Div-soup pages wrap everything in one tall shell — descend into the
  // largest captured block until at least 3 regions emerge. Children that
  // overlap an already-captured landmark are skipped (no duplicates).
  let guard = 0;
  while (contentEls.length < 3 && guard < MAX_DESCENTS) {
    let largest = null;
    let largestArea = 0;
    for (const el of contentEls) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > largestArea && el.children.length > 0) { largest = el; largestArea = area; }
    }
    const expandFrom = largest || (contentEls.length === 0 ? main : null);
    if (!expandFrom) break;
    const sub = walkChildren(expandFrom).filter(
      (el) => !els.some((e) => e === el || e.contains(el) || el.contains(e)),
    );
    if (sub.length === 0) break;
    contentEls = contentEls.filter((el) => el !== expandFrom).concat(sub);
    guard++;
  }

  els = Array.from(new Set(els.concat(contentEls)));

  // Drop nested duplicates (keep the outermost), then cap by area.
  els = els.filter((el, i) => !els.some((other, j) => j !== i && other !== el && other.contains(el)));
  if (els.length > MAX_REGIONS) {
    els = els
      .map((el) => ({ el, area: el.getBoundingClientRect().width * el.getBoundingClientRect().height }))
      .sort((a, b) => b.area - a.area)
      .slice(0, MAX_REGIONS)
      .map((x) => x.el);
  }
  els.sort((a, b) => rectOf(a).y - rectOf(b).y || rectOf(a).x - rectOf(b).x);

  const regions = els.map((el, i) => {
    const rect = rectOf(el);
    const area = Math.max(1, rect.width * rect.height);

    let canvasArea = 0;
    for (const c of Array.from(el.querySelectorAll("canvas"))) {
      const r = c.getBoundingClientRect();
      canvasArea = Math.max(canvasArea, r.width * r.height);
    }
    let iframeArea = 0;
    let iframeSrc = null;
    for (const f of Array.from(el.querySelectorAll("iframe"))) {
      const r = f.getBoundingClientRect();
      if (r.width * r.height > iframeArea) { iframeArea = r.width * r.height; iframeSrc = f.getAttribute("src"); }
    }
    let imgArea = 0;
    let imgCount = 0;
    let imgWithoutAlt = 0;
    for (const img of Array.from(el.querySelectorAll("img"))) {
      // Image requests are blocked during render, which can collapse layout
      // rects to zero — fall back to the intended width/height attributes so
      // imageDominant still reflects the real page.
      const r = img.getBoundingClientRect();
      const w = r.width || img.width || Number(img.getAttribute("width")) || 0;
      const h = r.height || img.height || Number(img.getAttribute("height")) || 0;
      imgArea += w * h;
      imgCount++;
      const alt = img.getAttribute("alt");
      if (!alt || !alt.trim()) imgWithoutAlt++;
    }

    const links = Array.from(el.querySelectorAll("a[href]")).slice(0, 60).map((a) => {
      const href = a.getAttribute("href") || "";
      return { href, isClientRoute: /^#\\//.test(href) || /^javascript:/i.test(href) };
    });

    return {
      selector: selectorFor(el),
      name: nameFor(el, i + 1),
      text: el.innerText || "",
      rect,
      flags: {
        hasCanvas: canvasArea > 0,
        canvasDominant: canvasArea / area > 0.4,
        hasIframe: iframeArea > 0,
        iframeDominant: iframeArea / area > 0.5,
        iframeSrc,
        hasTable: !!el.querySelector("table"),
        imgCount,
        imgWithoutAltCount: imgWithoutAlt,
        imageDominant: imgArea / area > 0.5,
      },
      links,
    };
  });

  // CSS-hidden blocks with substantial text (hidden_but_present candidates).
  const hiddenBlocks = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let visited = 0;
  while (walker.nextNode() && visited < 5000 && hiddenBlocks.length < 8) {
    visited++;
    const el = walker.currentNode;
    if (SKIP_TAGS.has(el.tagName) || el.tagName === "HEAD") continue;
    if (hiddenBlocks.some((h) => h.el.contains(el))) continue;
    const style = window.getComputedStyle(el);
    if (style.display !== "none" && style.visibility !== "hidden") continue;
    const text = (el.textContent || "").trim();
    if (text.split(/\\s+/).filter(Boolean).length >= 30) {
      hiddenBlocks.push({ el, text });
    }
  }

  return {
    regions,
    hiddenBlocks: hiddenBlocks.map((h) => ({ selector: selectorFor(h.el), text: h.text })),
    pageHeight: Math.max(docEl.scrollHeight, document.body ? document.body.scrollHeight : 0),
    title: document.title || "",
  };
})()`;
