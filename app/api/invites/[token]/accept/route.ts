import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { acceptViewingInvite } from "@/lib/collaboration/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const result = await acceptViewingInvite(token, user);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ACCEPT_FAILED";
    const status =
      message === "INVITE_NOT_FOUND"
        ? 404
        : message === "INVITE_EXPIRED" ||
            message === "INVITE_UNAVAILABLE"
          ? 410
          : message === "INVITE_EMAIL_MISMATCH"
            ? 403
            : message === "EMAIL_REQUIRED"
              ? 400
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

