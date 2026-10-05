import { NextResponse } from "next/server";
import { markNotificationsRead } from "@/lib/notifications";
import {
  assertAllowedKeys,
  optionalStringArray,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["ids", "all"]);
    if (body.all !== undefined && typeof body.all !== "boolean") {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "all");
    }
    const all = body.all === true;
    const ids = optionalStringArray(body, "ids", { maxItems: 100, maxLength: 64 });

    if (!all && (!ids || ids.length === 0)) {
      return NextResponse.json({ error: "INVALID_IDS" }, { status: 400 });
    }

    const result = await markNotificationsRead(supabase, user.id, { ids, all });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
