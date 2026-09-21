import { searchPropertySnippets } from "@/lib/property-intel/bing-search";
import { makeEvidence, ttlHoursForLane } from "../evidence";
import { jurisdictionKey } from "../jurisdiction";
import type { Evidence, LaneContext } from "../types";

/**
 * Collect Bing snippets as public_web evidence only.
 * Never promotes snippet text into found fact fields (no LLM extract).
 */
export async function collectPublicWebEvidence(
  ctx: LaneContext,
): Promise<Evidence<string>[]> {
  const { snippets } = await searchPropertySnippets(ctx.normalizedQuery, ctx.region);
  const now = ctx.now;
  const ttl = ttlHoursForLane("public_web");
  return snippets.slice(0, 15).map((s, i) =>
    makeEvidence({
      lane: "listing",
      field: "public_web_snippet",
      value: `${s.title}: ${s.snippet}`.slice(0, 500),
      sourceType: "public_web",
      sourceId: jurisdictionKey(ctx.jurisdiction, "listing"),
      sourceLabel: "Bing Search",
      fetchedAt: now,
      ttlHours: ttl,
      matchLevel: "street",
      evidence: `${s.title}: ${s.snippet}`.slice(0, 500),
      limitations: "Search snippet only. Not a verified listing or official record.",
      rawRef: s.url || `bing:${i}`,
    }),
  );
}
