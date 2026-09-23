import type { BingSnippet } from "./bing-search";
import type { PropertyIntelMarket, PropertyIntelNeighborhood } from "./types";

/**
 * Taiwan market / neighborhood hints from search snippets only.
 * Full MOI 實價登錄 API needs separate gov credentials; we extract ranges from public snippets.
 */
export function extractTwMarketFromSnippets(snippets: BingSnippet[]): {
  market: Partial<PropertyIntelMarket>;
  neighborhood: Partial<PropertyIntelNeighborhood>;
} {
  const blob = snippets.map((s) => `${s.title} ${s.snippet}`).join("\n");
  const unit =
    blob.match(/([\d,.]+)\s*萬\s*\/?\s*坪/)?.[0] ||
    blob.match(/單價[^\d]{0,6}([\d,.]+)\s*萬/)?.[0] ||
    null;
  const total =
    blob.match(/總價[^\d]{0,6}([\d,.]+)\s*萬/)?.[0] ||
    blob.match(/成交[^\d]{0,6}([\d,.]+)\s*萬/)?.[0] ||
    null;
  const builder =
    blob.match(/建商[：:\s]*([^\s,，。；;]{2,20})/)?.[1] ||
    blob.match(/建設[：:\s]*([^\s,，。；;]{2,20})/)?.[1] ||
    null;
  const amenityRatio = blob.match(/公設比[^\d]{0,4}([\d.]+)\s*%/)?.[0] || null;
  const community =
    blob.match(/([\u4e00-\u9fff]{2,12}(社區|大樓|花園|廣場|邸|苑))/)?.[1] || null;

  const notes: string[] = [];
  if (amenityRatio) notes.push(amenityRatio);
  if (builder) notes.push(`建商 ${builder}`);

  return {
    market: {
      region: "TW",
      currency: "TWD",
      avgUnitPrice: unit,
      priceRange: total,
    },
    neighborhood: {
      name: community,
      builder,
      amenityRatio,
      notes,
    },
  };
}

export function extractNeighborhoodFromSnippets(snippets: BingSnippet[]): Partial<PropertyIntelNeighborhood> {
  const blob = snippets.map((s) => `${s.title} ${s.snippet}`).join("\n");
  const builder =
    blob.match(/developer[：:\s]*([A-Za-z0-9 &.-]{2,40})/i)?.[1] ||
    blob.match(/built by[：:\s]*([A-Za-z0-9 &.-]{2,40})/i)?.[1] ||
    blob.match(/建商[：:\s]*([^\s,，。；;]{2,20})/)?.[1] ||
    null;
  const strataPlan = blob.match(/strata plan[：:\s#]*([A-Z0-9-]+)/i)?.[1] || null;
  const notes: string[] = [];
  if (strataPlan) notes.push(`Strata plan ${strataPlan}`);
  if (/rain.?screen|leaky condo/i.test(blob)) notes.push("社區提及雨幕／漏水議題");
  return {
    builder,
    notes,
  };
}
