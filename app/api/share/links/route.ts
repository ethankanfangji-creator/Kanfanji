import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  ensureOwnerShareLink,
  getOwnerShareLink,
} from "@/lib/share-access/server";
import type { CreateShareLinkRequest } from "@/lib/share-access/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const viewingId = new URL(req.url).searchParams.get("viewingId")?.trim();
    if (!viewingId) {
      return NextResponse.json({ error: "缺少 viewingId" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { link, viewing } = await getOwnerShareLink(admin, user.id, viewingId);
    if (!viewing) {
      return NextResponse.json({ error: "找不到案件" }, { status: 404 });
    }
    // Lazy-ensure metadata when a legacy token exists.
    if (viewing.share_token && (!link || !link.token)) {
      const ensured = await ensureOwnerShareLink(admin, user.id, viewingId);
      return NextResponse.json({ link: ensured.link });
    }
    if (viewing.share_token && link && !link.passwordEnabled && link.status === "active") {
      return NextResponse.json({ link });
    }
    return NextResponse.json({ link });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取分享連結失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const body = (await req.json()) as CreateShareLinkRequest;
    if (!body.viewingId?.trim()) {
      return NextResponse.json({ error: "缺少 viewingId" }, { status: 400 });
    }
    if (body.password != null && body.password !== "" && body.password.length < 4) {
      return NextResponse.json({ error: "密碼至少 4 碼" }, { status: 400 });
    }
    const result = await ensureOwnerShareLink(createAdminClient(), user.id, body.viewingId.trim(), {
      expiresAt: body.expiresAt,
      password: body.password,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "建立分享連結失敗";
    const status = message === "VIEWING_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
