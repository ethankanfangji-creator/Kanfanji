import { NextResponse } from "next/server";
import { republishOwnerShareLink } from "@/lib/share-access/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

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
    const result = await republishOwnerShareLink(createAdminClient(), user.id, linkId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新公開內容失敗";
    const status =
      message === "LINK_NOT_FOUND"
        ? 404
        : message === "VIEWING_NOT_FOUND"
          ? 404
          : message === "REPORT_NOT_READY"
            ? 409
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}