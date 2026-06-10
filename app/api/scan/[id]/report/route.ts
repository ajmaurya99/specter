import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { buildHtmlReport } from "@/lib/server/report";
import { parseComparison, parseScanResult } from "@/lib/server/scan-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (scan.status !== "done") {
    return NextResponse.json(
      { error: "not_ready", message: "The scan hasn't finished yet." },
      { status: 409 },
    );
  }
  const result = parseScanResult(scan.result);
  if (!result) {
    return NextResponse.json({ error: "corrupt_result" }, { status: 500 });
  }

  const host = safeHost(result.url);
  const stamp = (scan.finishedAt ?? scan.createdAt).toISOString().slice(0, 10);
  return new Response(buildHtmlReport(result, parseComparison(scan.comparison)), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="specter-report-${host}-${stamp}.html"`,
    },
  });
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "");
  } catch {
    return "page";
  }
}
