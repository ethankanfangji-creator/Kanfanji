import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getViewingRole } from "@/lib/collaboration/server";
import {
  projectViewingForRole,
  VIEWING_PROJECTION_SELECT,
} from "@/lib/collaboration/projection";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from("viewings")
      .select("id")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((row) => String(row.id));
    if (ids.length === 0) return NextResponse.json({ viewings: [] });

    const { data: fullRows, error: fullRowsError } = await createAdminClient()
      .from("viewings")
      .select(VIEWING_PROJECTION_SELECT)
      .in("id", ids);
    if (fullRowsError) throw fullRowsError;
    const safeFullRows = (fullRows ?? []) as unknown as Record<string, unknown>[];
    const byId = new Map(safeFullRows.map((row) => [String(row.id), row]));
    const roles = await Promise.all(ids.map((id) => getViewingRole(id, user.id)));

    return NextResponse.json({
      viewings: ids.flatMap((id, index) => {
        const row = byId.get(id);
        const role = roles[index];
        return row && role
          ? [projectViewingForRole(row, role)]
          : [];
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "LOAD_FAILED" },
      { status: 500 },
    );
  }
}

