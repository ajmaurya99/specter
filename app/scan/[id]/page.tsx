import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/ErrorState";
import { ResultsExplorer } from "@/components/ResultsExplorer";
import { ScanProgress } from "@/components/ScanProgress";
import { hostOf } from "@/components/labels";
import { prisma } from "@/lib/server/prisma";
import { currentQueuePosition } from "@/lib/server/queue";
import { parseComparison, parseScanResult } from "@/lib/server/scan-data";

/** The shareable, server-rendered report permalink. */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cached?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const scan = await prisma.scan.findUnique({ where: { id }, select: { inputUrl: true } });
  return {
    title: scan
      ? `Specter — ${hostOf(scan.inputUrl)}`
      : "Specter — scan not found",
  };
}

export default async function ScanPage({ params, searchParams }: Props) {
  const [{ id }, { cached }] = await Promise.all([params, searchParams]);
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) notFound();

  if (scan.status === "error") {
    return (
      <ErrorState
        errorType={scan.errorType ?? "render_failed"}
        message={scan.errorMessage ?? undefined}
        url={scan.inputUrl}
      />
    );
  }

  if (scan.status !== "done") {
    return (
      <>
        {/* No-JS fallback: this page is server-rendered per request, so a
            periodic reload eventually lands on the finished results. */}
        <noscript>
          <meta httpEquiv="refresh" content="4" />
        </noscript>
        <ScanProgress
          scanId={scan.id}
          url={scan.normalizedUrl}
          initialStatus={scan.status}
          initialQueuePosition={
            scan.status === "queued" ? currentQueuePosition(scan.id) : null
          }
        />
      </>
    );
  }

  const result = parseScanResult(scan.result);
  if (!result) {
    return (
      <ErrorState
        errorType="render_failed"
        message="The stored result could not be read — run the scan again."
        url={scan.inputUrl}
      />
    );
  }

  return (
    <main>
      <ResultsExplorer
        scanId={scan.id}
        result={result}
        comparison={parseComparison(scan.comparison)}
        cached={cached === "1"}
      />
    </main>
  );
}
