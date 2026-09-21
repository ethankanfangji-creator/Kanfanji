import { enrichMetroOpenData } from "@/lib/metro-opendata";
import { isBcMetroMunicipality, jurisdictionKey } from "../jurisdiction";
import { fetchAttomOnce } from "./attom-shared";
import { makeEvidence } from "../evidence";
import type { Evidence, LaneContext, LaneResult } from "../types";
import { runLane, stubLane } from "./types";

const ATTOM_LIMITATION =
  "National licensed vendor, not the county assessor or city building department. Confirm with the local property appraiser.";

/** Parcel / Assessment / Tax lane — routed by county, municipality, or 縣市. */
export async function runParcelLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "parcel");
  if (ctx.lat == null || ctx.lng == null) {
    return stubLane("parcel", adapterId);
  }

  if (ctx.region === "CA") {
    if (!isBcMetroMunicipality(ctx.jurisdiction)) {
      return stubLane("parcel", adapterId);
    }
    return runLane("parcel", adapterId, ctx, async () => {
      const open = await enrichMetroOpenData(ctx.city ?? undefined, ctx.lng!, ctx.lat!);
      if (!open) return [];
      const now = ctx.now;
      const sourceLabel = open.source || "Metro Vancouver Open Data";
      const out: Evidence<unknown>[] = [];
      const push = <T>(field: string, value: T | null | undefined) => {
        if (value == null || value === "") return;
        out.push(
          makeEvidence({
            lane: "parcel",
            field,
            value,
            sourceType: "official",
            sourceId: adapterId,
            sourceLabel,
            fetchedAt: now,
            matchLevel: "exact_parcel",
            limitations: "Metro Vancouver open data for this municipality only.",
          }),
        );
      };
      push("pid", open.pid);
      push("planNumber", open.planNumber);
      push("lotNumber", open.lotNumber);
      push("rollNumber", open.rollNumber);
      push("legalDescription", open.legalDescription);
      push("parcelId", open.pid || open.rollNumber || null);
      return out;
    });
  }

  if (ctx.region === "US") {
    return runLane("parcel", adapterId, ctx, async () => {
      const attom = await fetchAttomOnce(ctx.displayAddress || ctx.normalizedQuery);
      if (!attom.sources.length || !attom.history.assessed) return [];
      return [
        makeEvidence({
          lane: "parcel",
          field: "assessedValue",
          value: attom.history.assessed,
          sourceType: "licensed_vendor",
          sourceId: adapterId,
          sourceLabel: "ATTOM Data",
          fetchedAt: ctx.now,
          matchLevel: ctx.jurisdiction.county ? "street" : "inferred",
          limitations: ATTOM_LIMITATION,
        }),
      ];
    });
  }

  return stubLane("parcel", adapterId);
}

/** Zoning / Land Use lane */
export async function runZoningLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "zoning");
  if (ctx.lat == null || ctx.lng == null || !isBcMetroMunicipality(ctx.jurisdiction)) {
    return stubLane("zoning", adapterId);
  }

  return runLane("zoning", adapterId, ctx, async () => {
    const open = await enrichMetroOpenData(ctx.city ?? undefined, ctx.lng!, ctx.lat!);
    if (!open) return [];
    const now = ctx.now;
    const sourceLabel = open.source || "Metro Vancouver Open Data";
    const out: Evidence<unknown>[] = [];
    const push = <T>(field: string, value: T | null | undefined) => {
      if (value == null || value === "") return;
      out.push(
        makeEvidence({
          lane: "zoning",
          field,
          value,
          sourceType: "official",
          sourceId: adapterId,
          sourceLabel,
          fetchedAt: now,
          matchLevel: "exact_parcel",
        }),
      );
    };
    push("zoningCode", open.zoningCode);
    push("zoningLabel", open.zoningLabel);
    push("zoningCategory", open.zoningCategory);
    push("landUse", open.zoningCategory || open.zoningLabel);
    if (typeof open.hasCovenantHint === "boolean") push("covenantHint", open.hasCovenantHint);
    if (typeof open.hasEasementHint === "boolean") push("easementHint", open.hasEasementHint);
    return out;
  });
}
