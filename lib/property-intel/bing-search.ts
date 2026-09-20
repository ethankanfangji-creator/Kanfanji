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
    null
  );
}

async function bingSearch(query: string, key: string): Promise<BingSnippet[]> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("mkt", "en-CA");
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
export async function searchPropertySnippets(address: string): Promise<{
  snippets: BingSnippet[];
  sources: string[];
}> {
  const key = bingKey();
  if (!key) return { snippets: [], sources: [] };

  try {
    const queries = [`${address} BC Assessment`, `${address} realtor.ca`];
    const batches = await Promise.all(queries.map((q) => bingSearch(q, key)));
    return {
      snippets: batches.flat(),
      sources: ["Bing Search"],
    };
  } catch {
    return { snippets: [], sources: [] };
  }
}
