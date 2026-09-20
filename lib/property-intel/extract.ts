import OpenAI from "openai";
import type { BingSnippet } from "./bing-search";
import type { PropertyIntelBasic, PropertyIntelHistory } from "./types";

function parseYear(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1800 && raw < 2100) {
    return Math.round(raw);
  }
  if (typeof raw === "string") {
    const m = raw.match(/(18|19|20)\d{2}/);
    if (m) return Number(m[0]);
  }
  return null;
}

function parseNum(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const m = raw.replace(/,/g, "").match(/(\d+(\.\d+)?)/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Regex fallback when OpenAI is unavailable. */
export function extractFromSnippetsRegex(snippets: BingSnippet[]): {
  basic: Partial<PropertyIntelBasic>;
  history: Partial<PropertyIntelHistory>;
} {
  const blob = snippets.map((s) => `${s.title} ${s.snippet}`).join("\n");
  const year = parseYear(blob.match(/built\s*(in)?\s*(18|19|20)\d{2}|(18|19|20)\d{2}\s*built/i)?.[0]);
  const sold =
    blob.match(/sold\s*(for)?\s*\$[\d,.]+\s*(k|m)?/i)?.[0] ||
    blob.match(/\$[\d,.]+\s*(sold|sale)/i)?.[0] ||
    null;
  const assessed =
    blob.match(/assess(ed|ment)?[^$]{0,20}\$[\d,.]+/i)?.[0] ||
    blob.match(/\$[\d,.]+\s*assess/i)?.[0] ||
    null;
  const strata =
    blob.match(/strata[^$]{0,20}\$[\d,.]+(\s*\/\s*m(o|onth)?)?/i)?.[0] ||
    blob.match(/\$[\d,.]+\s*\/\s*mo(nth)?/i)?.[0] ||
    null;
  const beds = parseNum(blob.match(/(\d+)\s*(bed|br|bedroom)/i)?.[1]);
  const baths = parseNum(blob.match(/(\d+(\.\d+)?)\s*(bath|ba)/i)?.[1]);
  const area = parseNum(blob.match(/([\d,]+)\s*(sq\.?\s*ft|sqft|sf)/i)?.[1]);
  let type: string | null = null;
  if (/townhouse|townhome/i.test(blob)) type = "Townhouse";
  else if (/condo|apartment/i.test(blob)) type = "Condo";
  else if (/detached|single[\s-]family/i.test(blob)) type = "House";
  else if (/duplex/i.test(blob)) type = "Duplex";

  return {
    basic: {
      year,
      type,
      beds,
      baths,
      area: area != null ? Math.round(area) : null,
    },
    history: {
      last_sold: sold,
      assessed,
      strata,
    },
  };
}

/** LLM extract from search snippets only — no inventing beyond snippet text. */
export async function extractFromSnippetsWithAi(
  address: string,
  snippets: BingSnippet[],
  apiKey: string,
): Promise<{ basic: Partial<PropertyIntelBasic>; history: Partial<PropertyIntelHistory> }> {
  if (snippets.length === 0) return { basic: {}, history: {} };

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "Extract property facts ONLY from the provided search snippets. Never invent. Use null when not stated. Reply JSON only.",
        },
        {
          role: "user",
          content: `Address: ${address}

Snippets:
${snippets
  .slice(0, 8)
  .map((s, i) => `${i + 1}. ${s.title}\n${s.snippet}\n${s.url}`)
  .join("\n\n")}

Return:
{
  "year": number|null,
  "type": string|null,
  "beds": number|null,
  "baths": number|null,
  "area": number|null,
  "last_sold": string|null,
  "assessed": string|null,
  "strata": string|null
}`,
        },
      ],
    },
    { signal: AbortSignal.timeout(25_000) },
  );

  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return extractFromSnippetsRegex(snippets);
  }

  return {
    basic: {
      year: parseYear(parsed.year),
      type: typeof parsed.type === "string" ? parsed.type : null,
      beds: parseNum(parsed.beds),
      baths: parseNum(parsed.baths),
      area: parseNum(parsed.area),
    },
    history: {
      last_sold: typeof parsed.last_sold === "string" ? parsed.last_sold : null,
      assessed: typeof parsed.assessed === "string" ? parsed.assessed : null,
      strata: typeof parsed.strata === "string" ? parsed.strata : null,
    },
  };
}
