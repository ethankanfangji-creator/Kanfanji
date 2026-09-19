import { NextResponse } from "next/server";
import { createServerAddressService } from "@/lib/services/address/server-adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long", code: "query_too_long" }, { status: 400 });
  }

  try {
    const address = createServerAddressService();
    const suggestions = await address.suggest(q, request.signal);
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ suggestions: [] });
    }
    return NextResponse.json(
      { error: "Address suggestions unavailable", code: "suggest_failed" },
      { status: 502 },
    );
  }
}
