import { describe, expect, it } from "vitest";
import { compareScans, nameSimilarity } from "@/lib/engine/comparer";
import type { RegionResult, ScanResult } from "@/lib/engine/types";
import { makeRegionResult } from "./helpers";

function scan(score: number, regions: RegionResult[]): ScanResult {
  return {
    url: "https://example.com",
    finalUrl: "https://example.com",
    scannedAt: "2026-06-11T00:00:00.000Z",
    score,
    blocked: null,
    stack: { stack: "plain HTML / unknown", signals: [] },
    regions,
    pageChecks: {
      robotsTxt: { present: false, grid: [] },
      llmsTxt: { present: false, linksToPath: null },
      hasJsonLd: false,
      hasTitle: true,
      hasMetaDescription: false,
      hasSitemapReference: false,
      requiresJsRouting: false,
    },
    rawText: "",
    telemetry: {
      crawlerStatus: 200,
      crawlerBytes: 0,
      controlStatus: 200,
      controlBytes: 0,
      fetchDurationMs: 0,
      renderDurationMs: 0,
      requestCount: 0,
    },
    pageHeight: 2000,
    viewportWidth: 1280,
    crawlerUserAgent: "GPTBot/1.0",
    screenshot: null,
  };
}

describe("compareScans", () => {
  it("computes the score delta and matches regions by selector", () => {
    const prev = scan(62, [
      makeRegionResult({ selector: "#app", status: "bad", issueType: "js_rendered_content" }),
      makeRegionResult({ selector: "#footer", status: "ok", issueType: "fully_visible" }),
    ]);
    const next = scan(84, [
      makeRegionResult({ selector: "#app", status: "ok", issueType: "fully_visible" }),
      makeRegionResult({ selector: "#footer", status: "ok", issueType: "fully_visible" }),
    ]);

    const cmp = compareScans({ id: "prev-id", result: prev }, { result: next });
    expect(cmp.scoreDelta).toBe(22);
    expect(cmp.prevScanId).toBe("prev-id");

    const app = cmp.regions.find((r) => r.selector === "#app");
    expect(app?.change).toBe("improved");
    expect(app?.before?.status).toBe("bad");
    expect(app?.after?.status).toBe("ok");

    const footer = cmp.regions.find((r) => r.selector === "#footer");
    expect(footer?.change).toBe("unchanged");
  });

  it("detects regressions", () => {
    const prev = scan(90, [
      makeRegionResult({ selector: "#hero", status: "ok", issueType: "fully_visible" }),
    ]);
    const next = scan(40, [
      makeRegionResult({ selector: "#hero", status: "warn", issueType: "partial_content" }),
    ]);
    const cmp = compareScans({ id: "p", result: prev }, { result: next });
    expect(cmp.regions[0].change).toBe("regressed");
  });

  it("falls back to name similarity for renamed selectors", () => {
    const prev = scan(50, [
      makeRegionResult({
        selector: "#old-pricing",
        name: "Pricing plans table",
        status: "bad",
        issueType: "js_rendered_content",
      }),
    ]);
    const next = scan(80, [
      makeRegionResult({
        selector: "#new-pricing",
        name: "Pricing plans",
        status: "ok",
        issueType: "fully_visible",
      }),
    ]);
    const cmp = compareScans({ id: "p", result: prev }, { result: next });
    expect(cmp.regions).toHaveLength(1);
    expect(cmp.regions[0].change).toBe("improved");
  });

  it("marks unmatched regions as new and removed", () => {
    const prev = scan(50, [
      makeRegionResult({
        selector: "#sidebar",
        name: "Sidebar promotions",
        status: "ok",
        issueType: "fully_visible",
      }),
    ]);
    const next = scan(50, [
      makeRegionResult({
        selector: "#comments",
        name: "Reader comments",
        status: "bad",
        issueType: "js_rendered_content",
      }),
    ]);
    const cmp = compareScans({ id: "p", result: prev }, { result: next });
    expect(cmp.regions.find((r) => r.selector === "#comments")?.change).toBe("new");
    expect(cmp.regions.find((r) => r.selector === "#sidebar")?.change).toBe("removed");
  });
});

describe("nameSimilarity", () => {
  it("is 1 for identical names and 0 for disjoint ones", () => {
    expect(nameSimilarity("Pricing table", "pricing table")).toBe(1);
    expect(nameSimilarity("Pricing table", "Reader comments")).toBe(0);
  });
});
