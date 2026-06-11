import { NextResponse } from "next/server";
import { recentScans } from "@/lib/server/recent";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: await recentScans() });
}
