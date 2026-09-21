import type { AddressMatchResult, MatchLevel, PropertyFactCard } from "./types";

function found<T>(status: string, value: T | null): T | null {
  return status === "found" ? value : null;
}

/**
 * Address match stage: derive the best identity we have after adapters run.
 * Does not invent parcel/listing IDs — only promotes values already found.
 */
export function buildAddressMatch(card: PropertyFactCard): AddressMatchResult {
  const placeId = found(card.identity.placeId.status, card.identity.placeId.value);
  const parcelId =
    found(card.parcel.parcelId.status, card.parcel.parcelId.value) ||
    found(card.parcel.pid.status, card.parcel.pid.value);
  const buildingId = found(card.building.buildingType.status, card.building.buildingType.value)
    ? found(card.parcel.pid.status, card.parcel.pid.value)
    : null;
  const unitId =
    found(card.identity.unitHint.status, card.identity.unitHint.value) ||
    found(card.identity.doorplate.status, card.identity.doorplate.value);
  const listingId = found(card.identity.listingId.status, card.identity.listingId.value);

  const notes: string[] = [];
  let level: MatchLevel = "inferred";

  if (unitId && (parcelId || placeId)) {
    level = "exact_unit";
    notes.push("Unit/doorplate present with parcel or place identity.");
  } else if (parcelId) {
    level = "exact_parcel";
    notes.push("Parcel/PID matched from official or licensed data.");
  } else if (placeId || found(card.identity.streetName.status, card.identity.streetName.value)) {
    level = "street";
    notes.push("Street-level geocode match; parcel not confirmed.");
  } else if (found(card.identity.city.status, card.identity.city.value)) {
    level = "neighborhood";
    notes.push("City/neighborhood only; finer match unavailable.");
  } else {
    notes.push("Insufficient identity to match parcel, building, or listing.");
  }

  if (!parcelId) notes.push("parcel_id:not_found");
  if (!listingId) notes.push("listing_id:not_found");
  if (!unitId) notes.push("unit_id:not_found");
  if (!placeId) notes.push("place_id:not_found");

  return {
    level,
    placeId,
    parcelId,
    buildingId: buildingId || parcelId,
    unitId,
    listingId,
    notes,
  };
}
