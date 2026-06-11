"use client";

import type { RegionResult } from "@/lib/engine/types";
import { VERDICT_LABEL, VERDICT_LONG } from "./labels";

/**
 * The rendered page screenshot with the verdict colors overlaid in place, so
 * it's obvious which parts of the real page are invisible to AI crawlers.
 * The renderer settles the page (animations frozen, lazy-loaders triggered)
 * and then measures geometry and captures the screenshot from that same
 * state, so the overlay aligns with what's pictured.
 */

const OVERLAY: Record<RegionResult["status"], string> = {
  ok: "bg-visible/15 border-visible hover:bg-visible/25",
  warn: "bg-partial/15 border-partial hover:bg-partial/25",
  bad: "bg-invisible/20 border-invisible hover:bg-invisible/30",
};

const TAG: Record<RegionResult["status"], string> = {
  ok: "bg-visible text-surface",
  warn: "bg-partial text-surface",
  bad: "bg-invisible text-surface",
};

export function ScreenshotView({
  scanId,
  regions,
  screenshot,
  selected,
  onSelect,
}: {
  scanId: string;
  regions: RegionResult[];
  screenshot: { width: number; height: number };
  selected: string | null;
  onSelect: (selector: string, trigger: HTMLElement) => void;
}) {
  const { width, height } = screenshot;
  const visible = regions
    .filter(
      (r) =>
        r.boundingBox.width > 0 &&
        r.boundingBox.height > 0 &&
        r.boundingBox.y < height,
    )
    .sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-soft">
      <div className="border-b border-hairline bg-bg px-4 py-2">
        <p className="text-xs text-muted">
          The page as the scan&apos;s browser rendered it, with each region
          tinted by its verdict. Tinted color shows what humans see; red areas
          are what AI crawlers miss.
        </p>
      </div>
      <div className="max-h-[34rem] overflow-y-auto bg-bg p-3">
        <div className="relative mx-auto w-full" style={{ maxWidth: width }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic per-scan screenshot served by an API route */}
          <img
            src={`/api/scan/${scanId}/screenshot`}
            alt="Screenshot of the rendered page"
            width={width}
            height={height}
            className="block w-full select-none"
            draggable={false}
          />
          <div className="absolute inset-0">
            {visible.map((region) => {
              const { x, y, width: w, height: h } = region.boundingBox;
              const isSelected = selected === region.selector;
              return (
                <button
                  key={region.selector}
                  type="button"
                  data-region-button={region.selector}
                  onClick={(e) => onSelect(region.selector, e.currentTarget)}
                  aria-label={`${region.name} — ${VERDICT_LONG[region.status]}`}
                  aria-pressed={isSelected}
                  title={`${region.name} — ${VERDICT_LONG[region.status]}`}
                  className={`absolute flex items-start justify-start overflow-hidden border-2 transition-colors ${OVERLAY[region.status]} ${
                    isSelected ? "ring-2 ring-ink ring-offset-1" : ""
                  }`}
                  style={{
                    left: pct(x, width),
                    top: pct(y, height),
                    width: pct(Math.min(w, width - x), width),
                    height: pct(Math.min(h, height - y), height),
                  }}
                >
                  <span
                    className={`m-0.5 rounded px-1 py-0.5 font-mono text-[9px] font-bold tracking-widest ${TAG[region.status]}`}
                  >
                    {VERDICT_LABEL[region.status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
