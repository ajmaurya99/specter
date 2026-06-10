import type { Comparison, RegionResult, ScanResult } from "@/lib/engine/types";

/**
 * Builders for the two exports: the markdown fix plan ("hand it to your dev
 * team") and the self-contained HTML report. Pure string assembly.
 */

const SEVERITY: Record<string, number> = { bad: 1, warn: 0.5, ok: 0 };

export function fixableRegionsByImpact(result: ScanResult): RegionResult[] {
  return result.regions
    .filter((r) => r.status === "bad" || r.status === "warn")
    .sort(
      (a, b) => b.weight * SEVERITY[b.status] - a.weight * SEVERITY[a.status],
    );
}

const CAVEAT =
  "Verdicts reflect what most AI crawlers retrieve: the raw HTML response, " +
  "without executing JavaScript. “Invisible” means invisible to most crawlers, " +
  "most of the time — not all; some AI products read from rendering search indexes.";

function checksLines(result: ScanResult): string[] {
  const c = result.pageChecks;
  const lines = [
    `- robots.txt: ${c.robotsTxt.present ? "present" : "not found"}`,
  ];
  if (c.robotsTxt.present) {
    for (const entry of c.robotsTxt.grid) {
      lines.push(`  - ${entry.crawler}: ${entry.allowed ? "allowed" : "disallowed"}`);
    }
  }
  lines.push(
    `- llms.txt: ${c.llmsTxt.present ? `present${c.llmsTxt.linksToPath ? ", links to this page" : ""}` : "not found"}`,
    `- JSON-LD structured data: ${c.hasJsonLd ? "present" : "none found"}`,
    `- <title>: ${c.hasTitle ? "present" : "missing"}`,
    `- meta description: ${c.hasMetaDescription ? "present" : "missing"}`,
    `- sitemap reference: ${c.hasSitemapReference ? "present" : "none found"}`,
    `- URL requires JS routing: ${c.requiresJsRouting ? "yes (#/ route)" : "no"}`,
  );
  return lines;
}

