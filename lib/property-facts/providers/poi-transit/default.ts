import { runPoiLane, runTransitLane } from "../../lanes/poi-transit-risk";
import { collectPublicWebEvidence } from "../../lanes/public-web";
import type { PoiTransitProvider } from "../../interfaces";
import type { Evidence, LaneContext, LaneResult } from "../../types";

/** POI / transit / public-web search snippets (no page scraping). */
export class DefaultPoiTransitProvider implements PoiTransitProvider {
  readonly id = "poi_transit_bundle";

  fetchPoi(ctx: LaneContext): Promise<LaneResult> {
    return runPoiLane(ctx);
  }

  fetchTransit(ctx: LaneContext): Promise<LaneResult> {
    return runTransitLane(ctx);
  }

  fetchPublicWeb(ctx: LaneContext): Promise<Evidence<string>[]> {
    return collectPublicWebEvidence(ctx);
  }
}
