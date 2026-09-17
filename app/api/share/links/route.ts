import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  ensureOwnerShareLink,
  getOwnerShareLink,
  listOwnerShareLinks,
} from "@/lib/share-access/server";
import type { CreateShareLinkRequest } from "@/lib/share-access/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { MAX_SHARE_PASSWORD_LENGTH } from "@/lib/share-access/rate-limit";
import {
  assertAllowedKeys,
  optionalEnum,
  optionalString,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

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
    const history = await listOwnerShareLinks(admin, user.id, viewingId);
    return NextResponse.json({ link, history });
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
    const raw = await readJsonObject(req);
    assertAllowedKeys(raw, ["viewingId", "expiresAt", "password", "capability"]);
    const body: CreateShareLinkRequest = {
      viewingId: optionalString(raw, "viewingId", { min: 1, max: 128 }) ?? "",
      ...(Object.hasOwn(raw, "expiresAt")
        ? { expiresAt: optionalString(raw, "expiresAt", { max: 64, nullable: true }) }
        : {}),
      ...(Object.hasOwn(raw, "password")
        ? {
            password: optionalString(raw, "password", {
              trim: false,
              max: MAX_SHARE_PASSWORD_LENGTH,
              nullable: true,
            }),
          }
        : {}),
      ...(Object.hasOwn(raw, "capability")
        ? { capability: optionalEnum(raw, "capability", ["read"] as const) }
        : {}),
    };
    if (
      body.password != null &&
      body.password !== "" &&
      (body.password.length < 4 || body.password.length > MAX_SHARE_PASSWORD_LENGTH)
    ) {
      return NextResponse.json({ error: "密碼需為 4–256 碼" }, { status: 400 });
    }
    const options: { expiresAt?: string | null; password?: string | null } = {};
    if (Object.hasOwn(body, "expiresAt")) options.expiresAt = body.expiresAt ?? null;
    if (Object.hasOwn(body, "password")) options.password = body.password ?? null;
    const result = await ensureOwnerShareLink(
      createAdminClient(),
      user.id,
      body.viewingId.trim(),
      options,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "建立分享連結失敗";
    const status = message === "VIEWING_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
