import { describe, expect, it } from "vitest";
import {
  DEDUPE_WINDOW_MS,
  isWithinDedupeWindow,
  normalizeUrl,
} from "@/lib/engine/normalize";

describe("normalizeUrl", () => {
  it("lowercases the host and keeps path case", () => {
    expect(normalizeUrl("https://EXAMPLE.com/Path")).toBe("https://example.com/Path");
  });

  it("adds https to bare domains", () => {
    expect(normalizeUrl("example.com/page")).toBe("https://example.com/page");
  });

  it("strips default ports", () => {
    expect(normalizeUrl("https://example.com:443/a")).toBe("https://example.com/a");
    expect(normalizeUrl("http://example.com:80/a")).toBe("http://example.com/a");
  });

  it("keeps explicit non-default ports", () => {
    expect(normalizeUrl("http://localhost:3000/a")).toBe("http://localhost:3000/a");
  });

  it("treats scheme-less host:port as a host, not a scheme", () => {
    expect(normalizeUrl("localhost:3000/a")).toBe("https://localhost:3000/a");
    expect(normalizeUrl("example.com:8080")).toBe("https://example.com:8080/");
  });

  it("preserves explicit non-http schemes for the engine to reject", () => {
    expect(normalizeUrl("ftp://example.com/file")).toBe("ftp://example.com/file");
  });

  it("strips trailing slashes except at the root", () => {
    expect(normalizeUrl("https://example.com/docs/")).toBe("https://example.com/docs");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("drops fragments and tracking params, sorts the rest", () => {
    expect(
      normalizeUrl(
        "https://example.com/p?utm_source=x&b=2&a=1&fbclid=abc&gclid=1#section",
      ),
    ).toBe("https://example.com/p?a=1&b=2");
  });

  it("throws on garbage", () => {
    expect(() => normalizeUrl("ht tp://nope")).toThrow();
  });
});

describe("isWithinDedupeWindow", () => {
  const now = new Date("2026-06-11T12:00:00Z");

  it("is true just inside the 10-minute window", () => {
    const finished = new Date(now.getTime() - (DEDUPE_WINDOW_MS - 1000));
    expect(isWithinDedupeWindow(finished, now)).toBe(true);
  });

  it("is false at and beyond the window", () => {
    const finished = new Date(now.getTime() - DEDUPE_WINDOW_MS);
    expect(isWithinDedupeWindow(finished, now)).toBe(false);
  });

  it("is false for future timestamps (clock skew)", () => {
    const finished = new Date(now.getTime() + 5000);
    expect(isWithinDedupeWindow(finished, now)).toBe(false);
  });
});
