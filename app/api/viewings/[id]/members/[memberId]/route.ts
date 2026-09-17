import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  revokeViewingMember,
  updateViewingMember,
} from "@/lib/collaboration/server";
import {
  assertAllowedKeys,
  optionalEnum,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string; memberId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, memberId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["role"]);
    const role = optionalEnum(body, "role", ["editor", "commenter", "viewer"] as const);
    if (!role) {
      return NextResponse.json({ error: "INVALID_ROLE" }, { status: 400 });
    }
    const member = await updateViewingMember({
      viewingId: id,
      memberId,
      actor: user,
      role,
    });
    return NextResponse.json({ member });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "FORBIDDEN"
            ? 403
            : message === "MEMBER_NOT_FOUND"
              ? 404
              : message === "INVALID_ROLE"
                ? 400
                : 500,
      },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, memberId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    await revokeViewingMember({ viewingId: id, memberId, actor: user });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "REVOKE_FAILED";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "FORBIDDEN"
            ? 403
            : message === "MEMBER_NOT_FOUND"
              ? 404
              : 500,
      },
    );
  }
}

