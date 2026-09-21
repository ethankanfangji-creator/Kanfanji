import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultPipelineDeps } from "./services/defaults";
import { MemoryEvidenceStore } from "./services/evidence-store";
import { assemblePropertyFacts } from "./orchestrator";
import { emptyFactCard } from "./resolve";
import type { GeocodingProvider } from "./interfaces";
import type { GeocodeResult } from "./geocode";
import { deriveJurisdiction, jurisdictionKey } from "./jurisdiction";

describe("architecture boundaries", () => {
  it("orchestrator does not import vendor SDKs directly", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/property-facts/orchestrator.ts"),
      "utf8",
    );
    const forbidden = [
      "google-places",
      "market-attom",
      "bing-search",
      "metro-opendata",
      "osm-overpass",
    ];
    for (const needle of forbidden) {
      expect(src.includes(needle), `orchestrator must not import ${needle}`).toBe(false);
    }
  });

  it("default pipeline exposes all module-boundary ports", () => {
    const deps = createDefaultPipelineDeps();
    expect(deps.addressNormalization).toBeTruthy();
    expect(deps.geocoding).toBeTruthy();
    expect(deps.countryAdapter).toBeTruthy();
    expect(deps.listing).toBeTruthy();
    expect(deps.publicRecord).toBeTruthy();
    expect(deps.poiTransit).toBeTruthy();
    expect(deps.risk).toBeTruthy();
    expect(deps.dataNormalizer).toBeTruthy();
    expect(deps.conflictResolver).toBeTruthy();
    expect(deps.evidenceStore).toBeTruthy();
    expect(deps.confidenceScorer).toBeTruthy();
    expect(deps.reportGenerator).toBeTruthy();
  });
});

describe("EvidenceStore memory", () => {
  it("round-trips a fact card", async () => {
    const store = new MemoryEvidenceStore(60_000);
    const card = emptyFactCard("1 Main St", "US");
    await store.set("1 main st", card);
    const hit = await store.get("1 main st");
    expect(hit?.identity.rawAddress).toBe("1 Main St");
    expect(hit?.region).toBe("US");
  });
});

describe("assemblePropertyFacts with fake geocoder", () => {
  it("still returns a card with data gaps when geocode is stubbed", async () => {
    const fakeGeo: GeocodingProvider = {
      async geocode(query): Promise<GeocodeResult> {
        const jurisdiction = deriveJurisdiction({
          region: "US",
          query,
          admin1: "WA",
          city: "Seattle",
        });
        return {
          region: "US",
          displayAddress: "1 Main St, Seattle, WA",
          countryCode: "US",
          admin1: "WA",
          city: "Seattle",
          postalCode: null,
          jurisdiction,
          jurisdictionKey: jurisdictionKey(jurisdiction),
          lat: 47.6,
          lng: -122.3,
          placeId: null,
          streetNumber: "1",
          streetName: "Main St",
          geocodeOk: true,
          identityEvidence: [],
          sourceId: "fake_geocoder",
        };
      },
    };

    const store = new MemoryEvidenceStore();
    const card = await assemblePropertyFacts({
      address: "1 Main St, Seattle, WA",
      bypassCache: true,
      deps: {
        geocoding: fakeGeo,
        evidenceStore: store,
      },
    });

    expect(card.region).toBe("US");
    expect(card.meta.geocodeOk).toBe(true);
    expect(card.meta.jurisdictionKey).toBeTruthy();
    // Without ATTOM key, listing fields stay not_found — no invention
    expect(card.listing.beds.status).toBe("not_found");
  });
});
