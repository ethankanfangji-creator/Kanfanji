import { NextResponse } from "next/server";
import { lookupAddressDetails } from "@/lib/address-lookup";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string };
    const address = body.address?.trim();
    if (!address) {
      return NextResponse.json({ error: "請輸入地址" }, { status: 400 });
    }

    const result = await lookupAddressDetails(address);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "地址查詢失敗";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
