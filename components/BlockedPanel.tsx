import type { BotBlockVerdict } from "@/lib/engine/types";
import { PromptBox } from "./PromptBox";

/** Leads the results when the page-level verdict is crawler_blocked. */
export function BlockedPanel({ blocked }: { blocked: BotBlockVerdict }) {
  return (
    <section
      aria-labelledby="blocked-heading"
      className="rounded-card border-2 border-invisible bg-surface p-5 shadow-soft"
    >
      <span className="mb-2 block w-fit rounded-full bg-invisible-tint px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-invisible-text">
        PAGE-LEVEL VERDICT — CRAWLER BLOCKED
      </span>
      <h2 id="blocked-heading" className="text-xl font-bold tracking-tight">
        AI crawlers are blocked at the door — fix this first.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed">
        Region verdicts below are computed from the browser&apos;s view, but they are
        moot until crawlers can get in: the score is capped at 10 while the block stands.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-field border border-hairline bg-bg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Crawler user agent received
          </p>
          <p className="mt-1 font-mono text-sm">
            HTTP {blocked.crawler.status} · {blocked.crawler.bytes.toLocaleString()} bytes
          </p>
        </div>
        <div className="rounded-field border border-hairline bg-bg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Desktop browser received
          </p>
          <p className="mt-1 font-mono text-sm">
            HTTP {blocked.control.status} · {blocked.control.bytes.toLocaleString()} bytes
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-field border border-hairline bg-bg p-3 font-mono text-xs leading-relaxed">
        {blocked.evidence}
      </p>

      <div className="mt-4">
        <PromptBox prompt={blocked.fixPrompt} />
      </div>
    </section>
  );
}
