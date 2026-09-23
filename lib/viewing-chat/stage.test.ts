import { describe, expect, it } from "vitest";
import {
  applyStageEvent,
  canGenerateReport,
  createInitialStageContext,
  meetsMinimumReportCriteria,
  nextStage,
} from "./stage";

describe("property chat stage machine", () => {
  it("moves address → guidance → viewing_preparation (A default)", () => {
    let ctx = createInitialStageContext();
    ctx = applyStageEvent(ctx, { type: "ADDRESS_CONFIRMED" });
    expect(ctx.stage).toBe("address_received");
    expect(ctx.hasAddress).toBe(true);
    ctx = applyStageEvent(ctx, { type: "GUIDANCE_SHOWN" });
    expect(ctx.stage).toBe("viewing_preparation");
  });

  it("optional listing intake opens collecting path", () => {
    let ctx = createInitialStageContext();
    ctx = applyStageEvent(ctx, { type: "ADDRESS_CONFIRMED" });
    ctx = applyStageEvent(ctx, { type: "GUIDANCE_SHOWN" });
    ctx = applyStageEvent(ctx, { type: "OPEN_LISTING_INTAKE" });
    expect(ctx.stage).toBe("awaiting_property_source");
    ctx = applyStageEvent(ctx, { type: "SOURCE_ADDED" });
    expect(ctx.stage).toBe("collecting_sources");
    expect(ctx.sourceCount).toBe(1);
    ctx = applyStageEvent(ctx, { type: "EXTRACTION_STARTED" });
    expect(ctx.stage).toBe("extracting_data");
    ctx = applyStageEvent(ctx, {
      type: "EXTRACTION_FINISHED",
      hasConflicts: true,
    });
    expect(ctx.stage).toBe("awaiting_user_confirmation");
  });

  it("skip sources goes to viewing_preparation", () => {
    let ctx = createInitialStageContext();
    ctx = applyStageEvent(ctx, { type: "ADDRESS_CONFIRMED" });
    ctx = applyStageEvent(ctx, { type: "SKIP_SOURCES" });
    expect(ctx.stage).toBe("viewing_preparation");
    expect(ctx.userSkippedSources).toBe(true);
  });

  it("report generation path", () => {
    expect(
      meetsMinimumReportCriteria({
        hasAddress: true,
        sourceCount: 1,
        coreFieldCount: 1,
      }),
    ).toBe(true);
    expect(
      meetsMinimumReportCriteria({
        hasAddress: true,
        sourceCount: 0,
        coreFieldCount: 2,
      }),
    ).toBe(false);

    let ctx = createInitialStageContext();
    ctx = {
      ...ctx,
      hasAddress: true,
      sourceCount: 1,
      coreFieldCount: 2,
    };
    expect(canGenerateReport(ctx)).toBe(true);
    const stage = nextStage(ctx.stage, { type: "REQUEST_REPORT" }, ctx);
    expect(stage).toBe("generating_initial_report");
    ctx = applyStageEvent(
      { ...ctx, stage },
      { type: "REPORT_GENERATED", partial: false },
    );
    expect(ctx.stage).toBe("report_ready");
    ctx = applyStageEvent(ctx, { type: "ASK_FOLLOW_UP" });
    expect(ctx.stage).toBe("follow_up_questions");
  });

  it("allows on-site report with address only (A default)", () => {
    const ctx = {
      ...createInitialStageContext(),
      hasAddress: true,
      sourceCount: 0,
    };
    expect(canGenerateReport(ctx)).toBe(true);
  });

  it("allows partial report when user skipped with address only", () => {
    const ctx = {
      ...createInitialStageContext(),
      hasAddress: true,
      userSkippedSources: true,
    };
    expect(canGenerateReport(ctx)).toBe(true);
  });
});
