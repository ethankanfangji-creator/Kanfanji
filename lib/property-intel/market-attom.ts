import type { PropertyIntelBasic, PropertyIntelHistory, PropertyIntelMarket } from "./types";

/**
 * Optional ATTOM Data API (US property profile).
 * No-op without ATTOM_API_KEY. Official API only — no scraping.
 */
export async function enrichAttomProperty(address: string): Promise<{
  basic: Partial<PropertyIntelBasic>;
  history: Partial<PropertyIntelHistory>;
  market: Partial<PropertyIntelMarket>;
  sources: string[];
}> {
  const key = process.env.ATTOM_API_KEY?.trim();
  if (!key) return { basic: {}, history: {}, market: {}, sources: [] };

  try {
    const url = new URL(
      "https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/expandedprofile",
    );
    url.searchParams.set("address", address);
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        apikey: key,
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { basic: {}, history: {}, market: {}, sources: [] };
    const data = (await res.json()) as {
      property?: Array<Record<string, unknown>>;
    };
    const prop = data.property?.[0];
    if (!prop) return { basic: {}, history: {}, market: {}, sources: [] };

    const summary = (prop.summary ?? {}) as Record<string, unknown>;
    const building = (prop.building ?? {}) as Record<string, unknown>;
    const rooms = (building.rooms ?? {}) as Record<string, unknown>;
    const size = (building.size ?? {}) as Record<string, unknown>;
    const assessment = (prop.assessment ?? {}) as Record<string, unknown>;
    const assessed = (assessment.assessed ?? {}) as Record<string, unknown>;
    const sale = (prop.sale ?? {}) as Record<string, unknown>;
    const saleAmount = (sale.saleAmount ?? sale.amount ?? {}) as Record<string, unknown>;

    const year =
      typeof summary.yearBuilt === "number"
        ? summary.yearBuilt
        : typeof building.yearBuilt === "number"
          ? (building.yearBuilt as number)
          : null;
    const beds = typeof rooms.beds === "number" ? rooms.beds : null;
    const baths = typeof rooms.bathsTotal === "number" ? rooms.bathsTotal : null;
    const area =
      typeof size.livingSize === "number"
        ? size.livingSize
        : typeof size.bldgSize === "number"
          ? (size.bldgSize as number)
          : null;
    const lastSold =
      typeof saleAmount.saleAmt === "number"
        ? `$${Number(saleAmount.saleAmt).toLocaleString("en-US")}`
        : typeof saleAmount.salePrice === "number"
          ? `$${Number(saleAmount.salePrice).toLocaleString("en-US")}`
          : null;
    const assessedVal =
      typeof assessed.assdTtlValue === "number"
        ? `$${Number(assessed.assdTtlValue).toLocaleString("en-US")}`
        : null;
    const propType =
      typeof summary.propType === "string"
        ? summary.propType
        : typeof summary.propertyType === "string"
          ? (summary.propertyType as string)
          : null;

    return {
      basic: {
        year,
        type: propType,
        beds,
        baths,
        area: area != null ? Math.round(area) : null,
      },
      history: {
        last_sold: lastSold,
        assessed: assessedVal,
      },
      market: {
        region: "US",
        currency: "USD",
        priceRange: lastSold,
      },
      sources: ["ATTOM Data"],
    };
  } catch {
    return { basic: {}, history: {}, market: {}, sources: [] };
  }
}
