// Nonce-based CSP requires dynamic rendering — static HTML cannot carry a
// per-request nonce.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <h1 className="text-center text-4xl font-extrabold tracking-tight">
        See your page the way AI does.
      </h1>
      <div className="w-full max-w-xl rounded-card border border-hairline bg-surface p-6 shadow-soft">
        <p className="font-mono text-sm text-muted">
          Phase 0 placeholder — fonts and palette wired.
        </p>
      </div>
      <ul className="flex gap-6 text-sm text-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-visible" />
          Visible
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-partial" />
          Partially visible
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-invisible" />
          Invisible
        </li>
      </ul>
    </main>
  );
}
