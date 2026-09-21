import { makeEvidence } from "../evidence";
import type { AdapterRun, Evidence, LaneContext, LaneId, LaneResult } from "../types";

export type LaneAdapter = (ctx: LaneContext) => Promise<LaneResult>;

export async function runLane(
  lane: LaneId,
  sourceId: string,
  ctx: LaneContext,
  fn: () => Promise<Evidence<unknown>[]>,
): Promise<LaneResult> {
  const started = Date.now();
  try {
    const evidence = await fn();
    const run: AdapterRun = {
      lane,
      sourceId,
      ok: true,
      durationMs: Date.now() - started,
    };
    return { lane, evidence, runs: [run] };
  } catch (err) {
    const run: AdapterRun = {
      lane,
      sourceId,
      ok: false,
      error: err instanceof Error ? err.message : "lane_failed",
      durationMs: Date.now() - started,
    };
    return { lane, evidence: [], runs: [run] };
  }
}

/** Stub: no source configured — contributes zero evidence (resolver → not_found). */
export async function stubLane(lane: LaneId, sourceId: string): Promise<LaneResult> {
  return {
    lane,
    evidence: [],
    runs: [{ lane, sourceId, ok: true, durationMs: 0 }],
  };
}

export { makeEvidence };