export function buildFixPlanMarkdown(result: ScanResult): string {
  const regions = fixableRegionsByImpact(result);
  const date = new Date(result.scannedAt).toUTCString();
  const parts: string[] = [
    `# Specter fix plan — ${result.url}`,
    "",
    `Scanned: ${date} · Visibility score: **${result.score}/100** · ${result.regions.length} regions analyzed`,
    "",
  ];

  if (result.blocked) {
    parts.push(
      "## Fix this first: AI crawlers are blocked at the door",
      "",
      result.blocked.evidence,
      "",
      "```",
      result.blocked.fixPrompt,
      "```",
      "",
    );
  }

  parts.push("## Page-level checks", "", ...checksLines(result), "");

  if (regions.length === 0) {
    parts.push("## Region fixes", "", "Nothing to fix — every region is visible to crawlers.");
  } else {
    parts.push(`## Region fixes (${regions.length}, ordered by score impact)`, "");
    regions.forEach((region, i) => {
      parts.push(
        `### ${i + 1}. ${region.name} — ${region.issueType.replace(/_/g, " ")} (${region.status === "bad" ? "invisible" : "partial"})`,
        "",
        `Selector: \`${region.selector}\``,
        `Evidence: ${region.evidence}`,
        "",
        "```",
        region.fixPrompt ?? "(no prompt generated)",
        "```",
        "",
      );
    });
  }

  parts.push("---", "", `> ${CAVEAT}`, "");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const VERDICT_LABEL: Record<string, string> = {
  ok: "VISIBLE",
  warn: "PARTIAL",
  bad: "INVISIBLE",
};

export function buildHtmlReport(result: ScanResult, comparison: Comparison | null): string {
  const counts = {
    ok: result.regions.filter((r) => r.status === "ok").length,
    warn: result.regions.filter((r) => r.status === "warn").length,
    bad: result.regions.filter((r) => r.status === "bad").length,
  };
  const date = new Date(result.scannedAt).toUTCString();

  const regionRows = result.regions
    .map(
      (r) => `
  <section class="region ${r.status}">
    <header><span class="tag ${r.status}">${VERDICT_LABEL[r.status]}</span>
      <h3>${esc(r.name)}</h3>
      <code>${esc(r.selector)}</code></header>
    <p class="evidence">${esc(r.evidence)}</p>
    ${r.fixPrompt ? `<details><summary>Fix prompt</summary><pre>${esc(r.fixPrompt)}</pre></details>` : ""}
  </section>`,
    )
    .join("\n");

  const checks = checksLines(result)
    .map((line) => `<li>${esc(line.replace(/^-\s*/, ""))}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Specter report — ${esc(result.url)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; background:#F5F6F5; color:#191C1A; margin:0; padding:48px 24px; }
  main { max-width: 860px; margin: 0 auto; }
  code, pre, .mono { font-family: ui-monospace, monospace; }
  .card { background:#fff; border:1px solid #E4E7E5; border-radius:12px; padding:24px; margin-bottom:16px; }
  h1 { font-size:28px; letter-spacing:-0.02em; margin:0 0 4px; }
  h3 { font-size:16px; margin:0; }
  .muted { color:#6E7572; }
  .score { font-size:56px; font-weight:700; font-family: ui-monospace, monospace; }
  .bar { display:flex; height:10px; border-radius:5px; overflow:hidden; margin:12px 0; background:#E4E7E5; }
  .bar .ok { background:#2E8F5B; } .bar .warn { background:#B98A0E; } .bar .bad { background:#CD4337; }
  .region { border:1px solid #E4E7E5; border-left-width:4px; border-radius:10px; padding:16px; margin:12px 0; background:#fff; }
  .region.ok { border-left-color:#2E8F5B; background:#EAF4EF; }
  .region.warn { border-left-color:#B98A0E; background:#F8F3E7; }
  .region.bad { border-left-color:#CD4337; background:#FAECEB; }
  .region header { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  .tag { font-family:ui-monospace,monospace; font-size:11px; letter-spacing:0.08em; font-weight:700; }
  .tag.ok { color:#207147; } .tag.warn { color:#8C680B; } .tag.bad { color:#B03A2F; }
  .evidence { font-family:ui-monospace,monospace; font-size:13px; }
  pre { white-space:pre-wrap; background:#191C1A; color:#F5F6F5; padding:16px; border-radius:8px; font-size:12.5px; }
  .blocked { border:2px solid #CD4337; }
  .caveat { font-size:12px; }
  ul { padding-left:20px; }
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>Specter visibility report</h1>
    <p class="mono muted">${esc(result.url)} · ${esc(date)}</p>
    <div class="score">${result.score}<span class="muted" style="font-size:24px">/100</span></div>
    ${
      comparison
        ? `<p class="mono">${comparison.prevScore} → ${comparison.nextScore} (${comparison.scoreDelta >= 0 ? "+" : ""}${comparison.scoreDelta} vs previous scan)</p>`
        : ""
    }
    <div class="bar">
      ${counts.ok ? `<span class="ok" style="flex:${counts.ok}"></span>` : ""}
      ${counts.warn ? `<span class="warn" style="flex:${counts.warn}"></span>` : ""}
      ${counts.bad ? `<span class="bad" style="flex:${counts.bad}"></span>` : ""}
    </div>
    <p class="mono muted">${counts.ok} visible · ${counts.warn} partial · ${counts.bad} invisible</p>
  </div>
  ${
    result.blocked
      ? `<div class="card blocked"><h3>AI crawlers are blocked at the door — fix this first</h3>
         <p class="evidence">${esc(result.blocked.evidence)}</p>
         <details><summary>Fix prompt</summary><pre>${esc(result.blocked.fixPrompt)}</pre></details></div>`
      : ""
  }
  <div class="card">
    <h3>Regions</h3>
    ${regionRows}
  </div>
  <div class="card">
    <h3>Page-level checks</h3>
    <ul>${checks}</ul>
  </div>
  <p class="caveat muted">${esc(CAVEAT)}</p>
</main>
</body>
</html>`;
}
