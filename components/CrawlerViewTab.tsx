/**
 * The proof behind every verdict: the exact stripped raw-HTML text the
 * differ used, untouched.
 */
export function CrawlerViewTab({ rawText }: { rawText: string }) {
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-soft">
      <div className="border-b border-hairline bg-bg px-4 py-2">
        <p className="text-xs text-muted">
          Text extracted from the raw HTML response with scripts stripped —
          exactly what the differ (and an AI crawler) reads.
        </p>
      </div>
      <div
        // Scrollable regions must be keyboard-focusable (axe:
        // scrollable-region-focusable); the rule doesn't know this idiom.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label="Crawler view: raw HTML text"
        className="max-h-[34rem] overflow-auto p-4"
      >
        {rawText.trim().length === 0 ? (
          <p className="font-mono text-sm text-muted">
            (empty — the raw response contains no readable text)
          </p>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{rawText}</pre>
        )}
      </div>
    </div>
  );
}
