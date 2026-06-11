"use client";

import { useEffect, useRef, useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (http origin) — select-and-copy still works
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-field border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-bg"
      aria-live="polite"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
