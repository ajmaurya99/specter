"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@/lib/engine/types";

interface ScanEventPayload {
  status: string;
  queuePosition?: number;
  telemetry?: Record<string, unknown>;
  score?: number;
  errorType?: string;
  message?: string;
  regionVerdicts?: Array<{ selector: string; name: string; status: Verdict }>;
}

const PHASE_TEXT: Record<string, string> = {
  queued: "Waiting for a scanner slot…",
  fetching: "Fetching raw HTML…",
  rendering: "Rendering in headless browser…",
  diffing: "Diffing crawler view vs rendered DOM…",
  classifying: "Classifying regions…",
};

/** Ghost-page skeleton: widths echo a generic page; bars tint at the end. */
const BARS = [
  "w-2/5 h-7",
  "w-full h-24",
  "w-11/12 h-16",
  "w-full h-28",
  "w-3/4 h-16",
  "w-full h-20",
  "w-1/2 h-10",
];

const TINT: Record<Verdict, string> = {
  ok: "bg-visible-tint border-visible",
  warn: "bg-partial-tint border-partial",
  bad: "bg-invisible-tint border-invisible",
};

function telemetryLine(status: string, t: Record<string, unknown> | undefined): string {
  if (!t) return "";
  switch (status) {
    case "fetching":
      return String(t.url ?? "");
    case "rendering":
      return `HTTP ${t.statusCode} · ${t.bytes} bytes${t.blocked ? " · crawler blocked — using browser view" : ""}`;
    case "diffing":
      return `${t.requestCount} requests · ${t.regionCount} regions captured`;
    case "classifying":
      return `${t.regionCount} regions · applying issue taxonomy`;
    default:
      return "";
  }
}

export function ScanProgress({
  scanId,
  url,
  initialStatus,
  initialQueuePosition,
}: {
  scanId: string;
  url: string;
  initialStatus: string;
  initialQueuePosition: number | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [queuePosition, setQueuePosition] = useState(initialQueuePosition);
  const [telemetry, setTelemetry] = useState<Record<string, unknown> | undefined>();
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    let errorCount = 0;
    let poller: ReturnType<typeof setInterval> | undefined;
    const source = new EventSource(`/api/scan/${scanId}/events`);

    const finish = (delayMs: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      source.close();
      if (poller) clearInterval(poller);
      setTimeout(() => router.refresh(), delayMs);
    };

    source.onmessage = (msg) => {
      const event: ScanEventPayload = JSON.parse(msg.data);
      setStatus(event.status);
      setQueuePosition(event.queuePosition ?? null);
      if (event.telemetry) setTelemetry(event.telemetry);
      if (event.status === "done") {
        const v = (event.regionVerdicts ?? []).map((r) => r.status);
        setVerdicts(BARS.map((_, i) => v[i % Math.max(1, v.length)] ?? "ok"));
        // Let the diagnosis develop in front of the user before swapping in
        // the results view.
        finish(1600);
      } else if (event.status === "error") {
        finish(150);
      }
    };

    // EventSource auto-reconnects (replaying via Last-Event-ID); after two
    // failures fall back to polling the status endpoint.
    source.onerror = () => {
      errorCount += 1;
      if (errorCount < 2 || poller || finishedRef.current) return;
      source.close();
      poller = setInterval(async () => {
        try {
          const res = await fetch(`/api/scan/${scanId}`);
          if (!res.ok) return;
          const data = await res.json();
          setStatus(data.status);
          setQueuePosition(data.queuePosition ?? null);
          if (data.status === "done" || data.status === "error") finish(150);
        } catch {
          // server briefly unreachable — keep polling
        }
      }, 2500);
    };

    return () => {
      source.close();
      if (poller) clearInterval(poller);
    };
  }, [scanId, router]);

  const statusText =
    status === "queued" && queuePosition
      ? `Waiting — #${queuePosition} in line`
      : (PHASE_TEXT[status] ?? "Working…");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16">
      <h1 className="sr-only">Scanning {url}</h1>

      <div className="w-full">
        <p className="mb-1 truncate text-center font-mono text-xs text-muted">{url}</p>
        <div
          className="relative w-full overflow-hidden rounded-card border border-hairline bg-surface p-6 shadow-soft"
          aria-hidden
        >
          {/* the sweep */}
          {!verdicts && (
            <div className="motion-safe:animate-sweep absolute inset-x-0 top-0 h-px bg-ink/70" />
          )}
          <div className="flex flex-col gap-3">
            {BARS.map((size, i) => (
              <div
                key={i}
                className={`rounded-md border ${size} ${
                  verdicts
                    ? `${TINT[verdicts[i]]} transition-colors duration-500`
                    : "border-transparent bg-hairline/70"
                }`}
                style={verdicts ? { transitionDelay: `${i * 160}ms` } : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col items-center gap-1 text-center">
        <p className="text-lg font-semibold">
          {verdicts ? "Diagnosis ready." : statusText}
        </p>
        <p className="min-h-5 font-mono text-xs text-muted">
          {verdicts ? "Loading results…" : telemetryLine(status, telemetry)}
        </p>
      </div>
    </main>
  );
}
