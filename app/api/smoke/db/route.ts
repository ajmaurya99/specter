// Phase 0 smoke test: verifies the Prisma 7 client (driver adapter +
// generated client) works inside a route handler under Turbopack.
// Deleted in Phase 2.
import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const count = await prisma.scan.count();
  return Response.json({ ok: true, scans: count });
}
