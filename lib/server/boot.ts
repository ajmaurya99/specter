// Runs once at server startup via instrumentation.ts register().
// Phase 2 adds: sweeping stale in-flight scans to an error state (in-memory
// queue does not survive a restart) and closing the shared Playwright
// browser on SIGTERM/SIGINT.
export async function onServerBoot(): Promise<void> {}
