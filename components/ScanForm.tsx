"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ScanForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      router.push(data.cached ? `/scan/${data.scanId}?cached=1` : `/scan/${data.scanId}`);
    } catch {
      setError("Could not reach the scanner. Is the server running?");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div className="flex w-full gap-2 rounded-card border border-hairline bg-surface p-2 shadow-soft">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Page URL to scan</span>
          <input
            id="scan-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="https://your-site.com/page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-field bg-surface px-3 py-2.5 font-mono text-sm placeholder:text-muted/60"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-field bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Scan page"}
        </button>
      </div>
      <p role="alert" aria-live="polite" className="mt-2 min-h-5 px-1 text-sm text-muted">
        {error}
      </p>
    </form>
  );
}
