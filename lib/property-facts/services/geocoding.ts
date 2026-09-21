import { geocodeForFacts, type GeocodeResult } from "../geocode";
import type { GeocodingProvider } from "../interfaces";
import type { ProviderAudit } from "../providers/types";

export class DefaultGeocodingProvider implements GeocodingProvider {
  geocode(
    normalizedQuery: string,
    opts?: { audit?: ProviderAudit },
  ): Promise<GeocodeResult> {
    return geocodeForFacts(normalizedQuery, opts);
  }
}
