import { describe, expect, it } from "vitest";
import { createDiffer } from "@/lib/engine/differ";

const RAW = `Field measurements along the northern shoreline recorded an average
retreat of 2.4 meters during 2025, the fastest annual rate since monitoring
began in 1998. Storm frequency explains most of the variance.`;

describe("createDiffer — long regions (shingles)", () => {
  it("scores 1.0 for text fully present in the raw HTML", () => {
    const differ = createDiffer(RAW, "");
    const { coverage } = differ.diff(
      "Field measurements along the northern shoreline recorded an average retreat of 2.4 meters during 2025",
    );
    expect(coverage).toBe(1);
  });

  it("scores 0 for text absent from the raw HTML", () => {
    const differ = createDiffer(RAW, "");
    const { coverage } = differ.diff(
      "This dashboard renders interactive charts of revenue and churn entirely on the client side after hydration",
    );
    expect(coverage).toBe(0);
  });

  it("scores partially for half-present text", () => {
    const differ = createDiffer(RAW, "");
    const present = "Storm frequency explains most of the variance";
    const absent = "while client side hydration injects the remaining interactive widgets later";
    const { coverage } = differ.diff(`${present} ${absent}`);
    expect(coverage).toBeGreaterThan(0.05);
    expect(coverage).toBeLessThan(0.5);
  });
});

describe("createDiffer — short regions (distinctive tokens)", () => {
  it("matches short stat lines via numbers and rare words", () => {
    const differ = createDiffer("Total retreat 2.4 meters across 17 transects", "");
    const { coverage } = differ.diff("2.4 meters · 17 transects");
    expect(coverage).toBe(1);
  });

  it("misses short text whose distinctive tokens are absent", () => {
    const differ = createDiffer("completely unrelated raw content here", "");
    const { coverage } = differ.diff("Revenue 48.2M up 12%");
    expect(coverage).toBe(0);
  });
});

describe("createDiffer — script detection", () => {
  const SCRIPT = `window.__DATA__ = {
    "summary": "Revenue grew strongly across all four reporting segments this year",
    "values": [48.2, 51.7]
  };`;

  it("finds long region text inside inline script strings", () => {
    const differ = createDiffer("<html empty>", SCRIPT);
    const { coverage, foundInScripts } = differ.diff(
      "Revenue grew strongly across all four reporting segments this year",
    );
    expect(coverage).toBe(0);
    expect(foundInScripts).toBeGreaterThanOrEqual(0.5);
  });

  it("finds short numeric content in scripts", () => {
    const differ = createDiffer("", SCRIPT);
    const { foundInScripts } = differ.diff("48.2 51.7");
    expect(foundInScripts).toBe(1);
  });

  it("matches JSON-escaped script content", () => {
    const escaped = `var t = "the q4 number was \\"48.2\\" million dollars overall";`;
    const differ = createDiffer("", escaped);
    const { foundInScripts } = differ.diff("48.2 million dollars");
    expect(foundInScripts).toBeGreaterThan(0.5);
  });
});

describe("createDiffer — edge cases", () => {
  it("returns zeros for an empty region", () => {
    const differ = createDiffer(RAW, "");
    expect(differ.diff("")).toEqual({ coverage: 0, foundInScripts: 0 });
  });

  it("handles empty raw text", () => {
    const differ = createDiffer("", "");
    expect(differ.diff("some rendered words here").coverage).toBe(0);
  });
});
