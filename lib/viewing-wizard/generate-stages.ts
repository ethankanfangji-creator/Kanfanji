export const GENERATE_STAGE_IDS = [
  "organize",
  "analyze",
  "summary",
  "build",
] as const;

export type GenerateStageId = (typeof GENERATE_STAGE_IDS)[number];

export function generateStageIndex(stage: GenerateStageId | null | undefined): number {
  if (!stage) return -1;
  return GENERATE_STAGE_IDS.indexOf(stage);
}

/** Whether `current` has reached or passed `target` in the generate pipeline. */
export function isGenerateStageReached(
  current: GenerateStageId | null | undefined,
  target: GenerateStageId,
): boolean {
  const currentIndex = generateStageIndex(current);
  const targetIndex = generateStageIndex(target);
  if (currentIndex < 0 || targetIndex < 0) return false;
  return currentIndex >= targetIndex;
}
