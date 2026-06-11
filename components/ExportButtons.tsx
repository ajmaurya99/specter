/** Plain anchors — the routes set Content-Disposition; zero client JS. */
export function ExportButtons({ scanId }: { scanId: string }) {
  const base = `/api/scan/${scanId}`;
  const cls =
    "rounded-field border border-hairline bg-surface px-3.5 py-2 text-xs font-semibold hover:bg-bg";
  return (
    <div className="flex gap-2">
      <a href={`${base}/report`} className={cls} download>
        Export report
      </a>
      <a href={`${base}/fix-plan`} className={cls} download>
        Download fix plan
      </a>
    </div>
  );
}
