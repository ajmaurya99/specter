"use client";

import type { RegionChangeKind, RegionResult } from "@/lib/engine/types";
import { VERDICT_LABEL, VERDICT_LONG } from "./labels";

/**
 * The page reconstructed as a stylized region map in a faux browser frame.
 * Regions are real buttons, percentage-positioned from their rendered
 * bounding boxes; abstract skeleton shapes hint at the content type.
 */

const MAX_MAP_PAGE_HEIGHT = 4200;

const SURFACE: Record<RegionResult["status"], string> = {
  ok: "bg-visible-tint border-visible/60 hover:border-visible",
  warn: "bg-partial-tint border-partial/60 hover:border-partial",
  bad: "bg-invisible-tint border-invisible/60 hover:border-invisible",
};

const TAG_TEXT: Record<RegionResult["status"], string> = {
  ok: "text-visible-text",
  warn: "text-partial-text",
  bad: "text-invisible-text",
};

const CHANGE_GLYPH: Partial<Record<RegionChangeKind, string>> = {
  improved: "↑ improved",
  regressed: "↓ regressed",
  new: "+ new",
};

function Shapes({ region }: { region: RegionResult }) {
  const { flags, boundingBox } = region;
  if (boundingBox.height < 70) return null;
  if (flags.canvasDominant || flags.iframeDominant || flags.imageDominant) {
    return (
      <div
        aria-hidden
        className="mx-auto mt-2 h-1/3 max-h-16 w-3/5 rounded-[45%] border-2 border-ink/15"
      />
    );
  }
  if (flags.hasTable) {
    return (
      <div aria-hidden className="mt-2 grid w-3/4 grid-cols-3 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-2 rounded-sm bg-ink/10" />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className="mt-2 flex w-full flex-col gap-1.5">
      <span className="h-1.5 w-11/12 rounded-full bg-ink/10" />
      <span className="h-1.5 w-3/4 rounded-full bg-ink/10" />
      {boundingBox.height > 160 && <span className="h-1.5 w-5/6 rounded-full bg-ink/10" />}
    </div>
  );
}

export function RegionMap({
  regions,
  pageHeight,
  url,
  selected,
  changeBySelector,
  onSelect,
}: {
  regions: RegionResult[];
  pageHeight: number;
  url: string;
  selected: string | null;
  changeBySelector: Map<string, RegionChangeKind>;
  onSelect: (selector: string, trigger: HTMLElement) => void;
}) {
  const mapHeight = Math.min(Math.max(pageHeight, 800), MAX_MAP_PAGE_HEIGHT);
  const visible = regions
    .filter((r) => r.boundingBox.width > 0 && r.boundingBox.height > 0)
    .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-soft">
      {/* faux browser chrome */}
      <div className="flex items-center gap-2 border-b border-hairline bg-bg px-3 py-2" aria-hidden>
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-hairline" />
          <span className="size-2.5 rounded-full bg-hairline" />
          <span className="size-2.5 rounded-full bg-hairline" />
        </span>
        <span className="ml-2 flex-1 truncate rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-xs text-muted">
          {url}
        </span>
      </div>

      <div className="max-h-[34rem] overflow-y-auto p-3">
        <div
          className="relative w-full"
          style={{ aspectRatio: `1280 / ${mapHeight}` }}
        >
          {visible.map((region) => {
            const { x, y, width, height } = region.boundingBox;
            const change = changeBySelector.get(region.selector);
            const glyph = change ? CHANGE_GLYPH[change] : undefined;
            const isSelected = selected === region.selector;
            return (
              <button
                key={region.selector}
                type="button"
                onClick={(e) => onSelect(region.selector, e.currentTarget)}
                aria-label={`${region.name} — ${VERDICT_LONG[region.status]}${glyph ? `, ${change}` : ""}`}
                aria-pressed={isSelected}
                className={`absolute flex min-h-7 flex-col items-start overflow-hidden rounded-md border p-1.5 text-left transition-shadow motion-safe:animate-fade-in ${SURFACE[region.status]} ${
                  isSelected ? "ring-2 ring-ink ring-offset-1" : ""
                }`}
                style={{
                  left: pct(x, 1280),
                  top: pct(Math.min(y, mapHeight - 24), mapHeight),
                  width: pct(Math.min(width, 1280 - x), 1280),
                  height: pct(Math.min(height, mapHeight - y), mapHeight),
                }}
              >
                <span className="flex w-full items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
                  <span className={`font-mono text-[10px] font-bold tracking-widest ${TAG_TEXT[region.status]}`}>
                    {VERDICT_LABEL[region.status]}
                  </span>
                  <span className="truncate text-xs font-medium">{region.name}</span>
                  {glyph && (
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{glyph}</span>
                  )}
                </span>
                <Shapes region={region} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
