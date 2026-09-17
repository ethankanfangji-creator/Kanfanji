import { NextResponse } from "next/server";
import {
  lookupAddressDetails,
  lookupAddressDetailsFromGps,
} from "@/lib/address-lookup";
import {
  assertAllowedKeys,
  optionalString,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

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
    const address = optionalString(body, "address", { min: 1, max: 500 });
    const lat = optionalCoordinate(body, "lat", -90, 90);
    const lng = optionalCoordinate(body, "lng", -180, 180);

    const hasGps = lat !== undefined || lng !== undefined;
    if (hasGps && (lat === undefined || lng === undefined)) {
      return NextResponse.json(
        { error: "GPS 查詢需要同時提供 lat 與 lng" },
        { status: 400 },
      );
    }
    if (address && hasGps) {
      return NextResponse.json(
        { error: "請擇一使用 address 或 lat/lng" },
        { status: 400 },
      );
    }
    if (!address && !hasGps) {
      return NextResponse.json({ error: "請輸入地址" }, { status: 400 });
    }

    const result = hasGps
      ? await lookupAddressDetailsFromGps(lat!, lng!)
      : await lookupAddressDetails(address!);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "地址查詢失敗";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
