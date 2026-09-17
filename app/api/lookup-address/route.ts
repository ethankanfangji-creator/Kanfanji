import { NextResponse } from "next/server";
import { lookupAddressDetails } from "@/lib/address-lookup";
import {
  assertAllowedKeys,
  optionalString,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["address"]);
    const address = optionalString(body, "address", { min: 1, max: 500 });
    if (!address) {
      return NextResponse.json({ error: "請輸入地址" }, { status: 400 });
    }

    const result = await lookupAddressDetails(address);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "地址查詢失敗";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
