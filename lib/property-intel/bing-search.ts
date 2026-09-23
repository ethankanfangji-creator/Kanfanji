export type BingSnippet = {
  title: string;
  snippet: string;
  url: string;
  query: string;
};

function bingKey(): string | null {
  return (
    process.env.BING_SEARCH_API_KEY?.trim() ||
    process.env.BING_API_KEY?.trim() ||
    process.env.GOOGLE_SEARCH_API_KEY?.trim() ||
    null
  );
}

async function bingSearch(query: string, key: string, mkt: string): Promise<BingSnippet[]> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("mkt", mkt);
  url.searchParams.set("responseFilter", "Webpages");

  const res = await fetch(url.toString(), {
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    webPages?: { value?: Array<{ name?: string; snippet?: string; url?: string }> };
  };
  return (data.webPages?.value ?? []).map((row) => ({
    title: row.name ?? "",
    snippet: row.snippet ?? "",
    url: row.url ?? "",
    query,
  }));
}

/** Bing Web Search snippets only — no page crawling. */
export async function searchPropertySnippets(
  address: string,
  region: "CA" | "TW" | "US" | "OTHER" | null,
): Promise<{
  snippets: BingSnippet[];
  sources: string[];
}> {
  const key = bingKey();
  if (!key) return { snippets: [], sources: [] };

  const mkt = region === "TW" ? "zh-TW" : region === "US" ? "en-US" : "en-CA";
  const queries =
    region === "TW"
      ? [
          `${address} 實價登錄`,
          `${address} 建商 公設比`,
          `${address} 社區評價`,
        ]
      : region === "US"
        ? [`${address} Zillow`, `${address} Redfin sold`, `${address} property tax assessed`]
        : [
            `${address} BC Assessment`,
            `${address} realtor.ca`,
            `${address} strata fees reviews`,
          ];

  try {
    const batches = await Promise.all(queries.map((q) => bingSearch(q, key, mkt)));
    return {
      snippets: batches.flat(),
      sources: ["Bing Search"],
    };
  } catch {
    return { snippets: [], sources: [] };
  }
}
