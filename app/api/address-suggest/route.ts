import { NextResponse } from "next/server";
import { isLocale } from "@/lib/i18n/config";
import {
  detectSuggestRegion,
  METRO_VANCOUVER_BIAS,
  queryNamesPlace,
  type SuggestBias,
} from "@/lib/address-suggest";
import { createServerAddressService } from "@/lib/services/address/server-adapter";

export const runtime = "nodejs";

function biasFromRequest(request: Request): SuggestBias {
  const lat = Number(request.headers.get("x-vercel-ip-latitude"));
  const lng = Number(request.headers.get("x-vercel-ip-longitude"));
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return {
      latitude: lat,
      longitude: lng,
      radiusMeters: METRO_VANCOUVER_BIAS.radiusMeters,
    };
  }
  return METRO_VANCOUVER_BIAS;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long", code: "query_too_long" }, { status: 400 });
  }

  const localeParam = searchParams.get("locale");
  const locale = isLocale(localeParam) ? localeParam : undefined;
  const bias = queryNamesPlace(q) ? null : biasFromRequest(request);

  try {
    const address = createServerAddressService();
    const suggestions = await address.suggest(q, request.signal, locale, bias);
    return NextResponse.json({
      suggestions,
      region: detectSuggestRegion(q),
    });
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
