import { describe, expect, it } from "vitest";
import { AI_CRAWLERS, isPathAllowed, parseRobots, robotsGrid } from "@/lib/engine/robots";

const ROBOTS = `
# global rules
User-agent: *
Disallow: /admin/
Allow: /admin/help

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
User-agent: PerplexityBot
Disallow: /private/

Sitemap: https://example.com/sitemap.xml
`;

describe("parseRobots", () => {
  it("groups consecutive user-agent lines and collects sitemaps", () => {
    const { groups, sitemaps } = parseRobots(ROBOTS);
    expect(groups).toHaveLength(3);
    expect(groups[2].agents).toEqual(["claudebot", "perplexitybot"]);
    expect(sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });
});

describe("isPathAllowed", () => {
  it("applies the specific group over the wildcard", () => {
    expect(isPathAllowed(ROBOTS, "GPTBot", "/article")).toBe(false);
    expect(isPathAllowed(ROBOTS, "CCBot", "/article")).toBe(true);
  });

  it("longest match wins, Allow beats Disallow at equal length", () => {
    expect(isPathAllowed(ROBOTS, "CCBot", "/admin/settings")).toBe(false);
    expect(isPathAllowed(ROBOTS, "CCBot", "/admin/help")).toBe(true);
  });

  it("shared groups apply to every listed agent", () => {
    expect(isPathAllowed(ROBOTS, "ClaudeBot", "/private/x")).toBe(false);
    expect(isPathAllowed(ROBOTS, "PerplexityBot", "/private/x")).toBe(false);
    expect(isPathAllowed(ROBOTS, "ClaudeBot", "/public")).toBe(true);
  });

  it("supports wildcards and end anchors", () => {
    const robots = `User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*`;
    expect(isPathAllowed(robots, "GPTBot", "/file.pdf")).toBe(false);
    expect(isPathAllowed(robots, "GPTBot", "/file.pdf.html")).toBe(true);
    expect(isPathAllowed(robots, "GPTBot", "/tmp/x")).toBe(false);
  });

  it("allows everything when no group matches", () => {
    expect(isPathAllowed("User-agent: OtherBot\nDisallow: /", "GPTBot", "/")).toBe(true);
  });
});

describe("robotsGrid", () => {
  it("produces one entry per AI crawler", () => {
    const grid = robotsGrid(ROBOTS, "/private/page");
    expect(grid.map((g) => g.crawler)).toEqual([...AI_CRAWLERS]);
    expect(grid.find((g) => g.crawler === "GPTBot")?.allowed).toBe(false);
    expect(grid.find((g) => g.crawler === "ClaudeBot")?.allowed).toBe(false);
    expect(grid.find((g) => g.crawler === "CCBot")?.allowed).toBe(true);
  });

  it("treats a missing robots.txt as allow-all", () => {
    expect(robotsGrid(null, "/x").every((g) => g.allowed)).toBe(true);
  });
});
