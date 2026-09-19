import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCollaborationOverview } from "@/lib/collaboration/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const overview = await getCollaborationOverview(id, user);
    return NextResponse.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOAD_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message === "FORBIDDEN" ? 403 : 500 },
    );
  }
}

