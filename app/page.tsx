import { Suspense } from "react";
import { RecentScans } from "@/components/RecentScans";
import { ScanForm } from "@/components/ScanForm";
import { VerdictLegend } from "@/components/VerdictLegend";

// Nonce-based CSP and the recent-scans query both need per-request rendering.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
        <h1 className="text-center text-4xl font-extrabold tracking-tight sm:text-5xl">
          See your page the way AI does.
        </h1>
        <ScanForm initialUrl={url ?? ""} />
        <VerdictLegend />
        <Suspense>
          <RecentScans />
        </Suspense>
      </main>
      <footer className="pb-6 text-center text-xs text-muted">
        <p>
          Specter compares the raw HTML AI crawlers fetch against the page a
          browser renders. Everything runs locally.
        </p>
      </footer>
    </div>
  );
}
