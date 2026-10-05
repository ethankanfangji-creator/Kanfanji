import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  ensureOwnerShareLink,
  getOwnerShareLink,
  listOwnerShareLinks,
  listOwnerShareLinksAcrossViewings,
} from "@/lib/share-access/server";
import type { CreateShareLinkRequest } from "@/lib/share-access/types";
import { createAdminClient } from "@/utils/supabase/admin";
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
    const url = new URL(req.url);
    const viewingId = url.searchParams.get("viewingId")?.trim();
    const admin = createAdminClient();

    if (!viewingId) {
      const statusParam = url.searchParams.get("status")?.trim();
      const status =
        statusParam === "closed" || statusParam === "all" || statusParam === "open"
          ? statusParam
          : "open";
      const q = url.searchParams.get("q")?.trim() || undefined;
      const limitRaw = Number(url.searchParams.get("limit") ?? 100);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
      const items = await listOwnerShareLinksAcrossViewings(admin, user.id, {
        status,
        q,
        limit,
      });
      return NextResponse.json(
        { items },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { link, viewing, urlPath, needsRegenerate } = await getOwnerShareLink(admin, user.id, viewingId);
    if (!viewing) {
      return NextResponse.json(
        { error: "找不到案件" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const history = await listOwnerShareLinks(admin, user.id, viewingId);
    return NextResponse.json(
      { link, history, url: urlPath || null, needsRegenerate },
      { headers: { "Cache-Control": "no-store" } },
    );
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
    assertAllowedKeys(raw, ["viewingId", "expiresAt", "capability"]);
    const body: CreateShareLinkRequest = {
      viewingId: optionalString(raw, "viewingId", { min: 1, max: 128 }) ?? "",
      ...(Object.hasOwn(raw, "expiresAt")
        ? { expiresAt: optionalString(raw, "expiresAt", { max: 64, nullable: true }) }
        : {}),
      ...(Object.hasOwn(raw, "capability")
        ? { capability: optionalEnum(raw, "capability", ["read"] as const) }
        : {}),
    };
    const options: { expiresAt?: string | null } = {};
    if (Object.hasOwn(body, "expiresAt")) options.expiresAt = body.expiresAt ?? null;
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
    const status =
      message === "VIEWING_NOT_FOUND"
        ? 404
        : message === "SHARE_UNAVAILABLE"
          ? 503
          : message === "SHARE_RATE_LIMITED"
            ? 429
        : message === "REPORT_NOT_READY"
          ? 409
          : message === "SHARE_EXPIRES_INVALID"
            ? 400
            : 500;
    return NextResponse.json(
      {
        error: message,
        ...(status === 429 ? { code: "rate_limited" } : {}),
        ...(status === 404 ? { code: "VIEWING_NOT_FOUND" } : {}),
      },
      { status },
    );
  }
}
