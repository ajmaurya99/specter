import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { parseComparison } from "@/lib/server/scan-data";

export const dynamic = "force-dynamic";

export interface RecentScanItem {
  scanId: string;
  url: string;
  normalizedUrl: string;
  score: number;
  /** Score delta vs that URL's previous scan, when one exists. */
  delta: number | null;
  finishedAt: string;
}

const MAX_ITEMS = 8;

export async function GET() {
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
    if (items.length >= MAX_ITEMS) break;
  }

  return NextResponse.json({ items });
}
