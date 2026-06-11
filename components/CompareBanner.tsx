import Link from "next/link";
import type { Comparison } from "@/lib/engine/types";

export function CompareBanner({ comparison }: { comparison: Comparison }) {
  const { prevScore, nextScore, scoreDelta } = comparison;
  const improved = comparison.regions.filter((r) => r.change === "improved").length;
  const regressed = comparison.regions.filter((r) => r.change === "regressed").length;

  return (
    <section
      aria-label="Comparison with previous scan"
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-card border border-hairline bg-surface px-5 py-4 shadow-soft"
    >
      <p className="font-mono text-2xl font-bold tabular-nums">
        {prevScore} → {nextScore}
        <span className="ml-2 text-base font-semibold text-muted">
          ({scoreDelta >= 0 ? "+" : ""}
          {scoreDelta})
        </span>
      </p>
      <p className="font-mono text-xs text-muted">
        {improved > 0 && `↑ ${improved} improved`}
        {improved > 0 && regressed > 0 && " · "}
        {regressed > 0 && `↓ ${regressed} regressed`}
        {improved === 0 && regressed === 0 && "no region changes"}
      </p>
      <Link
        href={`/scan/${comparison.prevScanId}`}
        className="ml-auto text-xs font-semibold underline underline-offset-2 hover:text-muted"
      >
        View previous scan
      </Link>
    </section>
  );
}
