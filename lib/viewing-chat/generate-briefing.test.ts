import { describe, expect, it } from "vitest";
import {
  BriefingGenerateError,
  buildBriefingProse,
  classifyOpenAiBriefingError,
  cleanBriefingText,
  extractJsonObject,
  filterLayeredBriefingPoints,
  finalizeBriefingSummary,
  hostnameFromUrl,
  isBriefingGenerateError,
  parseBriefingPoints,
  prioritizePropertyFacts,
  shouldKeepBriefingPoint,
} from "./generate-briefing";

describe("classifyOpenAiBriefingError", () => {
  it("maps connection / DNS failures", () => {
    const err = Object.assign(new Error("Connection error."), {
      name: "APIConnectionError",
      cause: Object.assign(new Error("getaddrinfo EAI_AGAIN api.openai.com"), {
        code: "EAI_AGAIN",
      }),
    });
    expect(classifyOpenAiBriefingError(err)).toBe("openai_connection");
  });

  it("maps timeouts", () => {
    expect(classifyOpenAiBriefingError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(
      "openai_timeout",
    );
    expect(
      classifyOpenAiBriefingError(Object.assign(new Error("Request timed out"), { name: "TimeoutError" })),
    ).toBe("openai_timeout");
  });

  it("defaults other API errors to openai_upstream", () => {
    expect(classifyOpenAiBriefingError(Object.assign(new Error("429 rate"), { name: "APIError", status: 429 }))).toBe(
      "openai_upstream",
    );
  });

  it("BriefingGenerateError uses 504 only for timeout", () => {
    expect(new BriefingGenerateError("openai_timeout").status).toBe(504);
    expect(new BriefingGenerateError("openai_connection").status).toBe(502);
    expect(new BriefingGenerateError("openai_empty").status).toBe(502);
  });

  it("duck-types BriefingGenerateError without instanceof", () => {
    const err = new BriefingGenerateError("openai_empty");
    expect(isBriefingGenerateError(err)).toBe(true);
    expect(isBriefingGenerateError({ name: "BriefingGenerateError", code: "openai_empty", status: 502 })).toBe(
      true,
    );
    expect(isBriefingGenerateError(new Error("nope"))).toBe(false);
  });
});

describe("finalizeBriefingSummary", () => {
  it("keeps a non-empty JSON summary", () => {
    const out = finalizeBriefingSummary({
      summary: "這是一棟位於 Port Moody 的住宅，公園步行約 10 分。",
      researchText: "research memo unused",
      citationHosts: ["realtor.ca"],
      sources: ["realtor.ca"],
    });
    expect(out.usedResearchFallback).toBe(false);
    expect(out.summary).toContain("Port Moody");
    expect(out.sources).toEqual(["realtor.ca"]);
  });

  it("falls back to research text when JSON summary is empty", () => {
    const out = finalizeBriefingSummary({
      summary: "",
      researchText: "1167 Victory Drive is near Inlet Centre. Walk about 8 min to the SkyTrain.",
      citationHosts: ["google.com"],
      sources: [],
    });
    expect(out.usedResearchFallback).toBe(true);
    expect(out.summary).toMatch(/Victory Drive/i);
    expect(out.sources).toEqual(["google.com"]);
  });

  it("stays empty when both summary and research are blank", () => {
    const out = finalizeBriefingSummary({
      summary: "   ",
      researchText: "",
      citationHosts: ["google.com"],
    });
    expect(out.summary).toBe("");
    expect(out.usedResearchFallback).toBe(false);
  });
});

describe("generate-briefing parsers", () => {
  it("extracts JSON from fenced or prose wrappers", () => {
    const raw = '這裡是結果\n```json\n{"points":[{"text":"近公園","source":"example.com"}]}\n```\n';
    expect(extractJsonObject(raw)).toEqual({
      points: [{ text: "近公園", source: "example.com" }],
    });
  });

  it("maps turn0search sources to citation hostnames", () => {
    const points = parseBriefingPoints(
      [{ text: "近 SkyTrain", source: "turn0search1" }],
      ["angellhasman.ca", "guides.kenwongtoday.com"],
    );
    expect(points[0]?.source).toBe("angellhasman.ca");
  });

  it("keeps real hostnames and strips URL prefixes", () => {
    expect(hostnameFromUrl("https://www.realtor.ca/listing/1")).toBe("realtor.ca");
    const points = parseBriefingPoints([
      { text: "有掛牌資訊", source: "https://www.realtor.ca/foo" },
      { text: "社區背景", source: "社區公開資訊" },
    ]);
    expect(points[0]?.source).toBe("realtor.ca");
    expect(points[1]?.source).toBe("社區公開資訊");
  });

  it("prioritizes listing/doorplate facts over long amenity dumps", () => {
    const ranked = prioritizePropertyFacts(
      [
        { field: "poi.amenities", value: "many buses", source: "Google Places" },
        { field: "identity.doorplate", value: "2143", source: "BC Address Geocoder" },
        { field: "listing.beds", value: "3", source: "realtor.ca" },
      ],
      2,
    );
    expect(ranked.map((f) => f.field)).toEqual([
      "listing.beds",
      "identity.doorplate",
    ]);
  });

  it("strips markdown links and prefers the linked host", () => {
    const cleaned = cleanBriefingText(
      "市政府做了交通平緩 ([portmoody.ca](https://www.portmoody.ca/traffic/?utm_source=openai))",
    );
    expect(cleaned.text).toBe("市政府做了交通平緩 (portmoody.ca)");
    expect(cleaned.linkedHost).toBe("portmoody.ca");
    const points = parseBriefingPoints(
      [
        {
          text: "交通平緩措施。 ([portmoody.ca](https://www.portmoody.ca/traffic/))",
          source: "moovitapp.com",
        },
      ],
      ["moovitapp.com"],
    );
    expect(points[0]?.text).toContain("交通平緩措施");
    expect(points[0]?.text).not.toContain("](");
    expect(points[0]?.source).toBe("portmoody.ca");
  });

  it("drops vague lifestyle and neighbor-doorplate padding", () => {
    expect(shouldKeepBriefingPoint("生活機能完善，適合家庭", "2143")).toBe(false);
    expect(
      shouldKeepBriefingPoint(
        "鄰近的 2137 Spring Street 是一棟2019年建成的聯排，4房3浴",
        "2143",
      ),
    ).toBe(false);
    expect(
      shouldKeepBriefingPoint("Moody Centre 步行約 16 分", "2143"),
    ).toBe(true);
    expect(
      shouldKeepBriefingPoint("此門牌掛牌為 3 房 2 浴、1,352 sqft", "2143"),
    ).toBe(true);
  });

  it("builds a prose summary from model JSON and falls back from points", () => {
    const fromSummary = buildBriefingProse({
      parsed: {
        summary: "這是一棟 3 房聯排，Moody Centre 步行約 16 分。",
        sources: ["realtor.ca", "Google Places"],
      },
    });
    expect(fromSummary.summary).toContain("3 房");
    expect(fromSummary.sources).toEqual(["realtor.ca", "Google Places"]);

    const fromPoints = buildBriefingProse({
      parsed: {
        points: [
          { text: "掛牌 3 房 2 浴", source: "realtor.ca", layer: "property" },
          { text: "公園步行約 12 分", source: "Google Places", layer: "lifestyle" },
        ],
      },
      doorplate: "2143",
    });
    expect(fromPoints.summary).toContain("3 房");
    expect(fromPoints.summary).toContain("12 分");
    expect(fromPoints.sources).toContain("realtor.ca");
  });

  it("strips bullet markers from summary prose", () => {
    const built = buildBriefingProse({
      parsed: {
        summary: "- 第一點\n- 第二點 步行約 5 分",
        sources: ["Google Places"],
      },
    });
    expect(built.summary).not.toMatch(/^-/);
    expect(built.summary).toContain("步行約 5 分");
  });

  it("caps lifestyle points at two and keeps property points", () => {
    const filtered = filterLayeredBriefingPoints(
      [
        { text: "掛牌 3 房 2 浴", source: "realtor.ca", layer: "property" },
        { text: "管理費約 $300", source: "realtor.ca", layer: "property" },
        { text: "Seaview Park 步行約 12 分", source: "Google Places", layer: "lifestyle" },
        { text: "Moody Centre 步行約 16 分", source: "Google Places", layer: "lifestyle" },
        { text: "IGA 步行約 2 分", source: "Google Places", layer: "lifestyle" },
        { text: "生活機能完善", source: "公開網頁", layer: "lifestyle" },
      ],
      "2143",
    );
    expect(filtered.map((p) => p.text)).toEqual([
      "掛牌 3 房 2 浴",
      "管理費約 $300",
      "Seaview Park 步行約 12 分",
      "Moody Centre 步行約 16 分",
    ]);
  });
});
