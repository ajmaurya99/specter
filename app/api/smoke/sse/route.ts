// Phase 0 smoke test: verifies SSE streams incrementally (not buffered)
// under both `next dev` and `next start`. Deleted in Phase 2.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let n = 0;
      const send = () => {
        n += 1;
        try {
          controller.enqueue(
            encoder.encode(`id: ${n}\ndata: {"tick":${n},"t":${Date.now()}}\n\n`),
          );
        } catch {
          clearInterval(timer);
        }
        if (n >= 5) {
          clearInterval(timer);
          try {
            controller.close();
          } catch {
            // already closed by cancel/abort
          }
        }
      };
      timer = setInterval(send, 1000);
      send();
      request.signal.addEventListener("abort", () => clearInterval(timer));
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
