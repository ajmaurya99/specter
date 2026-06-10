import { publishScanEvent, registry } from "./registry";
import { runStoredScan } from "./scan-runner";

/**
 * In-process FIFO scan queue, concurrency 2 (spec). Survives dev HMR via the
 * globalThis registry; does NOT survive a process restart — boot.ts sweeps
 * orphaned rows to an error state at startup.
 */
export const SCAN_CONCURRENCY = 2;

/** 0 = running now; N ≥ 1 = Nth in line behind the running scans. */
export function currentQueuePosition(scanId: string): number | null {
  const reg = registry();
  if (reg.queue.running.has(scanId)) return 0;
  const idx = reg.queue.waiting.indexOf(scanId);
  return idx === -1 ? null : idx + 1;
}

export function enqueueScan(scanId: string): number {
  const reg = registry();
  reg.queue.waiting.push(scanId);
  pump();
  return currentQueuePosition(scanId) ?? 0;
}

function pump(): void {
  const reg = registry();
  while (reg.queue.running.size < SCAN_CONCURRENCY && reg.queue.waiting.length > 0) {
    const scanId = reg.queue.waiting.shift()!;
    reg.queue.running.add(scanId);
    // Detached promise is safe: next start is a long-lived Node process.
    void runStoredScan(scanId)
      .catch((err) => {
        console.error(`[specter] scan ${scanId} crashed outside the engine:`, err);
      })
      .finally(() => {
        reg.queue.running.delete(scanId);
        notifyWaiting();
        pump();
      });
  }
}

/** Tell everyone still in line their new position. */
function notifyWaiting(): void {
  const reg = registry();
  reg.queue.waiting.forEach((scanId, idx) => {
    publishScanEvent(scanId, { status: "queued", queuePosition: idx + 1 });
  });
}
