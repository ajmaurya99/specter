// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ResultsExplorer } from "@/components/ResultsExplorer";
import type { ScanResult } from "@/lib/engine/types";
import { makeRegionResult } from "./helpers";

/**
 * Automated axe check on the results view (spec: Accessibility). jsdom has
 * no layout engine, so layout/color rules are disabled here — the Playwright
 * e2e runs the full rule set in real Chromium.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(cleanup);

const JSDOM_DISABLED_RULES = [
  // need real layout / real colors
  "color-contrast",
  "color-contrast-enhanced",
  "link-in-text-block",
  "target-size",
  "scrollable-region-focusable",
  // page-level rules are meaningless on a component fragment
  "region",
  "landmark-one-main",
  "html-has-lang",
  "document-title",
  "bypass",
  "page-has-heading-one",
  "landmark-unique",
].reduce<Record<string, { enabled: boolean }>>((acc, rule) => {
  acc[rule] = { enabled: false };
  return acc;
}, {});

async function expectNoViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: JSDOM_DISABLED_RULES });
  const formatted = results.violations.map(
    (v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target).join(", ")}`,
  );
  expect(formatted).toEqual([]);
}

function fixtureResult(): ScanResult {
  return {
    url: "https://example.com/page",
    finalUrl: "https://example.com/page",
    scannedAt: new Date().toISOString(),
    score: 55,
    blocked: null,
    stack: { stack: "Next.js", signals: [] },
    regions: [
      makeRegionResult({
        selector: "#app",
        name: "Dashboard",
        status: "bad",
        issueType: "js_rendered_content",
        evidence: "412 words rendered · 0 found in initial HTML",
        weight: 0.5,
        fixPrompt: "Fix prompt body with https://example.com/page and #app",
      }),
      makeRegionResult({
        selector: "#summary",
        name: "Summary",
        status: "warn",
        issueType: "partial_content",
        evidence: "100 words rendered · only 40% found in initial HTML",
        weight: 0.2,
        fixPrompt: "Another prompt",
      }),
      makeRegionResult({
        selector: "#footer",
        name: "Footer",
        status: "ok",
        issueType: "fully_visible",
        evidence: "30 words rendered · 100% present",
        weight: 0.3,
      }),
    ],
    pageChecks: {
      robotsTxt: {
        present: true,
        grid: [
          { crawler: "GPTBot", allowed: true },
          { crawler: "ClaudeBot", allowed: false },
        ],
      },
      llmsTxt: { present: false, linksToPath: null },
      hasJsonLd: true,
      hasTitle: true,
      hasMetaDescription: false,
      hasSitemapReference: true,
      requiresJsRouting: false,
    },
    rawText: "Raw crawler text body",
    telemetry: {
      crawlerStatus: 200,
      crawlerBytes: 1000,
      controlStatus: 200,
      controlBytes: 1200,
      fetchDurationMs: 100,
      renderDurationMs: 900,
      requestCount: 4,
    },
    pageHeight: 2400,
    viewportWidth: 1280,
    crawlerUserAgent: "GPTBot/1.0",
    screenshot: null,
  };
}

describe("results view accessibility (axe, jsdom)", () => {
  it("region list view has no violations", async () => {
    const { container } = render(
      <main>
        <ResultsExplorer
          scanId="test-scan"
          result={fixtureResult()}
          comparison={null}
          cached={false}
        />
      </main>,
    );
    await expectNoViolations(container);
  });

  it("detail view (after selecting a region) has no violations", async () => {
    const { container } = render(
      <main>
        <ResultsExplorer
          scanId="test-scan"
          result={fixtureResult()}
          comparison={null}
          cached={false}
        />
      </main>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Dashboard/ })[0]);
    expect(await screen.findByText("What the crawler found")).toBeTruthy();
    await expectNoViolations(container);
  });

  it("selecting a region moves focus to the detail heading", async () => {
    render(
      <main>
        <ResultsExplorer
          scanId="test-scan"
          result={fixtureResult()}
          comparison={null}
          cached={false}
        />
      </main>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Dashboard/ })[0]);
    const heading = await screen.findByRole("heading", { name: "Dashboard" });
    expect(document.activeElement).toBe(heading);
  });
});
