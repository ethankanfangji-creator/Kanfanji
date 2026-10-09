import { NextResponse } from "next/server";
import { isShareTokenFormat } from "@/lib/share-access";
import { getShareSaveState, saveShareForUser } from "@/lib/share-access/saves";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isShareTokenFormat(token)) {
    return NextResponse.json({ error: "missing" }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = createAdminClient();
    const state = await getShareSaveState(admin, token, user?.id ?? null);
    if (!state.ok) {
      return NextResponse.json({ error: "missing" }, { status: 404 });
    }
    return NextResponse.json(
      {
        signedIn: state.signedIn,
        isOwner: state.isOwner,
        saved: state.saved,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "save_status_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isShareTokenFormat(token)) {
    return NextResponse.json({ error: "missing" }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "login_required" }, { status: 401 });
    }
    const admin = createAdminClient();
    const result = await saveShareForUser(admin, token, user.id);
    if (!result.ok) {
      if (result.reason === "owner") {
        return NextResponse.json({ error: "owner" }, { status: 403 });
      }
      return NextResponse.json({ error: "missing" }, { status: 404 });
    }
    return NextResponse.json(
      { saved: true, already: result.already },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "save_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
