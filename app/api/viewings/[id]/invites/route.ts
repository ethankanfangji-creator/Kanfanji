import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createViewingInvite } from "@/lib/collaboration/server";
import type { MemberRole } from "@/lib/collaboration";

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
    const body = (await request.json()) as {
      email?: string;
      role?: MemberRole;
      expiresAt?: string | null;
    };
    const result = await createViewingInvite({
      viewingId: id,
      actor: user,
      email: body.email ?? "",
      role: body.role ?? "viewer",
      expiresAt: body.expiresAt,
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

