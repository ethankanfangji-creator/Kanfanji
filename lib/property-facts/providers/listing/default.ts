import {
  runBuildingLane,
  runHoaLane,
  runListingLane,
  runMarketLane,
} from "../../lanes/listing-building";
import type { ListingProvider } from "../../interfaces";
import type { LaneContext, LaneResult } from "../../types";

/** Default listing/building/HOA/market lanes (ATTOM gated via registry). */
export class DefaultListingProvider implements ListingProvider {
  readonly id = "listing_bundle";

  fetchListing(ctx: LaneContext): Promise<LaneResult> {
    return runListingLane(ctx);
  }

  fetchBuilding(ctx: LaneContext): Promise<LaneResult> {
    return runBuildingLane(ctx);
  }

  fetchHoa(ctx: LaneContext): Promise<LaneResult> {
    return runHoaLane(ctx);
  }

  fetchMarket(ctx: LaneContext): Promise<LaneResult> {
    return runMarketLane(ctx);
  }
}
