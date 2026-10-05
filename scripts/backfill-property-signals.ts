/**
 * Recompute property_signals for every property that has linked viewings.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-property-signals.ts
 *   npx tsx --env-file=.env.production scripts/backfill-property-signals.ts
 */
import { createClient } from "@supabase/supabase-js";
import { refreshPropertySignals } from "../lib/properties/signals";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await admin
    .from("viewings")
    .select("property_id")
    .not("property_id", "is", null);
  if (error) throw error;

  const propertyIds = [
    ...new Set(
      (rows ?? [])
        .map((row) => (typeof row.property_id === "string" ? row.property_id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let ok = 0;
  let failed = 0;
  for (const propertyId of propertyIds) {
    const snap = await refreshPropertySignals(admin, propertyId);
    if (snap) ok += 1;
    else failed += 1;
  }

  const { count } = await admin
    .from("property_signals")
    .select("property_id", { count: "exact", head: true });

  console.log(
    JSON.stringify(
      {
        propertiesTouched: propertyIds.length,
        refreshed: ok,
        failed,
        propertySignalsRows: count ?? 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
