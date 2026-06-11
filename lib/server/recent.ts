import { prisma } from "./prisma";
import { parseComparison } from "./scan-data";

export interface RecentScanItem {
  scanId: string;
  url: string;
  normalizedUrl: string;
  score: number;
  delta: number | null;
  finishedAt: string;
}

/** Latest completed scan per URL, newest first. */
export async function recentScans(limit = 8): Promise<RecentScanItem[]> {
  const rows = await prisma.scan.findMany({
    where: { status: "done" },
    orderBy: { finishedAt: "desc" },
    take: 60,
    select: {
      id: true,
      inputUrl: true,
      normalizedUrl: true,
      score: true,
      comparison: true,
      finishedAt: true,
    },
  });

  const seen = new Set<string>();
  const items: RecentScanItem[] = [];
  for (const row of rows) {
    if (seen.has(row.normalizedUrl) || row.score === null || !row.finishedAt) continue;
    seen.add(row.normalizedUrl);
    items.push({
      scanId: row.id,
      url: row.inputUrl,
      normalizedUrl: row.normalizedUrl,
      score: row.score,
      delta: parseComparison(row.comparison)?.scoreDelta ?? null,
      finishedAt: row.finishedAt.toISOString(),
    });
    if (items.length >= limit) break;
  }
  return items;
}
