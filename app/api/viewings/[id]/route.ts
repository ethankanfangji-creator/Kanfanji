import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { updateViewingWithRevision } from "@/lib/collaboration/server";

export const runtime = "nodejs";

export async function PATCH(
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

    const ifMatch = request.headers.get("if-match")?.replaceAll('"', "");
    const expectedRevision = Number(ifMatch);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return NextResponse.json(
        { error: "IF_MATCH_REVISION_REQUIRED" },
        { status: 428 },
      );
    }
    const patch = (await request.json()) as Record<string, unknown>;
    const result = await updateViewingWithRevision({
      viewingId: id,
      actor: user,
      expectedRevision,
      patch,
    });
    return NextResponse.json(result, {
      headers: { ETag: `"${result.revision}"` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    if (message === "REVISION_CONFLICT") {
      const latest = (error as Error & {
        latest?: Record<string, unknown> | null;
      }).latest;
      return NextResponse.json(
        {
          error: message,
          latestRevision: latest?.revision ?? null,
          latestUpdatedAt: latest?.updated_at ?? null,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "FORBIDDEN"
            ? 403
            : message === "INVALID_REVISION" ||
                message === "EMPTY_PATCH"
              ? 400
              : 500,
      },
    );
  }
}

