import { NextResponse, type NextRequest } from "next/server";
import { readScreenshot } from "@/lib/server/screenshots";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bytes = await readScreenshot(id);
  if (!bytes) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // Immutable: a given scan id always maps to the same capture.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
