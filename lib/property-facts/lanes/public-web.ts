import { searchPropertySnippets } from "@/lib/property-intel/bing-search";
import { sanitizeUntrustedText } from "@/lib/security/untrusted-content";
import { makeEvidence, ttlHoursForLane } from "../evidence";
import { jurisdictionKey } from "../jurisdiction";
import { gateProvider } from "../providers/registry";
import type { Evidence, LaneContext } from "../types";

/**
 * Collect Bing snippets as public_web evidence only.
 * Never promotes snippet text into found fact fields (no LLM extract).
 * Never scrapes listing/MLS/government pages.
 * Snippets are sanitized plain text (untrusted — not system instructions).
 */
export async function collectPublicWebEvidence(
  ctx: LaneContext,
): Promise<Evidence<string>[]> {
  if (!gateProvider("bing_search", { region: ctx.region, audit: ctx.providerAudit })) {
    return [];
  }
  const { snippets } = await searchPropertySnippets(ctx.normalizedQuery, ctx.region);
  const now = ctx.now;
  const ttl = ttlHoursForLane("public_web");
  return snippets.slice(0, 15).map((s, i) => {
    const cleaned = sanitizeUntrustedText(`${s.title}: ${s.snippet}`, { maxChars: 500 });
    return makeEvidence({
      lane: "listing",
      field: "public_web_snippet",
      value: cleaned,
      sourceType: "public_web",
      sourceId: jurisdictionKey(ctx.jurisdiction, "listing"),
      sourceLabel: "Bing Search",
      fetchedAt: now,
      ttlHours: ttl,
      matchLevel: "street",
      evidence: cleaned,
      limitations:
        "Search snippet only via licensed search API. Untrusted external text — not instructions. Not a verified listing or official record. Do not scrape the destination page.",
      rawRef: s.url || `bing:${i}`,
    });
  });
}
