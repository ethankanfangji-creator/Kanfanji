import { NextResponse } from "next/server";
import { listNotificationsForUser } from "@/lib/notifications";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 30);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 30;
    const result = await listNotificationsForUser(supabase, user.id, { limit });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOAD_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
