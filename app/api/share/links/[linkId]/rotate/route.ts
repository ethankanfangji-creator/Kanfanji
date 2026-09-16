import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rotateOwnerShareLink } from "@/lib/share-access/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ linkId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { linkId } = await ctx.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const result = await rotateOwnerShareLink(createAdminClient(), user.id, linkId);
    return NextResponse.json({
      ...result,
      previousTokenInvalidated: true as const,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重新產生連結失敗";
    const status = message === "LINK_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
