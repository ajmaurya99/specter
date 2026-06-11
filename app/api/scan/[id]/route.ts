import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { currentQueuePosition } from "@/lib/server/queue";

export const dynamic = "force-dynamic";

/** Coarse numeric progress per status (spec'd field; SSE carries the detail). */
const PROGRESS: Record<string, number> = {
  queued: 0,
  fetching: 0.2,
  rendering: 0.45,
  diffing: 0.7,
  classifying: 0.9,
  done: 1,
  error: 1,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: scan.id,
    url: scan.inputUrl,
    normalizedUrl: scan.normalizedUrl,
    status: scan.status,
    progress: PROGRESS[scan.status] ?? 0,
    queuePosition: scan.status === "queued" ? currentQueuePosition(scan.id) : undefined,
    errorType: scan.errorType ?? undefined,
    message: scan.errorMessage ?? undefined,
    score: scan.score ?? undefined,
    result: scan.result ?? undefined,
    comparison: scan.comparison ?? undefined,
    createdAt: scan.createdAt.toISOString(),
    finishedAt: scan.finishedAt?.toISOString(),
  });
}
