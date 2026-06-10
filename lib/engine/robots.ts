import type { RobotsGridEntry } from "./types";

/**
 * Minimal robots.txt evaluation for the AI-crawler grid. Standard rules:
 * the most specific user-agent group applies (exact name beats *), and
 * within a group the longest matching path rule wins, Allow beating
 * Disallow on equal length. Informational — not a region verdict.
 */

export const AI_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
] as const;

interface RuleGroup {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
}

export function parseRobots(content: string): {
  groups: RuleGroup[];
  sitemaps: string[];
} {
  const groups: RuleGroup[] = [];
  const sitemaps: string[] = [];
  let current: RuleGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === "sitemap" && value) {
      sitemaps.push(value);
      continue;
    }
    if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ allow: field === "allow", path: value });
    }
  }

  return { groups, sitemaps };
}

function ruleMatches(rulePath: string, path: string): number {
  // Returns match specificity (pattern length) or -1. Supports * and $.
  if (rulePath === "") return -1; // "Disallow:" empty = allow everything
  const pattern = rulePath
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const anchored = pattern.endsWith("\\$")
    ? `^${pattern.slice(0, -2)}$`
    : `^${pattern}`;
  return new RegExp(anchored).test(path) ? rulePath.length : -1;
}

export function isPathAllowed(
  robotsContent: string,
  crawler: string,
  path: string,
): boolean {
  const { groups } = parseRobots(robotsContent);
  const name = crawler.toLowerCase();

  const group =
    groups.find((g) => g.agents.some((a) => a === name)) ??
    groups.find((g) => g.agents.some((a) => a !== "*" && name.includes(a))) ??
    groups.find((g) => g.agents.includes("*"));
  if (!group) return true;

  let best: { allow: boolean; specificity: number } | null = null;
  for (const rule of group.rules) {
    const specificity = ruleMatches(rule.path, path);
    if (specificity === -1) continue;
    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && rule.allow && !best.allow)
    ) {
      best = { allow: rule.allow, specificity };
    }
  }
  return best ? best.allow : true;
}

export function robotsGrid(
  robotsContent: string | null,
  path: string,
): RobotsGridEntry[] {
  return AI_CRAWLERS.map((crawler) => ({
    crawler,
    allowed: robotsContent === null ? true : isPathAllowed(robotsContent, crawler, path),
  }));
}
