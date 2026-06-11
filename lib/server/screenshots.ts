import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Page screenshots are stored as files (not in the SQLite blob — they're far
 * larger than the result JSON). Keyed by scan id; ids are cuids so the
 * sanitized filename can never traverse outside the directory.
 */
const DIR = path.join(process.cwd(), ".specter-screenshots");

function fileFor(scanId: string): string {
  const safe = scanId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(DIR, `${safe}.jpg`);
}

export async function saveScreenshot(scanId: string, bytes: Buffer): Promise<boolean> {
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(fileFor(scanId), bytes);
    return true;
  } catch (err) {
    console.error(`[specter] failed to save screenshot for ${scanId}:`, err);
    return false;
  }
}

export async function readScreenshot(scanId: string): Promise<Buffer | null> {
  try {
    return await readFile(fileFor(scanId));
  } catch {
    return null;
  }
}
