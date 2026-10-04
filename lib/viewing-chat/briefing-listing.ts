import { requestListingExtract } from "@/lib/listing-extract";
import type { BriefingFoundFact } from "@/lib/viewing-chat/briefing-facts";
import { fetchAndExtractListingUrl } from "@/lib/property-source/fetch-listing-url";

export type BriefingListingExtract = {
  facts: BriefingFoundFact[];
  sourceHost: string;
  ok: boolean;
};

function listingHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "listing";
  }
}

function pushFact(
  facts: BriefingFoundFact[],
  field: string,
  value: string | number | null | undefined,
  source: string,
) {
  if (value == null) return;
  const text = String(value).trim();
  if (!text) return;
  facts.push({ field, value: text.slice(0, 240), source });
}

/**
 * Fetch a user-pasted listing URL and extract beds/baths/sqft/year/strata for briefing.
 * Soft-fails to empty facts when the page blocks fetch (still returns hostname).
 */
export async function extractBriefingListingFacts(args: {
  listingUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<BriefingListingExtract> {
  const listingUrl = args.listingUrl.trim();
  const sourceHost = listingHostname(listingUrl);
  if (!/^https?:\/\//i.test(listingUrl)) {
    return { facts: [], sourceHost, ok: false };
  }

  try {
    const fetched = await fetchAndExtractListingUrl(listingUrl);
    if (!fetched.ok) {
      return { facts: [], sourceHost, ok: false };
    }
    const extracted = await requestListingExtract({
      text: fetched.extractedText,
      sourceUrl: fetched.sourceUrl,
      apiKey: args.apiKey,
    });
    const source = fetched.publisher || sourceHost || "listing";
    const facts: BriefingFoundFact[] = [];
    pushFact(facts, "listing.price", extracted.price, source);
    pushFact(facts, "listing.beds", extracted.beds, source);
    pushFact(facts, "listing.baths", extracted.baths, source);
    pushFact(facts, "listing.sqft", extracted.sqft, source);
    pushFact(facts, "listing.year", extracted.year, source);
    pushFact(facts, "listing.strata", extracted.strata, source);
    pushFact(facts, "listing.type", extracted.type, source);
    pushFact(facts, "listing.url", listingUrl, source);
    return { facts, sourceHost: source, ok: facts.length > 0 };
  } catch {
    return { facts: [], sourceHost, ok: false };
  }
}
