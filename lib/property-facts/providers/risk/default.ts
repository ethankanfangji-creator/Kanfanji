import { runRiskLane } from "../../lanes/poi-transit-risk";
import type { RiskProvider } from "../../interfaces";
import type { LaneContext, LaneResult } from "../../types";

/** Flood / earthquake / wildfire / noise — stubbed until licensed risk APIs exist. */
export class DefaultRiskProvider implements RiskProvider {
  readonly id = "risk_bundle";

  fetchRisk(ctx: LaneContext): Promise<LaneResult> {
    return runRiskLane(ctx);
  }
}
