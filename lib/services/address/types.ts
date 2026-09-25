/**
 * Address suggest + lookup. Implementations must run server-side for third-party geocoders.
 * Real adapter: `createServerAddressService` — used by /api/address-suggest and /api/lookup-address.
 */

import type { AddressSuggestion } from "@/lib/domain";
import type { AddressLookupResult } from "@/lib/address-lookup";

export type AddressServiceStatus = "ready" | "degraded" | "unconfigured" | "error";

export type AddressService = {
  status(): AddressServiceStatus;
  suggest(query: string, signal?: AbortSignal, locale?: string): Promise<AddressSuggestion[]>;
  lookupByAddress(address: string, signal?: AbortSignal): Promise<AddressLookupResult>;
  lookupByPlaceId(placeId: string, signal?: AbortSignal): Promise<AddressLookupResult>;
  lookupByOsmId(
    osmId: string,
    coords?: { lat?: number; lng?: number },
    signal?: AbortSignal,
  ): Promise<AddressLookupResult>;
  lookupByCoords(
    lat: number,
    lng: number,
    signal?: AbortSignal,
  ): Promise<AddressLookupResult>;
};

function mockLookup(address: string, lat?: number, lng?: number): AddressLookupResult {
  return {
    market: "CA",
    displayAddress: address,
    tags: [],
    source: "mock",
    details: {
      lat,
      lng,
      normalizedAddress: address,
      openData: null,
    },
  };
}

export function createMockAddressService(seed: AddressSuggestion[] = []): AddressService {
  return {
    status: () => "ready",
    async suggest(query) {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      return seed.filter((item) => item.label.toLowerCase().includes(q));
    },
    async lookupByAddress(address) {
      return mockLookup(address);
    },
    async lookupByPlaceId(placeId) {
      return mockLookup(placeId);
    },
    async lookupByOsmId(osmId, coords) {
      return mockLookup(osmId, coords?.lat, coords?.lng);
    },
    async lookupByCoords(lat, lng) {
      return mockLookup(`Mock @ ${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng);
    },
  };
}
