import { describe, expect, it } from "vitest";
import {
  buildBlockedFixPrompt,
  buildFixPrompt,
  rawSnippetFor,
  SNIPPET_MAX_CHARS,
} from "@/lib/engine/prompts";
import { fixtureHtml, makeRegionResult } from "./helpers";

const CTX = {
  url: "https://example.com/dashboard",
  stack: { stack: "Next.js", signals: ["Next.js runtime payload"] },
  rawHtml: fixtureHtml("js_rendered_content"),
};

describe("buildFixPrompt — every prompt embeds real scan data", () => {
  it("js_rendered_content prompt carries url, stack, selector, evidence and snippet", () => {
    const region = makeRegionResult({
      selector: "#app",
      name: "Dashboard",
      status: "bad",
      issueType: "js_rendered_content",
      evidence: "412 words rendered · 0 found in initial HTML · container #app is empty in the raw response",
      wordCount: 412,
    });
    const prompt = buildFixPrompt(region, CTX);
    expect(prompt).toContain("https://example.com/dashboard");
    expect(prompt).toContain("Next.js");
    expect(prompt).toContain("#app");
    expect(prompt).toContain("412 words rendered · 0 found in initial HTML");
    expect(prompt).toContain('<div id="app">');
    expect(prompt).toMatch(/curl -A "GPTBot"/);
    expect(prompt).toMatchSnapshot();
  });

  it("canvas prompt follows the spec's example structure", () => {
    const region = makeRegionResult({
      selector: "#map-root",
      name: "Data map",
      status: "bad",
      issueType: "canvas_or_image_data",
      evidence: "content is carried by a <canvas> element · 51 words rendered · 0% found in initial HTML",
    });
    const prompt = buildFixPrompt(region, {
      ...CTX,
      url: "https://example.com/map",
      stack: { stack: "WordPress", signals: ["wp-content asset paths"] },
    });
    expect(prompt).toContain("Page: https://example.com/map");
    expect(prompt).toContain("Stack: WordPress");
    expect(prompt).toMatch(/What I need:\n1\./);
    expect(prompt).toContain("semantic HTML <table>");
    expect(prompt).toMatch(/Constraints:/);
    expect(prompt).toMatchSnapshot();
  });

  it.each([
    "data_in_script_variable",
    "iframe_embed",
    "partial_content",
    "client_side_routes",
    "hidden_but_present",
  ] as const)("%s prompt embeds the selector and numbered requirements", (issueType) => {
    const region = makeRegionResult({
      selector: "#target-region",
      status: "warn",
      issueType,
      evidence: "37 words rendered · 12% found in initial HTML",
    });
    const prompt = buildFixPrompt(region, CTX);
    expect(prompt).toContain("#target-region");
    expect(prompt).toContain("37 words rendered");
    expect(prompt).toMatch(/1\..*\n2\./s);
  });
});

describe("rawSnippetFor", () => {
  it("truncates long snippets at the cap", () => {
    const big = `<html><body><div id="big">${"word ".repeat(500)}</div></body></html>`;
    const snippet = rawSnippetFor(big, "#big");
    expect(snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS + 1);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("reports absent selectors as evidence", () => {
    expect(rawSnippetFor("<html><body></body></html>", "#missing")).toContain(
      "absent from the raw response",
    );
  });
});

describe("buildBlockedFixPrompt", () => {
  it("embeds both fetch outcomes and the crawler UA", () => {
    const prompt = buildBlockedFixPrompt({
      url: "https://example.com",
      crawlerUserAgent: "GPTBot/1.0",
      crawler: { status: 403, bytes: 1234 },
      control: { status: 200, bytes: 98765 },
      evidence:
        "The crawler user agent received HTTP 403 (1234 bytes) while a desktop browser received HTTP 200 (98765 bytes).",
    });
    expect(prompt).toContain("HTTP 403 (1234 bytes)");
    expect(prompt).toContain("HTTP 200 (98765 bytes)");
    expect(prompt).toContain("GPTBot/1.0");
    expect(prompt).toContain("GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot");
    expect(prompt).toMatchSnapshot();
  });
});
