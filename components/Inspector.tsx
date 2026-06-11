"use client";

import { useEffect, useRef } from "react";
import type {
  Comparison,
  RegionChangeKind,
  RegionResult,
} from "@/lib/engine/types";
import {
  HOW_TO_FIX,
  ISSUE_LABEL,
  VERDICT_LABEL,
  VERDICT_LONG,
  WHY_IT_MATTERS,
} from "./labels";
import { PromptBox } from "./PromptBox";
import { ScoreCountUp } from "./ScoreCountUp";
import { StackedBar } from "./StackedBar";

const CHIP: Record<RegionResult["status"], string> = {
  ok: "bg-visible-tint text-visible-text border-visible/50",
  warn: "bg-partial-tint text-partial-text border-partial/50",
  bad: "bg-invisible-tint text-invisible-text border-invisible/50",
};

const CHANGE_GLYPH: Partial<Record<RegionChangeKind, string>> = {
  improved: "↑ improved",
  regressed: "↓ regressed",
  new: "+ new",
};

export function Inspector({
  score,
  regions,
  comparison,
  selected,
  onSelect,
  onBack,
}: {
  score: number;
  regions: RegionResult[];
  comparison: Comparison | null;
  selected: string | null;
  onSelect: (selector: string, trigger: HTMLElement) => void;
  onBack: () => void;
}) {
  const region = selected ? regions.find((r) => r.selector === selected) : undefined;
  const changeBySelector = new Map(
    (comparison?.regions ?? []).map((c) => [c.selector, c.change]),
  );

  return (
    <aside
      aria-label="Inspector"
      className="rounded-card border border-hairline bg-surface shadow-soft"
    >
      <div aria-live="polite" className="p-5">
        {region ? (
          <RegionDetail region={region} onBack={onBack} />
        ) : (
          <RegionListView
            score={score}
            regions={regions}
            comparison={comparison}
            changeBySelector={changeBySelector}
            onSelect={onSelect}
          />
        )}
      </div>
    </aside>
  );
}

function RegionListView({
  score,
  regions,
  comparison,
  changeBySelector,
  onSelect,
}: {
  score: number;
  regions: RegionResult[];
  comparison: Comparison | null;
  changeBySelector: Map<string, RegionChangeKind>;
  onSelect: (selector: string, trigger: HTMLElement) => void;
}) {
  const counts = {
    ok: regions.filter((r) => r.status === "ok").length,
    warn: regions.filter((r) => r.status === "warn").length,
    bad: regions.filter((r) => r.status === "bad").length,
  };
  const removed = (comparison?.regions ?? []).filter((c) => c.change === "removed");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Visibility score
        </h2>
        <ScoreCountUp score={score} />
      </div>
      <StackedBar regions={regions} />
      <p className="font-mono text-xs text-muted">
        {counts.ok} visible · {counts.warn} partial · {counts.bad} invisible
      </p>

      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {regions.map((region) => {
          const change = changeBySelector.get(region.selector);
          const glyph = change ? CHANGE_GLYPH[change] : undefined;
          return (
            <li key={region.selector}>
              <button
                type="button"
                data-region-button={region.selector}
                onClick={(e) => onSelect(region.selector, e.currentTarget)}
                className="flex w-full items-baseline gap-2 px-1 py-2.5 text-left hover:bg-bg"
              >
                <span
                  className={`w-[4.6rem] shrink-0 font-mono text-[10px] font-bold tracking-widest ${
                    region.status === "ok"
                      ? "text-visible-text"
                      : region.status === "warn"
                        ? "text-partial-text"
                        : "text-invisible-text"
                  }`}
                >
                  {VERDICT_LABEL[region.status]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{region.name}</span>
                {glyph && <span className="shrink-0 font-mono text-[10px] text-muted">{glyph}</span>}
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {Math.round(region.weight * 100)}%
                </span>
              </button>
            </li>
          );
        })}
        {removed.map((r) => (
          <li
            key={`removed-${r.selector}`}
            className="flex items-baseline gap-2 px-1 py-2.5 text-muted"
          >
            <span className="w-[4.6rem] shrink-0 font-mono text-[10px] font-bold tracking-widest">
              GONE
            </span>
            <span className="min-w-0 flex-1 truncate text-sm line-through">{r.name}</span>
            <span className="shrink-0 font-mono text-[10px]">− removed</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RegionDetail({ region, onBack }: { region: RegionResult; onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Spec choreography: focus moves to the detail when a region is selected.
  useEffect(() => {
    headingRef.current?.focus();
  }, [region.selector]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 font-mono text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          ← All regions
        </button>
        <span
          className={`mb-2 block w-fit rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-widest ${CHIP[region.status]}`}
        >
          {VERDICT_LABEL[region.status]} — {ISSUE_LABEL[region.issueType].toUpperCase()}
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold tracking-tight">
          {region.name}
        </h2>
        <p className="mt-1 font-mono text-xs text-muted">{region.selector}</p>
      </div>

      <section aria-labelledby="found-heading">
        <h3 id="found-heading" className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          What the crawler found
        </h3>
        <p className="rounded-field border border-hairline bg-bg p-3 font-mono text-xs leading-relaxed">
          {region.evidence}
        </p>
      </section>

      <section aria-labelledby="why-heading">
        <h3 id="why-heading" className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Why it matters
        </h3>
        <p className="text-sm leading-relaxed">{WHY_IT_MATTERS[region.issueType]}</p>
      </section>

      <section aria-labelledby="fix-heading">
        <h3 id="fix-heading" className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          How to fix it
        </h3>
        <p className="text-sm leading-relaxed">{HOW_TO_FIX[region.issueType]}</p>
      </section>

      {region.fixPrompt && <PromptBox prompt={region.fixPrompt} />}

      <p className="sr-only">
        Region status: {VERDICT_LONG[region.status]}. Press the All regions button to return.
      </p>
    </div>
  );
}
