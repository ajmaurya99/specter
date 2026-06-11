"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Comparison, RegionChangeKind, ScanResult } from "@/lib/engine/types";
import { BlockedPanel } from "./BlockedPanel";
import { CachedNotice } from "./CachedNotice";
import { CompareBanner } from "./CompareBanner";
import { CrawlerViewTab } from "./CrawlerViewTab";
import { ExportButtons } from "./ExportButtons";
import { Inspector } from "./Inspector";
import { ageMinutesSince, hostOf, timeAgo } from "./labels";
import { PageChecksPanel } from "./PageChecksPanel";
import { RegionMap } from "./RegionMap";

type Tab = "map" | "crawler";

export function ResultsExplorer({
  scanId,
  result,
  comparison,
  cached,
}: {
  scanId: string;
  result: ScanResult;
  comparison: Comparison | null;
  cached: boolean;
}) {
  const [tab, setTab] = useState<Tab>("map");
  const [selected, setSelected] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const select = (selector: string, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setSelected(selector);
  };
  const back = () => {
    setSelected(null);
    // Spec choreography: focus returns to the originating region on back.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const changeBySelector = new Map<string, RegionChangeKind>(
    (comparison?.regions ?? []).map((c) => [c.selector, c.change]),
  );
  const ageMinutes = ageMinutesSince(result.scannedAt);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {hostOf(result.url)}
          </h1>
          <p className="truncate font-mono text-xs text-muted" title={result.url}>
            {result.url} · scanned {timeAgo(result.scannedAt)}
          </p>
        </div>
        <ExportButtons scanId={scanId} />
        <Link
          href="/"
          className="rounded-field bg-ink px-3.5 py-2 text-xs font-semibold text-surface hover:opacity-85"
        >
          New scan
        </Link>
      </header>

      <div className="flex flex-col gap-4">
        {cached && <CachedNotice url={result.url} ageMinutes={ageMinutes} />}
        {result.blocked && <BlockedPanel blocked={result.blocked} />}
        {comparison && <CompareBanner comparison={comparison} />}

        <div
          className={`grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] ${
            result.blocked ? "opacity-80" : ""
          }`}
        >
          <section aria-label="Page map" className="min-w-0">
            <div role="tablist" aria-label="Page view" className="mb-2 flex gap-1">
              {(
                [
                  ["map", "Region map"],
                  ["crawler", "Crawler view"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={tab === key}
                  aria-controls={`panel-${key}`}
                  onClick={() => setTab(key)}
                  className={`rounded-field px-3.5 py-1.5 text-sm font-semibold ${
                    tab === key
                      ? "bg-ink text-surface"
                      : "border border-hairline bg-surface hover:bg-bg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div id="panel-map" role="tabpanel" aria-labelledby="tab-map" hidden={tab !== "map"}>
              <RegionMap
                regions={result.regions}
                pageHeight={result.pageHeight}
                url={result.finalUrl}
                selected={selected}
                changeBySelector={changeBySelector}
                onSelect={select}
              />
            </div>
            <div
              id="panel-crawler"
              role="tabpanel"
              aria-labelledby="tab-crawler"
              hidden={tab !== "crawler"}
            >
              <CrawlerViewTab rawText={result.rawText} />
            </div>
          </section>

          <Inspector
            score={result.score}
            regions={result.regions}
            comparison={comparison}
            selected={selected}
            onSelect={select}
            onBack={back}
          />
        </div>

        <PageChecksPanel checks={result.pageChecks} />
        <p className="px-1 text-xs leading-relaxed text-muted">
          Verdicts reflect what most AI crawlers retrieve: the raw HTML response,
          without executing JavaScript. &ldquo;Invisible&rdquo; means invisible to most
          crawlers, most of the time — not all; some AI products read from
          rendering search indexes.
        </p>
      </div>
    </div>
  );
}
