import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isWithinDedupeWindow, normalizeUrl } from "@/lib/engine/normalize";
import { prisma } from "@/lib/server/prisma";
import { enqueueScan } from "@/lib/server/queue";
import { checkRateLimit, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  url: z.string().trim().min(1, "Enter a URL").max(2048),
  force: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(clientIp(request));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many scans — wait a minute and retry." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Expected { url: string, force?: boolean }." },
      { status: 400 },
    );
  }

  let url: string;
  try {
    url = normalizeUrl(body.url);
  } catch {
    return NextResponse.json(
      { error: "invalid_url", message: "That doesn't look like a valid URL." },
      { status: 400 },
    );
  }

  // 10-minute dedupe: serve the cached scan unless force bypasses it.
  if (!body.force) {
    const recent = await prisma.scan.findFirst({
      where: { normalizedUrl: url, status: "done", finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { id: true, finishedAt: true },
    });
    if (recent?.finishedAt && isWithinDedupeWindow(recent.finishedAt, new Date())) {
      const ageSeconds = Math.round((Date.now() - recent.finishedAt.getTime()) / 1000);
      return NextResponse.json({ scanId: recent.id, cached: true, ageSeconds });
    }
  }

  const scan = await prisma.scan.create({
    data: { inputUrl: body.url.trim(), normalizedUrl: url, status: "queued" },
    select: { id: true },
  });
  const queuePosition = enqueueScan(scan.id);

  return NextResponse.json({ scanId: scan.id, queuePosition }, { status: 202 });
}
