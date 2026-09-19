import { NextResponse } from "next/server";
import { createServerAddressService } from "@/lib/services/address/server-adapter";
import {
  assertAllowedKeys,
  optionalString,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export const runtime = "nodejs";

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
    assertAllowedKeys(body, ["address", "lat", "lng"]);
    const addressText = optionalString(body, "address", { min: 1, max: 500 });
    const lat = optionalCoordinate(body, "lat", -90, 90);
    const lng = optionalCoordinate(body, "lng", -180, 180);

    const hasGps = lat !== undefined || lng !== undefined;
    if (hasGps && (lat === undefined || lng === undefined)) {
      return NextResponse.json(
        { error: "GPS lookup requires both lat and lng", code: "gps_incomplete" },
        { status: 400 },
      );
    }
    if (addressText && hasGps) {
      return NextResponse.json(
        { error: "Use either address or lat/lng", code: "lookup_ambiguous" },
        { status: 400 },
      );
    }
    if (!addressText && !hasGps) {
      return NextResponse.json(
        { error: "Address required", code: "address_required" },
        { status: 400 },
      );
    }

    const address = createServerAddressService();
    const result = hasGps
      ? await address.lookupByCoords(lat!, lng!, request.signal)
      : await address.lookupByAddress(addressText!, request.signal);
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
