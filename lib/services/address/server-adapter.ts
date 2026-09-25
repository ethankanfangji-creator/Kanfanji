/**
 * Server-side AddressService wrapping BC Geocoder + Nominatim helpers.
 * Never call from client components — use /api/address-suggest and /api/lookup-address.
 */

import {
  lookupAddressDetails,
  lookupAddressDetailsFromGps,
} from "@/lib/address-lookup";
import { suggestAddresses } from "@/lib/address-suggest";
import type { AddressService } from "./types";

export function createServerAddressService(): AddressService {
  return {
    status: () => "ready",
    async suggest(query, signal) {
      if (signal?.aborted) {
        const err = new Error("ADDRESS_SUGGEST_ABORTED");
        err.name = "AbortError";
        throw err;
      }
      return suggestAddresses(query, { limit: 5, signal });
    },
    async lookupByAddress(address, signal) {
      if (signal?.aborted) {
        const err = new Error("ADDRESS_LOOKUP_ABORTED");
        err.name = "AbortError";
        throw err;
      }
      return lookupAddressDetails(address);
    },
    async lookupByCoords(lat, lng, signal) {
      if (signal?.aborted) {
        const err = new Error("ADDRESS_LOOKUP_ABORTED");
        err.name = "AbortError";
        throw err;
      }
      return lookupAddressDetailsFromGps(lat, lng);
    },
  };
}
