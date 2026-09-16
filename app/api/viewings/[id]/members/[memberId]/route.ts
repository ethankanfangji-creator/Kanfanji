import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  revokeViewingMember,
  updateViewingMember,
} from "@/lib/collaboration/server";
import type { MemberRole } from "@/lib/collaboration";

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
    const body = (await request.json()) as { role?: MemberRole };
    if (!body.role) {
      return NextResponse.json({ error: "INVALID_ROLE" }, { status: 400 });
    }
    const member = await updateViewingMember({
      viewingId: id,
      memberId,
      actor: user,
      role: body.role,
    });
    return NextResponse.json({ member });
  } catch (error) {
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

