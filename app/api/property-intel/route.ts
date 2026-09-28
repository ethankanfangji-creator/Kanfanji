import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  resolveGuestIdentity,
} from "@/lib/ai-boundary/server-entry";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import {
  addressFactsCacheKey,
  getCachedPropertyFacts,
  placeFactsCacheKey,
  setCachedPropertyFacts,
  type PropertyFactsPlaceAlias,
} from "@/lib/property-facts/cache";
import type { PropertyFactCard } from "@/lib/property-facts/types";
import { projectFactCardToIntel } from "@/lib/property-facts/project";
import { projectFactCardToReport } from "@/lib/property-facts/report";
import { buildStreetViewUrl } from "@/lib/property-intel/street-view";
import { consumeIntelRateLimit } from "@/lib/property-intel/rate-limit.server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const inflight = new Map<string, Promise<PropertyFactCard>>();

function placeAlias(body: Record<string, unknown>): PropertyFactsPlaceAlias | null {
  const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
  const placeSource = typeof body.placeSource === "string" ? body.placeSource.trim() : "";
  if (!placeId || placeId.length > 200) return null;
  if (!placeSource || placeSource.length > 40) return null;
  return { placeId, placeSource };
}

function flightKey(address: string, place: PropertyFactsPlaceAlias | null): string {
  if (place) return placeFactsCacheKey(place.placeSource, place.placeId);
  return addressFactsCacheKey(address) ?? `facts:v1:raw:${address}`;
}

async function loadFacts(address: string, place: PropertyFactsPlaceAlias | null) {
  const key = flightKey(address, place);
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = assemblePropertyFacts({ address }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const identity = await resolveGuestIdentity(request);
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address || address.length > 500) throw new AiInputError("address_invalid");
    const viewingId =
      typeof body.viewingId === "string" && body.viewingId.trim()
        ? body.viewingId.trim()
        : null;
    if (viewingId && viewingId.length > AI_LIMITS.genericString) {
      throw new AiInputError("viewing_invalid");
    }
    const place = placeAlias(body);
    const includeFactCard = body.includeFactCard !== false;

    const cached = await getCachedPropertyFacts(address, place);
    let card: PropertyFactCard;
    if (cached) {
      card = cached;
    } else {
      const limited = await consumeIntelRateLimit(request, {
        userId: identity.userId,
        guestId: identity.guest?.guestId ?? null,
      });
      if (!limited.allowed) {
        return identity.applyCookie(
          NextResponse.json(
            { code: limited.code },
            { status: limited.status, headers: { "Cache-Control": "no-store" } },
          ),
        );
      }
      card = await loadFacts(address, place);
      await setCachedPropertyFacts(address, card, place);
    }

    const intel = projectFactCardToIntel(card);
    const report = projectFactCardToReport(card);
    const lat = intel.location.lat;
    const lng = intel.location.lng;
    if (lat != null && lng != null) {
      intel.visuals.streetViewUrl = buildStreetViewUrl(lat, lng);
      if (intel.visuals.streetViewUrl) {
        intel.sources = [...new Set([...intel.sources, "Google Street View"])];
        intel.compliance.streetViewNotice = true;
      }
    }

    let persisted = false;
    if (viewingId && identity.userId) {
      const supabase = await createClient();
      const { error } = await supabase
        .from("viewings")
        .update({
          metadata: {
            intel,
            factCard: includeFactCard ? card : undefined,
            propertyReport: report,
          },
          updated_at: new Date().toISOString(),
          client_updated_at: new Date().toISOString(),
        })
        .eq("id", viewingId)
        .eq("user_id", identity.userId);
      persisted = !error;
      if (error) console.error("property_intel_persist", error.message);
    }

    return identity.applyCookie(
      NextResponse.json(
        {
          intel,
          report,
          persisted,
          ...(includeFactCard ? { factCard: card } : {}),
        },
        { headers: { "Cache-Control": "no-store" } },
      ),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
