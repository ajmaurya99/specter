import type { NextRequest } from "next/server";
import { parseScanResult } from "@/lib/server/scan-data";
import { prisma } from "@/lib/server/prisma";
import {
  registry,
  scanChannel,
  type ScanEvent,
  type ScanStatus,
} from "@/lib/server/registry";

/**
 * Live scan progress over Server-Sent Events. Replays the in-memory buffer
 * (honoring Last-Event-ID), then subscribes to the event bus. compress:false
 * globally plus no-transform/X-Accel-Buffering here kill response buffering.
 */
export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const HEARTBEAT_MS = 15_000;

function isTerminal(status: ScanStatus | string): boolean {
  return status === "done" || status === "error";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) {
    return new Response("scan not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const reg = registry();
  const channel = scanChannel(id);
  const lastEventId = Number(request.headers.get("last-event-id") ?? "") || 0;

  let teardown = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let lastSent = lastEventId;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        teardown();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };

      const send = (event: ScanEvent) => {
        if (closed || event.seq <= lastSent) return;
        lastSent = event.seq;
        try {
          controller.enqueue(
            encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          close();
          return;
        }
        if (isTerminal(event.status)) close();
      };

      // Scan already finished (possibly before this process started): one
      // terminal event synthesized from the row, then close.
      if (isTerminal(scan.status)) {
        const result = parseScanResult(scan.result);
        send({
          seq: lastSent + 1,
          status: scan.status as ScanStatus,
          score: scan.score ?? undefined,
          errorType: scan.errorType ?? undefined,
          message: scan.errorMessage ?? undefined,
          regionVerdicts: result?.regions.map((r) => ({
            selector: r.selector,
            name: r.name,
            status: r.status,
          })),
        });
        return;
      }

      const listener = (event: ScanEvent) => send(event);
      reg.emitter.on(channel, listener);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": hb\n\n"));
        } catch {
          close();
        }
      }, HEARTBEAT_MS);

      teardown = () => {
        clearInterval(heartbeat);
        reg.emitter.off(channel, listener);
      };

      // Replay missed events synchronously in the same tick as the subscribe
      // so nothing can slot in between.
      for (const event of reg.events.get(id) ?? []) send(event);

      // Cleanup on BOTH abort and cancel — abort alone is historically flaky.
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      teardown();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
