import type { GeocodeResult } from "../../geocode";
import type { CountryAdapter, CountryResolution } from "../../interfaces";
import type { PropertyRegion } from "../../types";
import { CanadaAdapter } from "./canada";
import { OtherCountryAdapter } from "./other";
import { TaiwanAdapter } from "./taiwan";
import { UnitedStatesAdapter } from "./united-states";

const us = new UnitedStatesAdapter();
const ca = new CanadaAdapter();
const tw = new TaiwanAdapter();
const other = new OtherCountryAdapter();

export function selectCountryAdapter(region: PropertyRegion): CountryAdapter {
  switch (region) {
    case "US":
      return us;
    case "CA":
      return ca;
    case "TW":
      return tw;
    default:
      return other;
  }
}

/** Resolve geo through the correct national adapter. */
export function resolveWithCountryAdapter(geo: GeocodeResult): CountryResolution {
  return selectCountryAdapter(geo.region).resolve(geo);
}

export { UnitedStatesAdapter, CanadaAdapter, TaiwanAdapter, OtherCountryAdapter };
