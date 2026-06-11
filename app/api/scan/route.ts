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

/**
 * Accepts JSON (the hydrated ScanForm) AND form-encoded posts (the no-JS
 * fallback when a tab's scripts never loaded). Form posts get redirects
 * instead of JSON — progressive enhancement, practiced as preached.
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const isFormPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  const fail = (status: number, error: string, message: string, raw = "") => {
    if (isFormPost) {
      const params = new URLSearchParams();
      if (raw) params.set("url", raw);
      params.set("error", message);
      return NextResponse.redirect(new URL(`/?${params}`, request.url), 303);
    }
    return NextResponse.json({ error, message }, { status });
  };

  const rate = checkRateLimit(clientIp(request));
  if (!rate.allowed) {
    const res = fail(429, "rate_limited", "Too many scans — wait a minute and retry.");
    if (!isFormPost) res.headers.set("Retry-After", String(rate.retryAfterSeconds));
    return res;
  }

  let raw: { url: string; force?: boolean };
  try {
    if (isFormPost) {
      const form = await request.formData();
      raw = {
        url: String(form.get("url") ?? ""),
        force: form.get("force") === "true",
      };
    } else {
      raw = await request.json();
    }
  } catch {
    return fail(400, "invalid_request", "Expected { url: string, force?: boolean }.");
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(raw);
  } catch {
    return fail(400, "invalid_request", "Enter a URL to scan.", String(raw?.url ?? ""));
  }

  let url: string;
  try {
    url = normalizeUrl(body.url);
  } catch {
    return fail(400, "invalid_url", "That doesn't look like a valid URL.", body.url);
  }

  const ok = (scanId: string, cached: boolean, extra: Record<string, unknown>) => {
    if (isFormPost) {
      return NextResponse.redirect(
        new URL(`/scan/${scanId}${cached ? "?cached=1" : ""}`, request.url),
        303,
      );
    }
    return NextResponse.json(
      { scanId, ...(cached ? { cached: true } : {}), ...extra },
      { status: cached ? 200 : 202 },
    );
  };

  // 10-minute dedupe: serve the cached scan unless force bypasses it.
  if (!body.force) {
    const recent = await prisma.scan.findFirst({
      where: { normalizedUrl: url, status: "done", finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { id: true, finishedAt: true },
    });
    if (recent?.finishedAt && isWithinDedupeWindow(recent.finishedAt, new Date())) {
      const ageSeconds = Math.round((Date.now() - recent.finishedAt.getTime()) / 1000);
      return ok(recent.id, true, { ageSeconds });
    }
  }

  const scan = await prisma.scan.create({
    data: { inputUrl: body.url.trim(), normalizedUrl: url, status: "queued" },
    select: { id: true },
  });
  const queuePosition = enqueueScan(scan.id);

  return ok(scan.id, false, { queuePosition });
}
