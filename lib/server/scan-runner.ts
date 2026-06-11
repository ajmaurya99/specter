import { compareScans } from "@/lib/engine/comparer";
import { isEngineError, runScan } from "@/lib/engine";
import type { ScanResult } from "@/lib/engine/types";
import { createEnhancer } from "@/lib/enhancer";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getBrowser } from "./browser";
import { env } from "./env";
import { prisma } from "./prisma";
import { publishScanEvent, type ScanStatus } from "./registry";
import { parseScanResult } from "./scan-data";

/**
 * Bridges the pure engine to persistence and live progress: every phase is
 * written to SQLite (poll fallback / permalinks) AND published to the
 * in-memory event bus (SSE). On completion, runs the rescan comparison.
 */

/** Stored rawText is capped so a heavy page cannot bloat the database. */
const RAW_TEXT_MAX_CHARS = 500_000;

export async function runStoredScan(scanId: string): Promise<void> {
  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan || scan.status === "done" || scan.status === "error") return;

  const setStatus = async (status: ScanStatus, telemetry?: Record<string, unknown>) => {
    await prisma.scan.update({ where: { id: scanId }, data: { status } });
    publishScanEvent(scanId, { status, telemetry });
  };

  try {
    const result = await runWithRetry(scan.normalizedUrl, scan.inputUrl, setStatus);

    const truncated: ScanResult = {
      ...result,
      rawText:
        result.rawText.length > RAW_TEXT_MAX_CHARS
          ? `${result.rawText.slice(0, RAW_TEXT_MAX_CHARS)}\n… [truncated at 500 KB]`
          : result.rawText,
    };

    const comparison = await computeComparison(scan.id, scan.normalizedUrl, truncated);

    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "done",
        score: truncated.score,
        result: truncated as unknown as Prisma.InputJsonValue,
        comparison: comparison
          ? (comparison as unknown as Prisma.InputJsonValue)
          : undefined,
        finishedAt: new Date(),
        errorType: null,
        errorMessage: null,
      },
    });

    publishScanEvent(scanId, {
      status: "done",
      score: truncated.score,
      regionVerdicts: truncated.regions.map((r) => ({
        selector: r.selector,
        name: r.name,
        status: r.status,
      })),
    });
  } catch (err) {
    const errorType = isEngineError(err) ? err.type : "render_failed";
    const message = isEngineError(err)
      ? err.message
      : "The scan failed unexpectedly. Try again.";
    if (!isEngineError(err)) {
      console.error(`[specter] scan ${scanId} failed:`, err);
    }
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "error", errorType, errorMessage: message, finishedAt: new Date() },
    });
    publishScanEvent(scanId, { status: "error", errorType, message });
  }
}

async function runWithRetry(
  url: string,
  originalUrl: string,
  setStatus: (s: ScanStatus, telemetry?: Record<string, unknown>) => Promise<void>,
): Promise<ScanResult> {
  const input = {
    url,
    originalUrl,
    crawlerUserAgent: env.CRAWLER_USER_AGENT,
    timeoutMs: env.SCAN_TIMEOUT_MS,
    allowLocal: env.ALLOW_LOCAL_TARGETS,
  };
  const deps = {
    enhancer: createEnhancer(env.ANTHROPIC_API_KEY),
    onProgress: (phase: ScanStatus, telemetry: Record<string, unknown>) => {
      // Fire-and-forget by design, but a failed write must not become an
      // unhandled rejection.
      setStatus(phase, telemetry).catch((err) =>
        console.error("[specter] progress write failed:", err),
      );
    },
  };

  try {
    const browser = await getBrowser();
    return await runScan(input, { ...deps, browser });
  } catch (err) {
    if (!(await browserDied(err))) throw err;
    // A crashed/disconnected browser is recoverable: relaunch and retry once.
    return await runScan(input, { ...deps, browser: await getBrowser() });
  }
}

/**
 * Crash detection must look at the EngineError's detail too — the renderer
 * wraps Playwright messages, so the top-level message alone never matches.
 */
async function browserDied(err: unknown): Promise<boolean> {
  const CRASH = /browser.*(closed|disconnected)|target page, context or browser/i;
  const texts: string[] = [];
  if (err instanceof Error) texts.push(err.message);
  if (isEngineError(err)) texts.push(String(err.detail?.message ?? ""));
  if (texts.some((t) => CRASH.test(t))) return true;
  try {
    const browser = await getBrowser();
    return !browser.isConnected();
  } catch {
    return true;
  }
}

async function computeComparison(
  scanId: string,
  normalizedUrl: string,
  result: ScanResult,
) {
  const previous = await prisma.scan.findFirst({
    where: { normalizedUrl, status: "done", id: { not: scanId } },
    orderBy: { finishedAt: "desc" },
  });
  if (!previous) return null;
  const prevResult = parseScanResult(previous.result);
  if (!prevResult) return null;
  return compareScans({ id: previous.id, result: prevResult }, { result });
}
