import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "login_required" }, { status: 401, headers });
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("compare_shares")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return NextResponse.json({ code: "not_found" }, { status: 404, headers });
  const { error } = await admin
    .from("compare_shares")
    .update({ status: "revoked", snapshot: null, revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ code: "not_found" }, { status: 404, headers });
  return NextResponse.json({ ok: true }, { headers });
}
