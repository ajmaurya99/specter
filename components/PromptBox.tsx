import { CopyButton } from "./CopyButton";

/** The copy-ready prompt for an AI coding assistant. */
export function PromptBox({ prompt }: { prompt: string }) {
  return (
    <div className="overflow-hidden rounded-card border border-hairline">
      <div className="flex items-center justify-between gap-2 border-b border-hairline bg-bg px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Fix prompt — paste into your AI assistant
        </span>
        <CopyButton text={prompt} />
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap bg-surface p-3 font-mono text-xs leading-relaxed">
        {prompt}
      </pre>
    </div>
  );
}
