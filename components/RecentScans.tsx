import Link from "next/link";
import { recentScans } from "@/lib/server/recent";
import { hostOf, timeAgo } from "./labels";

/** Server component: latest score per URL with a small ± delta. */
export async function RecentScans() {
  const items = await recentScans();
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="w-full">
      <h2 id="recent-heading" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
        Recent scans
      </h2>
      <ul className="divide-y divide-hairline rounded-card border border-hairline bg-surface">
        {items.map((item) => (
          <li key={item.scanId}>
            <Link
              href={`/scan/${item.scanId}`}
              className="flex items-baseline gap-3 px-4 py-2.5 text-sm hover:bg-bg"
            >
              <span className="min-w-0 flex-1 truncate font-mono" title={item.normalizedUrl}>
                {hostOf(item.normalizedUrl)}
                <span className="text-muted">
                  {new URL(item.normalizedUrl).pathname.replace(/\/$/, "") || ""}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted">{timeAgo(item.finishedAt)}</span>
              {item.delta !== null && item.delta !== 0 && (
                <span className="shrink-0 font-mono text-xs text-muted">
                  {item.delta > 0 ? `↑ +${item.delta}` : `↓ ${item.delta}`}
                </span>
              )}
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                {item.score}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
