import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

function publicProperty(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const property = { ...(value as Record<string, unknown>) };
  delete property.shareAccess;
  return property;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    // RLS decides which rows are visible. Sensitive JSON is fetched with the
    // server-only client only for those IDs, then stripped before returning.
    const { data: rows, error } = await supabase
      .from("viewings")
      .select(
        "id, address, tags, market, questions, pros, risks, photo_urls, video_urls, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((row) => String(row.id));
    if (ids.length === 0) return NextResponse.json({ viewings: [] });

    const { data: propertyRows, error: propertyError } = await createAdminClient()
      .from("viewings")
      .select("id, property")
      .in("id", ids);
    if (propertyError) throw propertyError;
    const properties = new Map(
      (propertyRows ?? []).map((row) => [
        String(row.id),
        publicProperty(row.property),
      ]),
    );

    return NextResponse.json({
      viewings: (rows ?? []).map((row) => ({
        ...row,
        property: properties.get(String(row.id)) ?? {},
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "LOAD_FAILED" },
      { status: 500 },
    );
  }
}

