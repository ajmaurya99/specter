import * as cheerio from "cheerio";
import { createDiffer } from "./differ";
import { computeWeights } from "./scorer";
import { countWords } from "./text";
import type {
  DiffResult,
  HiddenBlock,
  IssueType,
  LinkProber,
  RegionCapture,
  RegionResult,
  Verdict,
} from "./types";

/**
 * Rule-based verdicts and the issue taxonomy. Precedence (first match wins):
 *   iframe_embed → canvas_or_image_data → data_in_script_variable →
 *   js_rendered_content → client_side_routes → fully_visible → partial_content
 * plus hidden_but_present entries appended from raw-HTML blocks that CSS
 * hides in the render. Every evidence line is quantified.
 */

export const STATUS_FOR_ISSUE: Record<IssueType, Verdict> = {
  fully_visible: "ok",
  hidden_but_present: "ok",
  partial_content: "warn",
  data_in_script_variable: "warn",
  client_side_routes: "warn",
  js_rendered_content: "bad",
  iframe_embed: "bad",
  canvas_or_image_data: "bad",
};

export interface ClassifierInput {
  regions: Array<RegionCapture & DiffResult>;
  hiddenBlocks: HiddenBlock[];
  /** Stripped text of the raw HTML (differ's haystack). */
  rawText: string;
  /** The raw HTML itself — used to quote the container's raw state. */
  rawHtml: string;
  /** Resolves relative hrefs for the client-route probe. */
  baseUrl: string;
  /** HEAD-probes candidate links; injected so tests stay offline. */
  probeLinks?: LinkProber;
}

interface RawContainerState {
  present: boolean;
  empty: boolean;
  rawWordCount: number;
}

function inspectRawContainer(
  $: cheerio.CheerioAPI,
  selector: string,
): RawContainerState {
  try {
    const el = $(selector).first();
    if (el.length === 0) return { present: false, empty: true, rawWordCount: 0 };
    const text = el.text().trim();
    return {
      present: true,
      empty: text.length === 0 && el.children().length === 0,
      rawWordCount: countWords(text),
    };
  } catch {
    // Selector syntax cheerio cannot parse — treat as not found.
    return { present: false, empty: true, rawWordCount: 0 };
  }
}

