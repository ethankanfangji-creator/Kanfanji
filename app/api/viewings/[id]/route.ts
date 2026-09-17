import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { updateViewingWithRevision } from "@/lib/collaboration/server";
import {
  assertAllowedKeys,
  optionalArray,
  optionalEnum,
  optionalObject,
  optionalString,
  optionalStringArray,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

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
    const body = await readJsonObject(request);
    assertAllowedKeys(body, [
      "address",
      "tags",
      "market",
      "questions",
      "notes",
      "pros",
      "risks",
      "property",
    ]);
    const patch = {
      ...(body.address !== undefined
        ? { address: optionalString(body, "address", { min: 1, max: 500 }) }
        : {}),
      ...(body.tags !== undefined
        ? { tags: optionalStringArray(body, "tags", { maxItems: 50, maxLength: 100 }) }
        : {}),
      ...(body.market !== undefined
        ? { market: optionalEnum(body, "market", ["CA", "TH", "OTHER"] as const) }
        : {}),
      ...(body.questions !== undefined
        ? { questions: optionalArray(body, "questions", { maxItems: 500 }) }
        : {}),
      ...(body.notes !== undefined
        ? { notes: optionalArray(body, "notes", { maxItems: 1000 }) }
        : {}),
      ...(body.pros !== undefined
        ? { pros: optionalStringArray(body, "pros", { maxItems: 200, maxLength: 2000 }) }
        : {}),
      ...(body.risks !== undefined
        ? { risks: optionalStringArray(body, "risks", { maxItems: 200, maxLength: 2000 }) }
        : {}),
      ...(body.property !== undefined
        ? { property: optionalObject(body, "property") }
        : {}),
    };
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
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
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

