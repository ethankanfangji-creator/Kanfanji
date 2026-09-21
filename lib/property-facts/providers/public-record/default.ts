import { runParcelLane, runZoningLane } from "../../lanes/parcel-zoning";
import type { PublicRecordProvider } from "../../interfaces";
import type { LaneContext, LaneResult } from "../../types";

/** Parcel / zoning / tax-oriented public records (Metro open data, ATTOM parcel). */
export class DefaultPublicRecordProvider implements PublicRecordProvider {
  readonly id = "public_record_bundle";

  fetchParcel(ctx: LaneContext): Promise<LaneResult> {
    return runParcelLane(ctx);
  }

  fetchZoning(ctx: LaneContext): Promise<LaneResult> {
    return runZoningLane(ctx);
  }
}
