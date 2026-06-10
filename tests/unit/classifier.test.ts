import { describe, expect, it } from "vitest";
import { classify, type ClassifierInput } from "@/lib/engine/classifier";
import { createDiffer } from "@/lib/engine/differ";
import { extractInlineScripts, extractRawText } from "@/lib/engine/text";
import type { ProbeOutcome, RegionCapture } from "@/lib/engine/types";
import { fixtureHtml, makeRegion } from "./helpers";

/**
 * One fixture per issueType: raw.html on disk is what the crawler fetched;
 * the regions below are hand-authored renderer output. Diff results are
 * computed with the real differ so thresholds stay honest.
 */

async function classifyFixture(
  fixture: string,
  regions: RegionCapture[],
  extras: Partial<ClassifierInput> = {},
) {
  const rawHtml = fixtureHtml(fixture);
  const rawText = extractRawText(rawHtml);
  const differ = createDiffer(rawText, extractInlineScripts(rawHtml));
  return classify({
    regions: regions.map((r) => ({ ...r, ...differ.diff(r.text) })),
    hiddenBlocks: [],
    rawText,
    rawHtml,
    baseUrl: "https://example.com/page",
    ...extras,
  });
}

describe("classifier — one fixture per issueType", () => {
  it("fully_visible: server-rendered article", async () => {
    const { regions } = await classifyFixture("fully_visible", [
      makeRegion({
        selector: "#report",
        text: `Coastal erosion accelerated in 2025 Field measurements along the
          northern shoreline recorded an average retreat of 2.4 meters during
          2025, the fastest annual rate since monitoring began in 1998.`,
      }),
    ]);
    expect(regions[0].issueType).toBe("fully_visible");
    expect(regions[0].status).toBe("ok");
    expect(regions[0].evidence).toMatch(/\d+ words rendered/);
  });

  it("js_rendered_content: empty #app filled client-side", async () => {
    const { regions } = await classifyFixture("js_rendered_content", [
      makeRegion({
        selector: "#app",
        text: `Monthly active users grew to ninety thousand while churn dropped
          below two percent across every paid tier we track in this dashboard
          rendered after hydration completes`,
      }),
    ]);
    expect(regions[0].issueType).toBe("js_rendered_content");
    expect(regions[0].status).toBe("bad");
    expect(regions[0].evidence).toContain("0 found in initial HTML");
    expect(regions[0].evidence).toContain("#app");
  });

  it("data_in_script_variable: content exists only inside an inline script", async () => {
    const { regions } = await classifyFixture("data_in_script_variable", [
      makeRegion({
        selector: "#results-root",
        text: `Revenue grew strongly across all four reporting segments this year
          Subscription income reached 48.2 million dollars during the fourth quarter`,
      }),
    ]);
    expect(regions[0].issueType).toBe("data_in_script_variable");
    expect(regions[0].status).toBe("warn");
    expect(regions[0].evidence).toMatch(/<script>/);
  });

  it("iframe_embed: region dominated by an iframe", async () => {
    const { regions } = await classifyFixture("iframe_embed", [
      makeRegion({
        selector: "#map-section",
        text: "Store locator with seventeen branches across four regions shown inside the embedded map",
        flags: {
          hasIframe: true,
          iframeDominant: true,
          iframeSrc: "https://maps.example.com/embed?store=all",
        },
      }),
    ]);
    expect(regions[0].issueType).toBe("iframe_embed");
    expect(regions[0].status).toBe("bad");
    expect(regions[0].evidence).toContain("maps.example.com");
  });

  it("canvas_or_image_data: chart pixels carry the data", async () => {
    const { regions } = await classifyFixture("canvas_or_image_data", [
      makeRegion({
        selector: "#chart-root",
        text: "Q1 48.2 Q2 51.7 Q3 39.4 Q4 44.1",
        flags: { hasCanvas: true, canvasDominant: true },
      }),
    ]);
    expect(regions[0].issueType).toBe("canvas_or_image_data");
    expect(regions[0].status).toBe("bad");
    expect(regions[0].evidence).toContain("<canvas>");
  });

  it("partial_content: half the text arrives via JS", async () => {
    const { regions } = await classifyFixture("partial_content", [
      makeRegion({
        selector: "#overview",
        text: `The scanner inspects every public page and reports exactly which
          regions remain readable without executing any script at all.
          Interactive comparisons, live pricing and the changelog feed are
          injected later by the client bundle once hydration has finished running here.`,
      }),
    ]);
    expect(regions[0].issueType).toBe("partial_content");
    expect(regions[0].status).toBe("warn");
    expect(regions[0].evidence).toMatch(/only \d+%/);
  });

  it("client_side_routes: hash-route navigation, probe confirms no distinct content", async () => {
    const probed: string[] = [];
    const { regions } = await classifyFixture(
      "client_side_routes",
      [
        makeRegion({
          selector: "#doc-nav",
          text: "Browse the guides, the API reference, the tutorials and the changelog from here. Guides API reference Tutorials Changelog",
          links: [
            { href: "#/guides", isClientRoute: true },
            { href: "#/api", isClientRoute: true },
            { href: "#/tutorials", isClientRoute: true },
            { href: "/changelog", isClientRoute: false },
          ],
        }),
      ],
      {
        probeLinks: async (urls): Promise<ProbeOutcome[]> => {
          probed.push(...urls);
          return urls.map((url) => ({ url, status: null, distinctContent: false }));
        },
      },
    );
    expect(regions[0].issueType).toBe("client_side_routes");
    expect(regions[0].status).toBe("warn");
    expect(probed.length).toBeGreaterThan(0);
    expect(probed.length).toBeLessThanOrEqual(3);
    expect(regions[0].evidence).toContain("3 of 4");
  });

  it("client_side_routes cleared when probes find distinct content", async () => {
    const { regions } = await classifyFixture(
      "client_side_routes",
      [
        makeRegion({
          selector: "#doc-nav",
          text: "Browse the guides, the API reference, the tutorials and the changelog from here. Guides API reference Tutorials Changelog",
          links: [
            { href: "#/guides", isClientRoute: true },
            { href: "#/api", isClientRoute: true },
            { href: "#/tutorials", isClientRoute: true },
          ],
        }),
      ],
      {
        probeLinks: async (urls): Promise<ProbeOutcome[]> =>
          urls.map((url) => ({ url, status: 200, distinctContent: true })),
      },
    );
    expect(regions[0].issueType).toBe("fully_visible");
  });

  it("hidden_but_present: raw HTML text hidden via CSS in render", async () => {
    const rawHtml = fixtureHtml("hidden_but_present");
    const rawText = extractRawText(rawHtml);
    const { regions } = await classify({
      regions: [],
      hiddenBlocks: [
        {
          selector: "#pricing-fallback",
          text: `The starter plan costs twelve dollars per month and includes three
            projects, unlimited scans and community support. The team plan costs
            forty nine dollars per month and adds shared dashboards, ten seats and
            priority email support with a one business day response target.`,
        },
      ],
      rawText,
      rawHtml,
      baseUrl: "https://example.com/pricing",
    });
    expect(regions).toHaveLength(1);
    expect(regions[0].issueType).toBe("hidden_but_present");
    expect(regions[0].status).toBe("ok");
    expect(regions[0].evidence).toContain("hidden via CSS");
  });

  it("hidden blocks NOT present in raw HTML are ignored", async () => {
    const { regions } = await classifyFixture("fully_visible", [], {
      hiddenBlocks: [
        {
          selector: "#ghost",
          text: "completely novel text that the raw response never contained anywhere at all in any form whatsoever for this many words honestly",
        },
      ],
    });
    expect(regions).toHaveLength(0);
  });
});

describe("classifier — ordering and weights", () => {
  it("orders issues first by impact and fills normalized weights", async () => {
    const { regions } = await classifyFixture("js_rendered_content", [
      makeRegion({
        selector: "#app",
        text: "Client only dashboard content injected after hydration with many words that never exist in the initial response at all",
        boundingBox: { x: 0, y: 0, width: 1280, height: 900 },
      }),
      makeRegion({
        selector: "#footer",
        name: "Footer",
        text: "tiny footer",
        boundingBox: { x: 0, y: 900, width: 1280, height: 60 },
      }),
    ]);
    expect(regions[0].selector).toBe("#app");
    const total = regions.reduce((sum, r) => sum + r.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});
