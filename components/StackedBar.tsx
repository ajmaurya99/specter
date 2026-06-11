import type { RegionResult } from "@/lib/engine/types";

/** Green/yellow/red proportion bar, weighted by each region's page share. */
export function StackedBar({ regions }: { regions: RegionResult[] }) {
  const share = { ok: 0, warn: 0, bad: 0 };
  for (const region of regions) share[region.status] += region.weight;
  const total = share.ok + share.warn + share.bad || 1;

  const pct = (v: number) => Math.round((v / total) * 100);
  const label = `${pct(share.ok)}% visible, ${pct(share.warn)}% partially visible, ${pct(share.bad)}% invisible`;

  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-hairline"
    >
      {share.ok > 0 && <span className="bg-visible" style={{ flexGrow: share.ok }} />}
      {share.warn > 0 && <span className="bg-partial" style={{ flexGrow: share.warn }} />}
      {share.bad > 0 && <span className="bg-invisible" style={{ flexGrow: share.bad }} />}
    </div>
  );
}
