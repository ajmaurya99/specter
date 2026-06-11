"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Shown when a dedupe hit served this scan instead of a fresh one. */
export function CachedNotice({ url, ageMinutes }: { url: string; ageMinutes: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function rescan() {
    setBusy(true);
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
    } catch {
      // fall through to re-enable the button
    }
    setBusy(false);
  }

  return (
    <p className="flex items-baseline gap-3 rounded-card border border-hairline bg-surface px-4 py-2.5 text-sm shadow-soft">
      <span className="text-muted">
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
    </p>
  );
}
