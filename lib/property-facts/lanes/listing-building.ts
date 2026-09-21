import { fetchAttomOnce } from "./attom-shared";
import { jurisdictionKey } from "../jurisdiction";
import { makeEvidence } from "../evidence";
import type { Evidence, LaneContext, LaneResult } from "../types";
import { runLane, stubLane } from "./types";

const ATTOM_LIMITATION =
  "National licensed vendor. City building permits and inspections are not included.";

/** Property / Listing basics — US uses a licensed vendor until a county or MLS adapter exists. */
export async function runListingLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "listing");
  if (ctx.region !== "US") {
    return stubLane("listing", adapterId);
  }
  return runLane("listing", adapterId, ctx, async () => {
    const attom = await fetchAttomOnce(ctx.displayAddress || ctx.normalizedQuery);
    if (!attom.sources.length) return [];
    const now = ctx.now;
    const out: Evidence<unknown>[] = [];
    const push = <T>(field: string, value: T | null | undefined, unit?: string) => {
      if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
      if (typeof value === "string" && !value.trim()) return;
      out.push(
        makeEvidence({
          lane: "listing",
          field,
          value,
          unit: unit ?? null,
          sourceType: "licensed_vendor",
          sourceId: adapterId,
          sourceLabel: "ATTOM Data",
          fetchedAt: now,
          matchLevel: "street",
          limitations: "Not an MLS feed. Redisplay and freshness follow the vendor license.",
        }),
      );
    };
    push("propertyType", attom.basic.type);
    push("beds", attom.basic.beds);
    push("baths", attom.basic.baths);
    push("area", attom.basic.area, "sqft");
    return out;
  });
}

/** Building / Permit / Inspection */
export async function runBuildingLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "building");
  if (ctx.region !== "US") {
    return stubLane("building", adapterId);
  }
  return runLane("building", adapterId, ctx, async () => {
    const attom = await fetchAttomOnce(ctx.displayAddress || ctx.normalizedQuery);
    if (!attom.sources.length) return [];
    const now = ctx.now;
    const out: Evidence<unknown>[] = [];
    if (attom.basic.year != null) {
      out.push(
        makeEvidence({
          lane: "building",
          field: "yearBuilt",
          value: attom.basic.year,
          sourceType: "licensed_vendor",
          sourceId: adapterId,
          sourceLabel: "ATTOM Data",
          fetchedAt: now,
          matchLevel: "street",
          limitations: ATTOM_LIMITATION,
        }),
      );
    }
    if (attom.basic.type) {
      out.push(
        makeEvidence({
          lane: "building",
          field: "buildingType",
          value: attom.basic.type,
          sourceType: "licensed_vendor",
          sourceId: adapterId,
          sourceLabel: "ATTOM Data",
          fetchedAt: now,
          matchLevel: "street",
          limitations: ATTOM_LIMITATION,
        }),
      );
    }
    return out;
  });
}

/** HOA / Condo / Strata — no official document source in this phase. */
export async function runHoaLane(ctx: LaneContext): Promise<LaneResult> {
  return stubLane("hoa", jurisdictionKey(ctx.jurisdiction, "hoa"));
}

/** Market / sales / rent */
export async function runMarketLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "market");
  if (ctx.region === "US") {
    return runLane("market", adapterId, ctx, async () => {
      const attom = await fetchAttomOnce(ctx.displayAddress || ctx.normalizedQuery);
      if (!attom.sources.length) return [];
      const now = ctx.now;
      const out: Evidence<unknown>[] = [];
      out.push(
        makeEvidence({
          lane: "market",
          field: "currency",
          value: "USD",
          unit: "USD",
          sourceType: "official",
          sourceId: adapterId,
          sourceLabel: "ISO currency for United States",
          fetchedAt: now,
          matchLevel: "street",
        }),
      );
      if (attom.history.last_sold) {
        out.push(
          makeEvidence({
            lane: "market",
            field: "lastSold",
            value: attom.history.last_sold,
            unit: "USD",
            sourceType: "licensed_vendor",
            sourceId: adapterId,
            sourceLabel: "ATTOM Data",
            fetchedAt: now,
            matchLevel: "street",
            limitations: "Not the county recorder. Confirm the deed with the local clerk.",
          }),
        );
      }
      return out;
    });
  }

  if (ctx.region === "CA" || ctx.region === "TW") {
    return runLane("market", adapterId, ctx, async () => [
      makeEvidence({
        lane: "market",
        field: "currency",
        value: ctx.region === "CA" ? "CAD" : "TWD",
        unit: ctx.region === "CA" ? "CAD" : "TWD",
        sourceType: "official",
        sourceId: adapterId,
        sourceLabel: "ISO currency for region",
        fetchedAt: ctx.now,
        matchLevel: "street",
      }),
    ]);
  }

  return stubLane("market", adapterId);
}
