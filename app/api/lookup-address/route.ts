import { NextResponse } from "next/server";
import { classifyLookupBody } from "@/lib/address-lookup";
import { createServerAddressService } from "@/lib/services/address/server-adapter";
import {
  assertAllowedKeys,
  optionalString,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export const runtime = "nodejs";

/**
 * Address lookup.
 *
 * - Selected suggestion: send `placeId` (Google) or `osmId` (Photon). Optional
 *   `lat`/`lng` may ride along for OSM reverse; the id is the place, not a new
 *   text search.
 * - Free text the user typed but did not pick: send `address` and `freeText: true`.
 *   An address string alone is rejected.
 * - Photo / device GPS: send both `lat` and `lng`.
 *
 * `GOOGLE_MAPS_API_KEY` stays on the server. Clients must not receive it.
 */

function optionalCoordinate(
  body: Record<string, unknown>,
  field: "lat" | "lng",
  min: number,
  max: number,
): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw new RequestValidationError("INVALID_FIELD_VALUE", field);
  }
  return numberValue;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["address", "lat", "lng", "placeId", "osmId", "freeText"]);
    const addressText = optionalString(body, "address", { min: 1, max: 500 }) ?? undefined;
    const placeId = optionalString(body, "placeId", { min: 1, max: 200 }) ?? undefined;
    const osmId = optionalString(body, "osmId", { min: 1, max: 80 }) ?? undefined;
    const lat = optionalCoordinate(body, "lat", -90, 90);
    const lng = optionalCoordinate(body, "lng", -180, 180);
    if (body.freeText !== undefined && typeof body.freeText !== "boolean") {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "freeText");
    }
    const hasGps = lat !== undefined || lng !== undefined;
    if (hasGps && (lat === undefined || lng === undefined) && !placeId && !osmId) {
      return NextResponse.json(
        { error: "GPS lookup requires both lat and lng", code: "gps_incomplete" },
        { status: 400 },
      );
    }

    const classified = classifyLookupBody({
      address: addressText,
      placeId,
      osmId,
      lat,
      lng,
      freeText: body.freeText === true,
    });
    if (!classified.ok) {
      return NextResponse.json(
        { error: classified.error, code: classified.code },
        { status: 400 },
      );
    }

    const address = createServerAddressService();
    const signal = request.signal;
    const result =
      classified.kind === "place"
        ? await address.lookupByPlaceId(classified.placeId, signal)
        : classified.kind === "osm"
          ? await address.lookupByOsmId(
              classified.osmId,
              { lat: classified.lat, lng: classified.lng },
              signal,
            )
          : classified.kind === "coords"
            ? await address.lookupByCoords(classified.lat, classified.lng, signal)
            : await address.lookupByAddress(classified.address, signal);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Cancelled", code: "cancelled" }, { status: 499 });
    }
    const message = error instanceof Error ? error.message : "Address lookup failed";
    return NextResponse.json({ error: message, code: "lookup_failed" }, { status: 404 });
  }
}
