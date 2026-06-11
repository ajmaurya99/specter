"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Shown when a dedupe hit served this scan instead of a fresh one. */
export function CachedNotice({ url, ageMinutes }: { url: string; ageMinutes: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rescan() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, force: true }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/scan/${data.scanId}`);
        return;
      }
      setError(data.message ?? "Rescan failed — try again.");
    } catch {
      setError("Could not reach the scanner — try again.");
    }
    setBusy(false);
  }

  return (
    <div
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card border border-hairline bg-surface px-4 py-2.5 text-sm shadow-soft"
      aria-live="polite"
    >
      <span className="text-muted" suppressHydrationWarning>
        Scanned {ageMinutes < 1 ? "moments" : `${ageMinutes} min`} ago — showing the
        cached result.
      </span>
      <button
        type="button"
        onClick={rescan}
        disabled={busy}
        className="ml-auto shrink-0 font-semibold underline underline-offset-2 hover:text-muted disabled:opacity-50"
      >
        {busy ? "Starting…" : "Rescan now"}
      </button>
      {error && <span className="w-full text-xs text-muted">{error}</span>}
    </div>
  );
}
