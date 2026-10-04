import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Legacy wizard chat coach — removed. Notes session + /ask are the AI surfaces. */
export async function POST() {
  return NextResponse.json(
    { error: "gone", code: "chat_removed", message: "On-site chat was removed. Use notes + report, or /ask." },
    { status: 410 },
  );
}
