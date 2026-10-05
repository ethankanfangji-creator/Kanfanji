import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { updateOwnerShareLink } from "@/lib/share-access/server";
import type { UpdateShareLinkRequest } from "@/lib/share-access/types";
import { createAdminClient } from "@/utils/supabase/admin";

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
    if (Object.hasOwn(body, "password")) {
      return NextResponse.json(
        { error: "PASSWORD_RETIRED", message: "分享密碼已退役，請改用停止分享。" },
        { status: 400 },
      );
    }
    const link = await updateOwnerShareLink(createAdminClient(), user.id, linkId, {
      ...(Object.hasOwn(body, "expiresAt") ? { expiresAt: body.expiresAt ?? null } : {}),
    });
    return NextResponse.json({ link });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    const status =
      message === "LINK_NOT_FOUND"
        ? 404
        : message === "LINK_CONFLICT"
          ? 409
          : message === "SHARE_EXPIRES_INVALID"
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
