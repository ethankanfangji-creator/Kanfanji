import { NextResponse } from "next/server";
import { splitAddressQuery, withUnitLabel } from "@/lib/address-suggest";
import { createServerAddressService } from "@/lib/services/address/server-adapter";

export const runtime = "nodejs";

/**
 * Free-text address lookup when the user confirms without picking a suggestion.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ error: "Query too short", code: "query_too_short" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long", code: "query_too_long" }, { status: 400 });
  }

  const split = splitAddressQuery(q);
  const lookupQuery = split.streetQuery.length >= 3 ? split.streetQuery : q;

  try {
    const address = createServerAddressService();
    const result = await address.lookupByAddress(lookupQuery, request.signal);
    if (!result.displayAddress?.trim()) {
      return NextResponse.json({ error: "No match", code: "not_found" }, { status: 404 });
    }
    const displayAddress = withUnitLabel(result.displayAddress, split.unit);
    return NextResponse.json({
      ...result,
      displayAddress,
      details: {
        ...result.details,
        normalizedAddress: withUnitLabel(
          result.details.normalizedAddress || result.displayAddress,
          split.unit,
        ),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Aborted", code: "aborted" }, { status: 499 });
    }
    return NextResponse.json(
      { error: "Address lookup unavailable", code: "lookup_failed" },
      { status: 502 },
    );
  }
}
