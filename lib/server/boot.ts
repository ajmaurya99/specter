import { closeBrowser } from "./browser";
import { prisma } from "./prisma";
import { registry } from "./registry";

/**
 * Runs once at server startup via instrumentation.ts register(). The
 * in-memory queue does not survive a restart, so any scan still marked
 * in-flight is an orphan — sweep it to a retryable error state.
 */
export async function onServerBoot(): Promise<void> {
  const reg = registry();
  if (reg.bootDone) return;
  reg.bootDone = true;

  try {
    const swept = await prisma.scan.updateMany({
      where: { status: { in: ["queued", "fetching", "rendering", "diffing", "classifying"] } },
      data: {
        status: "error",
        errorType: "render_failed",
        errorMessage: "The scan was interrupted by a server restart. Run it again.",
        finishedAt: new Date(),
      },
    });
    if (swept.count > 0) {
      console.log(`[specter] swept ${swept.count} interrupted scan(s) at boot`);
    }
  } catch (err) {
    // Don't block startup on a sweep failure (e.g. db not migrated yet).
    console.error("[specter] boot sweep failed:", err);
  }

  const shutdown = async () => {
    await closeBrowser();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
