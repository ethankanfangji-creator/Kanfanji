/**
 * Property chat stage state machine.
 * UI and report generation must follow stages — not a single prompt.
 *
 * Product default (Option A — Open House Recorder):
 * address → viewing_preparation → on-site capture → report_ready.
 * Listing source collection is optional advanced intake only.
 * See docs/product-scope-a.md.
 */

export type PropertyChatStage =
  | "address_received"
  | "awaiting_property_source"
  | "collecting_sources"
  | "extracting_data"
  | "awaiting_user_confirmation"
  | "generating_initial_report"
  | "report_ready"
  | "viewing_preparation"
  | "follow_up_questions";

export type StageContext = {
  stage: PropertyChatStage;
  hasAddress: boolean;
  sourceCount: number;
  coreFieldCount: number;
  hasConflicts: boolean;
  userSkippedSources: boolean;
  reportReady: boolean;
};

export type StageEvent =
  | { type: "ADDRESS_CONFIRMED" }
  | { type: "GUIDANCE_SHOWN" }
  | { type: "OPEN_LISTING_INTAKE" }
  | { type: "SOURCE_ADDED" }
  | { type: "EXTRACTION_STARTED" }
  | { type: "EXTRACTION_FINISHED"; hasConflicts: boolean }
  | { type: "USER_CONFIRMED_CONFLICTS" }
  | { type: "SKIP_SOURCES" }
  | { type: "REQUEST_REPORT" }
  | { type: "REPORT_GENERATED"; partial: boolean }
  | { type: "START_VIEWING_PREP" }
  | { type: "ASK_FOLLOW_UP" };

const CORE_FIELD_MINIMUM = 1;

/** Criteria for listing-source (advanced) initial reports only. */
export function meetsMinimumReportCriteria(ctx: {
  hasAddress: boolean;
  sourceCount: number;
  coreFieldCount: number;
}): boolean {
  return (
    ctx.hasAddress &&
    ctx.sourceCount >= 1 &&
    ctx.coreFieldCount >= CORE_FIELD_MINIMUM
  );
}

/**
 * A default: address alone is enough at the stage layer.
 * UI may still require on-site messages/media before calling report APIs.
 * Listing-source minimum applies only when the user added sources.
 */
export function canGenerateReport(ctx: StageContext): boolean {
  if (!ctx.hasAddress) return false;
  if (ctx.sourceCount === 0 || ctx.userSkippedSources) return true;
  return meetsMinimumReportCriteria(ctx);
}

export function nextStage(
  current: PropertyChatStage,
  event: StageEvent,
  ctx: Omit<StageContext, "stage">,
): PropertyChatStage {
  switch (event.type) {
    case "ADDRESS_CONFIRMED":
      return "address_received";
    case "GUIDANCE_SHOWN":
      // A default: land in on-site prep, not listing collection.
      if (current === "address_received") return "viewing_preparation";
      return current;
    case "OPEN_LISTING_INTAKE":
      return "awaiting_property_source";
    case "SOURCE_ADDED":
      return "collecting_sources";
    case "EXTRACTION_STARTED":
      return "extracting_data";
    case "EXTRACTION_FINISHED":
      if (event.hasConflicts) return "awaiting_user_confirmation";
      if (canGenerateReport({ ...ctx, stage: current, hasConflicts: false })) {
        return "collecting_sources";
      }
      return "collecting_sources";
    case "USER_CONFIRMED_CONFLICTS":
      return "collecting_sources";
    case "SKIP_SOURCES":
      return "viewing_preparation";
    case "REQUEST_REPORT":
      return "generating_initial_report";
    case "REPORT_GENERATED":
      return "report_ready";
    case "START_VIEWING_PREP":
      return "viewing_preparation";
    case "ASK_FOLLOW_UP":
      return "follow_up_questions";
    default:
      return current;
  }
}

export function applyStageEvent(
  ctx: StageContext,
  event: StageEvent,
): StageContext {
  const patch: Partial<Omit<StageContext, "stage">> = {};
  switch (event.type) {
    case "ADDRESS_CONFIRMED":
      patch.hasAddress = true;
      break;
    case "SOURCE_ADDED":
      patch.sourceCount = ctx.sourceCount + 1;
      break;
    case "EXTRACTION_FINISHED":
      patch.hasConflicts = event.hasConflicts;
      break;
    case "USER_CONFIRMED_CONFLICTS":
      patch.hasConflicts = false;
      break;
    case "SKIP_SOURCES":
      patch.userSkippedSources = true;
      break;
    case "REPORT_GENERATED":
      patch.reportReady = true;
      break;
    default:
      break;
  }
  const merged = { ...ctx, ...patch };
  return {
    ...merged,
    stage: nextStage(ctx.stage, event, merged),
  };
}

export function createInitialStageContext(): StageContext {
  return {
    stage: "address_received",
    hasAddress: false,
    sourceCount: 0,
    coreFieldCount: 0,
    hasConflicts: false,
    userSkippedSources: false,
    reportReady: false,
  };
}

/** Collection-phase stages where we should not pretend a full report exists. */
export function isCollectingStage(stage: PropertyChatStage): boolean {
  return (
    stage === "address_received" ||
    stage === "awaiting_property_source" ||
    stage === "collecting_sources" ||
    stage === "extracting_data" ||
    stage === "awaiting_user_confirmation"
  );
}