function describeContainer(selector: string, state: RawContainerState): string {
  if (!state.present) return `container ${selector} is absent from the raw response`;
  if (state.empty) return `container ${selector} is empty in the raw response`;
  return `container ${selector} holds ${state.rawWordCount} words in the raw response`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Noise floor: one lone hash link isn't "navigation" (README: deviation). */
const CLIENT_ROUTE_MIN_LINKS = 2;

export interface ClassifiedPage {
  regions: RegionResult[];
}

/**
 * A region with no words, no content-bearing media, and no links is an empty
 * shell (spacer, decorative wrapper) — there is no content to be invisible.
 * Scoring it as "bad" would tank pages for rendering artifacts.
 */
function isEmptyShell(region: RegionCapture & DiffResult): boolean {
  return (
    region.wordCount === 0 &&
    !region.flags.canvasDominant &&
    !region.flags.iframeDominant &&
    !(region.flags.imageDominant && region.flags.imgWithoutAltCount > 0) &&
    region.links.length === 0
  );
}

export async function classify(input: ClassifierInput): Promise<ClassifiedPage> {
  const $raw = cheerio.load(input.rawHtml);
  const results: RegionResult[] = [];

  for (const region of input.regions) {
    if (isEmptyShell(region)) continue;
    const rawState = inspectRawContainer($raw, region.selector);
    const { issueType, evidence } = await classifyRegion(region, rawState, input);
    results.push({
      selector: region.selector,
      name: region.name,
      status: STATUS_FOR_ISSUE[issueType],
      issueType,
      coverage: region.coverage,
      foundInScripts: region.foundInScripts,
      evidence,
      boundingBox: region.boundingBox,
      weight: 0, // filled below once all regions are known
      wordCount: region.wordCount,
      flags: region.flags,
      links: region.links,
    });
  }

  appendHiddenBlocks(results, input);

  // Weights (and therefore the score) cover RENDERED regions only —
  // hidden_but_present entries are informational and must not inflate the
  // score with content users never see.
  const rendered = results.filter((r) => r.issueType !== "hidden_but_present");
  const weights = computeWeights(
    rendered.map((r) => ({ wordCount: r.wordCount, boundingBox: r.boundingBox })),
  );
  rendered.forEach((region, i) => {
    region.weight = weights[i];
  });

  // Issues first: heaviest broken regions lead the report.
  results.sort((a, b) => {
    const severity = (r: RegionResult) =>
      r.status === "bad" ? 2 : r.status === "warn" ? 1 : 0;
    const impact = (r: RegionResult) => severity(r) * r.weight;
    return impact(b) - impact(a) || severity(b) - severity(a) || b.weight - a.weight;
  });

  return { regions: results };
}

async function classifyRegion(
  region: RegionCapture & DiffResult,
  rawState: RawContainerState,
  input: ClassifierInput,
): Promise<{ issueType: IssueType; evidence: string }> {
  const { coverage, foundInScripts, wordCount, flags } = region;
  const containerNote = describeContainer(region.selector, rawState);

  if (flags.iframeDominant && coverage < 0.15) {
    return {
      issueType: "iframe_embed",
      evidence:
        `region is dominated by an iframe (${flags.iframeSrc ?? "no src"}) · ` +
        `${wordCount} words rendered · ${pct(coverage)} found in initial HTML — ` +
        `crawlers do not descend into embedded frames`,
    };
  }

  if (
    coverage < 0.3 &&
    (flags.canvasDominant || (flags.imageDominant && flags.imgWithoutAltCount > 0))
  ) {
    const carrier = flags.canvasDominant
      ? "a <canvas> element"
      : `${flags.imgWithoutAltCount} image(s) without alt text`;
    return {
      issueType: "canvas_or_image_data",
      evidence:
        `content is carried by ${carrier} · ${wordCount} words rendered · ` +
        `${pct(coverage)} found in initial HTML · ${containerNote}`,
    };
  }

  if (coverage < 0.5 && foundInScripts >= 0.5) {
    return {
      issueType: "data_in_script_variable",
      evidence:
        `${pct(foundInScripts)} of this region's text sits inside an inline ` +
        `<script> variable but only ${pct(coverage)} appears as readable HTML · ` +
        `${wordCount} words rendered · some crawlers read script payloads, most don't index them as content`,
    };
  }

  if (coverage < 0.15) {
    const foundWords = Math.round(coverage * wordCount);
    return {
      issueType: "js_rendered_content",
      evidence:
        `${wordCount} words rendered · ${foundWords} found in initial HTML · ` +
        containerNote,
    };
  }

  const clientRoutes = region.links.filter((l) => l.isClientRoute);
  if (
    region.links.length >= CLIENT_ROUTE_MIN_LINKS &&
    clientRoutes.length / region.links.length > 0.5
  ) {
    const confirmed = await confirmClientRoutes(
      clientRoutes.map((l) => l.href),
      input,
    );
    if (confirmed) {
      return {
        issueType: "client_side_routes",
        evidence:
          `${clientRoutes.length} of ${region.links.length} links are JS routes ` +
          `(#/… or javascript:) that serve no distinct content to a crawler · ` +
          `${pct(coverage)} of the region's own text is in the initial HTML`,
      };
    }
  }

  if (coverage >= 0.9) {
    return {
      issueType: "fully_visible",
      evidence:
        `${wordCount} words rendered · ${pct(coverage)} present in the initial ` +
        `HTML response — crawlers see what users see`,
    };
  }

  const missing = Math.round((1 - coverage) * wordCount);
  return {
    issueType: "partial_content",
    evidence:
      `${wordCount} words rendered · only ${pct(coverage)} found in initial HTML · ` +
      `about ${missing} words appear only after JavaScript runs`,
  };
}

/**
 * Spec: verify client routes by HEAD-requesting up to 3 of them and checking
 * they don't resolve to distinct content. Hash routes physically cannot reach
 * the server (fragments are client-side), so unresolvable/identical probes
 * confirm the issue; a probe that demonstrably serves distinct content
 * clears it.
 */
async function confirmClientRoutes(
  hrefs: string[],
  input: ClassifierInput,
): Promise<boolean> {
  if (!input.probeLinks) return true;
  const candidates = hrefs
    .map((href) => {
      try {
        return new URL(href, input.baseUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u !== null)
    .slice(0, 3);
  if (candidates.length === 0) return true;
  const outcomes = await input.probeLinks(candidates);
  return !outcomes.some((o) => o.distinctContent);
}

const HIDDEN_BLOCK_COVERAGE = 0.9;

function appendHiddenBlocks(results: RegionResult[], input: ClassifierInput) {
  if (input.hiddenBlocks.length === 0) return;
  // Hidden-but-present means the text IS in the raw HTML; verify against the
  // raw haystack so render-only hidden nodes don't get a free pass.
  const differ = createDiffer(input.rawText, "");

  for (const block of input.hiddenBlocks) {
    const words = countWords(block.text);
    if (words === 0) continue;
    const { coverage } = differ.diff(block.text);
    if (coverage < HIDDEN_BLOCK_COVERAGE) continue;

    results.push({
      selector: block.selector,
      name: `Hidden content (${block.selector})`,
      status: STATUS_FOR_ISSUE.hidden_but_present,
      issueType: "hidden_but_present",
      coverage,
      foundInScripts: 0,
      evidence:
        `${words} words present in the raw HTML but hidden via CSS in the ` +
        `rendered page · crawlers can read this content even though users ` +
        `don't see it — make sure that's intentional`,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      weight: 0,
      wordCount: words,
      flags: {
        hasCanvas: false,
        canvasDominant: false,
        hasIframe: false,
        iframeDominant: false,
        iframeSrc: null,
        hasTable: false,
        imgCount: 0,
        imgWithoutAltCount: 0,
        imageDominant: false,
      },
      links: [],
    });
  }
}
