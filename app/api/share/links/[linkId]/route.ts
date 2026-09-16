import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { updateOwnerShareLink } from "@/lib/share-access/server";
import type { UpdateShareLinkRequest } from "@/lib/share-access/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { MAX_SHARE_PASSWORD_LENGTH } from "@/lib/share-access/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ linkId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { linkId } = await ctx.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const body = (await req.json()) as UpdateShareLinkRequest;
    if (
      body.password !== undefined &&
      body.password !== null &&
      (body.password.length < 4 || body.password.length > MAX_SHARE_PASSWORD_LENGTH)
    ) {
      return NextResponse.json({ error: "密碼需為 4–256 碼；使用 null 移除" }, { status: 400 });
    }
    const link = await updateOwnerShareLink(createAdminClient(), user.id, linkId, body);
    return NextResponse.json({ link });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    const status =
      message === "LINK_NOT_FOUND" ? 404 : message === "LINK_CONFLICT" ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
