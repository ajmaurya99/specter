const ITEMS = [
  { label: "Visible", dot: "bg-visible" },
  { label: "Partially visible", dot: "bg-partial" },
  { label: "Invisible", dot: "bg-invisible" },
] as const;

/** Teaches the color language before the first scan. */
export function VerdictLegend() {
  return (
    <ul className="flex items-center gap-6 text-sm text-muted">
      {ITEMS.map(({ label, dot }) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden className={`size-2 rounded-full ${dot}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}
