import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  RegionCapture,
  RegionFlags,
  RegionResult,
  Verdict,
  IssueType,
} from "@/lib/engine/types";

export function fixtureHtml(name: string): string {
  return readFileSync(
    path.join(__dirname, "..", "fixtures", name, "raw.html"),
    "utf8",
  );
}

export function fixtureFile(rel: string): string {
  return readFileSync(path.join(__dirname, "..", "fixtures", rel), "utf8");
}

const DEFAULT_FLAGS: RegionFlags = {
  hasCanvas: false,
  canvasDominant: false,
  hasIframe: false,
  iframeDominant: false,
  iframeSrc: null,
  hasTable: false,
  imgCount: 0,
  imgWithoutAltCount: 0,
  imageDominant: false,
};

/** Hand-authored stand-in for what the renderer would emit. */
export function makeRegion(
  overrides: Partial<Omit<RegionCapture, "flags">> & {
    text: string;
    flags?: Partial<RegionFlags>;
  },
): RegionCapture {
  const text = overrides.text.toLowerCase().replace(/\s+/g, " ").trim();
  return {
    selector: "#region",
    name: "Region",
    wordCount: text.split(/\s+/).filter(Boolean).length,
    boundingBox: { x: 0, y: 0, width: 1280, height: 400 },
    links: [],
    ...overrides,
    text,
    flags: { ...DEFAULT_FLAGS, ...(overrides.flags ?? {}) },
  };
}

export function makeRegionResult(
  overrides: Partial<RegionResult> & {
    selector: string;
    status: Verdict;
    issueType: IssueType;
  },
): RegionResult {
  return {
    name: overrides.selector,
    coverage: 0,
    foundInScripts: 0,
    evidence: "",
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    weight: 0.5,
    wordCount: 10,
    flags: { ...DEFAULT_FLAGS },
    links: [],
    ...overrides,
  };
}

/** Minimal canned Response factory for injected fetchImpl. */
export function canned(
  body: string,
  init: {
    status?: number;
    contentType?: string;
    location?: string;
  } = {},
): Response {
  const headers = new Headers();
  headers.set("content-type", init.contentType ?? "text/html; charset=utf-8");
  if (init.location) headers.set("location", init.location);
  return new Response(body, { status: init.status ?? 200, headers });
}

export type FakeRoute = (url: string, userAgent: string) => Response | null;

/** Builds a fetchImpl that dispatches on URL + UA; 404s anything unhandled. */
export function fakeFetch(route: FakeRoute): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const ua = headers.get("user-agent") ?? "";
    const hit = route(url, ua);
    return hit ?? canned("not found", { status: 404, contentType: "text/plain" });
  }) as typeof fetch;
}
