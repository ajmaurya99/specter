import type { PageChecks } from "@/lib/engine/types";

function Check({ label, value, good }: { label: string; value: string; good: boolean | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1 py-1.5">
      <dt className="text-sm">{label}</dt>
      <dd className={`font-mono text-xs ${good === false ? "text-muted" : ""}`}>{value}</dd>
    </div>
  );
}

export function PageChecksPanel({ checks }: { checks: PageChecks }) {
  return (
    <section
      aria-labelledby="checks-heading"
      className="rounded-card border border-hairline bg-surface p-5 shadow-soft"
    >
      <h2 id="checks-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Page-level checks
      </h2>
      <div className="grid gap-x-10 sm:grid-cols-2">
        <dl className="divide-y divide-hairline">
          <div className="px-1 py-1.5">
            <dt className="text-sm">
              robots.txt {checks.robotsTxt.present ? "" : "— not found (crawlers allowed)"}
            </dt>
            {checks.robotsTxt.present && (
              <dd className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5">
                {checks.robotsTxt.grid.map((entry) => (
                  <span key={entry.crawler} className="flex justify-between font-mono text-xs">
                    <span>{entry.crawler}</span>
                    <span className={entry.allowed ? "" : "text-invisible-text"}>
                      {entry.allowed ? "✓ allowed" : "✗ disallowed"}
                    </span>
                  </span>
                ))}
              </dd>
            )}
          </div>
        </dl>
        <dl className="divide-y divide-hairline">
          <Check
            label="llms.txt"
            value={
              checks.llmsTxt.present
                ? checks.llmsTxt.linksToPath
                  ? "present · links here"
                  : "present"
                : "not found"
            }
            good={checks.llmsTxt.present}
          />
          <Check
            label="JSON-LD structured data"
            value={checks.hasJsonLd ? "present" : "none"}
            good={checks.hasJsonLd}
          />
          <Check label="<title>" value={checks.hasTitle ? "present" : "missing"} good={checks.hasTitle} />
          <Check
            label="Meta description"
            value={checks.hasMetaDescription ? "present" : "missing"}
            good={checks.hasMetaDescription}
          />
          <Check
            label="Sitemap reference"
            value={checks.hasSitemapReference ? "present" : "none"}
            good={checks.hasSitemapReference}
          />
          <Check
            label="URL needs JS routing"
            value={checks.requiresJsRouting ? "yes (#/ route)" : "no"}
            good={!checks.requiresJsRouting}
          />
        </dl>
      </div>
    </section>
  );
}
