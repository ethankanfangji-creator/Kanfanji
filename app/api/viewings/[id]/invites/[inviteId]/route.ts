import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { revokeViewingInvite } from "@/lib/collaboration/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; inviteId: string }> },
) {
  try {
    const { id, inviteId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    await revokeViewingInvite({ viewingId: id, inviteId, actor: user });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "REVOKE_FAILED";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "FORBIDDEN"
            ? 403
            : message === "INVITE_NOT_FOUND"
              ? 404
              : 500,
      },
    );
  }
}

