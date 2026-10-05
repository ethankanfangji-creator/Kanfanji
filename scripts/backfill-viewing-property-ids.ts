/**
 * Link existing cloud viewings to the unit-aware properties registry.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-viewing-property-ids.ts
 *   npx tsx --env-file=.env.local scripts/backfill-viewing-property-ids.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { resolvePropertyIdentity } from "../lib/property-identity";
import { detectMarketRegion } from "../lib/property-intel/types";

const dryRun = process.argv.includes("--dry-run");

function readChatFields(chatState: unknown) {
  if (!chatState || typeof chatState !== "object" || Array.isArray(chatState)) {
    return {
      lat: null as number | null,
      lng: null as number | null,
      unitLabel: null as string | null,
      unitKey: null as string | null,
      placeId: null as string | null,
    };
  }
  const state = chatState as Record<string, unknown>;
  const pin =
    state.sitePin && typeof state.sitePin === "object" && !Array.isArray(state.sitePin)
      ? (state.sitePin as Record<string, unknown>)
      : null;
  const property =
    state.property && typeof state.property === "object" && !Array.isArray(state.property)
      ? (state.property as Record<string, unknown>)
      : null;
  const lat =
    typeof pin?.lat === "number"
      ? pin.lat
      : typeof property?.lat === "number"
        ? property.lat
        : null;
  const lng =
    typeof pin?.lng === "number"
      ? pin.lng
      : typeof property?.lng === "number"
        ? property.lng
        : null;
  return {
    lat,
    lng,
    unitLabel: typeof state.unitLabel === "string" ? state.unitLabel : null,
    unitKey: typeof state.unitKey === "string" ? state.unitKey : null,
    placeId: typeof state.placeId === "string" ? state.placeId : null,
  };
}

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
    .select("id, address, property_id, chat_state, property, market")
    .order("created_at", { ascending: true });
  if (error) throw error;

  let linked = 0;
  let skipped = 0;
  let failed = 0;
  let already = 0;

  for (const row of rows ?? []) {
    if (row.property_id) {
      already += 1;
      continue;
    }
    const address = String(row.address ?? "").trim();
    if (address.length < 3) {
      skipped += 1;
      continue;
    }
    const chat = readChatFields(row.chat_state);
    const property =
      row.property && typeof row.property === "object"
        ? (row.property as Record<string, unknown>)
        : null;
    const unitLabel =
      chat.unitLabel ||
      (typeof property?.unitLabel === "string" ? property.unitLabel : null);
    const lat =
      chat.lat ??
      (typeof property?.lat === "number" ? property.lat : null);
    const lng =
      chat.lng ??
      (typeof property?.lng === "number" ? property.lng : null);
    const market =
      typeof row.market === "string" ? row.market : detectMarketRegion(address);
    const identity = resolvePropertyIdentity({
      address,
      countryCode: market,
      unitLabel,
      unitKey: chat.unitKey,
      lat,
      lng,
      placeId: chat.placeId,
    });
    if (identity.streetNormalized.length < 3) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log("[dry-run]", row.id, identity.streetNormalized, identity.unitKey);
      linked += 1;
      continue;
    }

    const { data: propertyId, error: rpcError } = await admin.rpc(
      "find_or_create_property",
      {
        p_normalized_address: identity.streetNormalized,
        p_lat: identity.lat,
        p_lng: identity.lng,
        p_country_code: identity.countryCode,
        p_unit_key: identity.unitKey,
        p_unit_label: identity.unitLabel,
        p_place_id: identity.placeId,
      },
    );
    if (rpcError || typeof propertyId !== "string") {
      console.error("link failed", row.id, rpcError?.message);
      failed += 1;
      continue;
    }
    const { error: updateError } = await admin
      .from("viewings")
      .update({ property_id: propertyId })
      .eq("id", row.id);
    if (updateError) {
      console.error("update failed", row.id, updateError.message);
      failed += 1;
      continue;
    }
    linked += 1;
  }

  const { count: total } = await admin
    .from("viewings")
    .select("id", { count: "exact", head: true });
  const { count: withProperty } = await admin
    .from("viewings")
    .select("id", { count: "exact", head: true })
    .not("property_id", "is", null);

  console.log(
    JSON.stringify(
      {
        dryRun,
        already,
        linked,
        skipped,
        failed,
        viewingsTotal: total ?? 0,
        withPropertyId: withProperty ?? 0,
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
