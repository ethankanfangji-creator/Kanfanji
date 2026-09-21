import type { GeocodeResult } from "../geocode";
import type { CountryAdapter, CountryResolution } from "../interfaces";
import { resolveWithCountryAdapter } from "../adapters/country/registry";

/**
 * Default country adapter port — delegates to UnitedStates / Canada / Taiwan / Other.
 */
export class DefaultCountryAdapter implements CountryAdapter {
  readonly id = "DefaultCountryAdapter";

  resolve(geo: GeocodeResult): CountryResolution {
    return resolveWithCountryAdapter(geo);
  }
}
