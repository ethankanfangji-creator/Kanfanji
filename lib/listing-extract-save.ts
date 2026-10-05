import type { SupabaseClient } from "@supabase/supabase-js";
import { findOrCreateProperty } from "@/lib/properties";
import { resolvePropertyIdentity } from "@/lib/property-identity";
import { schedulePropertySignalsRefresh } from "@/lib/properties/signals";
import type { ListingExtract } from "./listing-fields";

export class ListingSaveError extends Error {
  constructor(readonly code: "missing_property" | "save_failed") {
    super(code);
    this.name = "ListingSaveError";
  }
}

type ViewingRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  address: string;
  property: Record<string, unknown> | null;
};

function coordsOf(property: Record<string, unknown> | null): { lat: number; lng: number } | null {
  const lat = property?.lat;
  const lng = property?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function saveListingOnProperty(
  admin: SupabaseClient,
  viewing: ViewingRow,
  listing: ListingExtract,
): Promise<string> {
  let propertyId = viewing.property_id;
  if (!propertyId) {
    const coords = coordsOf(viewing.property);
    const unitLabel =
      typeof viewing.property?.unitLabel === "string"
        ? viewing.property.unitLabel
        : null;
    const identity = resolvePropertyIdentity({
      address: viewing.address,
      unitLabel,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
    if (identity.streetNormalized.length < 3) {
      throw new ListingSaveError("missing_property");
    }
    propertyId = await findOrCreateProperty({
      normalizedAddress: identity.streetNormalized,
      lat: identity.lat,
      lng: identity.lng,
      unitKey: identity.unitKey,
      unitLabel: identity.unitLabel,
      yearBuilt: listing.year,
      countryCode: identity.countryCode,
    });
  }

  const propertyPatch: Record<string, unknown> = {
    listing,
    updated_at: new Date().toISOString(),
  };
  if (listing.year != null) propertyPatch.year_built = listing.year;
  const { error: propertyError } = await admin
    .from("properties")
    .update(propertyPatch)
    .eq("id", propertyId);
  if (propertyError) throw new ListingSaveError("save_failed");

  const property =
    viewing.property && typeof viewing.property === "object" ? { ...viewing.property } : {};
  property.listing = listing;
  const viewingPatch: Record<string, unknown> = {
    property,
    updated_at: new Date().toISOString(),
  };
  if (!viewing.property_id) viewingPatch.property_id = propertyId;
  const { error: viewingError } = await admin
    .from("viewings")
    .update(viewingPatch)
    .eq("id", viewing.id)
    .eq("user_id", viewing.user_id);
  if (viewingError) throw new ListingSaveError("save_failed");
  if (!viewing.property_id) schedulePropertySignalsRefresh(admin, propertyId);
  return propertyId;
}
