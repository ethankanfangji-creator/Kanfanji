import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createViewingInvite } from "@/lib/collaboration/server";
import type { MemberRole } from "@/lib/collaboration";
import {
  assertAllowedKeys,
  optionalEnum,
  optionalString,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["email", "role", "expiresAt"]);
    const email = optionalString(body, "email", { min: 3, max: 320 }) ?? "";
    const role =
      optionalEnum(body, "role", ["editor", "commenter", "viewer"] as const) ??
      ("viewer" as MemberRole);
    const expiresAt = optionalString(body, "expiresAt", {
      max: 64,
      nullable: true,
    });
    const result = await createViewingInvite({
      viewingId: id,
      actor: user,
      email,
      role,
      expiresAt,
    });
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    return NextResponse.json(
      {
        invite: result.invite,
        inviteUrl: `${siteUrl}/invite/${result.token}`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "INVITE_FAILED";
    const status =
      message === "FORBIDDEN"
        ? 403
        : message.startsWith("INVALID_")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

