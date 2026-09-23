import { describe, expect, it } from "vitest";
import {
  createEmptyPropertyRecord,
  extractPropertyFacts,
  getNextQuestions,
  mergePropertyFacts,
} from "./index";

describe("extractPropertyFacts", () => {
  it("extracts address, layout, price, pros, and cons from one paragraph", () => {
    const text =
      "地址：台北市大安區信義路四段 100 號。格局 3房2廳，開價 1280 萬。" +
      "優點：採光不錯、近公園。缺點：屋齡偏老、無車位。";

    const result = extractPropertyFacts({
      text,
      messageId: "msg_rich",
    });

    expect(result.intent).toBe("provide_info");
    const byId = Object.fromEntries(result.fields.map((f) => [f.fieldId, f]));

    expect(byId.address?.value).toMatch(/大安區信義路/);
    expect(byId.address?.status).toBe("confirmed");
    expect(byId.address?.sourceMessageId).toBe("msg_rich");
    expect(byId.address?.rawText.length).toBeGreaterThan(0);

    expect(byId.layout?.value).toMatch(/3房2廳/);
    expect(byId.layout?.status).toBe("confirmed");

    expect(byId.price?.value).toBe(12_800_000);
    expect(byId.price?.status).toBe("confirmed");
    expect(byId.price?.rawText).toMatch(/1280\s*萬/);

    expect(byId.pros?.rawText).toMatch(/優點|採光/);
    expect(byId.cons?.rawText).toMatch(/缺點|屋齡/);

    for (const field of result.fields) {
      expect(["confirmed", "inferred", "unknown", "corrected"]).toContain(
        field.status,
      );
      expect(field).toHaveProperty("confidence");
      expect(field).toHaveProperty("sourceMessageId");
      expect(field).toHaveProperty("rawText");
    }
  });

  it("accepts multimodal capture shape without inventing listing numbers from analysis", () => {
    const result = extractPropertyFacts({
      text: "客廳看起來還行",
      messageId: "msg_photo",
      captures: [
        {
          kind: "photo",
          messageId: "msg_photo",
          analysis: "Looks like ~35 ping and asking price around 1500万",
        },
      ],
    });

    expect(result.fields.find((f) => f.fieldId === "area")).toBeUndefined();
    expect(result.fields.find((f) => f.fieldId === "price")).toBeUndefined();
  });

  it("keeps vague transit wording and does not over-infer walk minutes", () => {
    const result = extractPropertyFacts({
      text: "離捷運不遠，附近生活機能還可以。",
      messageId: "msg_vague",
    });

    const transit = result.fields.find((f) => f.fieldId === "transit");
    expect(transit).toBeDefined();
    expect(transit?.value).toMatch(/離捷運不遠/);
    expect(transit?.rawText).toMatch(/離捷運不遠/);
    expect(String(transit?.value)).not.toMatch(/5\s*分鐘|步行/);
    expect(result.fields.every((f) => !/步行\s*5/.test(String(f.value)))).toBe(
      true,
    );
  });

  it("detects mid-answer noise supplement while talking about area", () => {
    const result = extractPropertyFacts({
      text: "坪數我再量，不過陽台外有高架很吵。",
      messageId: "msg_noise",
    });

    const noise = result.fields.find((f) => f.fieldId === "noise");
    expect(noise).toBeDefined();
    expect(noise?.rawText).toMatch(/高架|吵/);
    expect(noise?.status).toBe("confirmed");
    // No fabricated area number
    const area = result.fields.find((f) => f.fieldId === "area");
    expect(area?.value == null || area?.status === "unknown").toBe(true);
  });

  it("classifies 整理一下 as request_summary", () => {
    const result = extractPropertyFacts({
      text: "整理一下",
      messageId: "msg_wrap",
    });
    expect(result.intent).toBe("request_summary");
  });

  it("marks area unknown when user skips ping", () => {
    const result = extractPropertyFacts({
      text: "坪數我不知道，之後再補。",
      messageId: "msg_skip_area",
    });

    expect(result.skippedFieldIds).toContain("area");
    expect(result.intent).toBe("defer_skip");
    const area = result.fields.find((f) => f.fieldId === "area");
    expect(area?.status).toBe("unknown");
    expect(area?.value).toBeNull();
  });

  it("extracts price corrections as corrected status", () => {
    const result = extractPropertyFacts({
      text: "不是 1280，是 1250 萬",
      messageId: "msg_fix_price",
    });

    const price = result.fields.find((f) => f.fieldId === "price");
    expect(price?.status).toBe("corrected");
    expect(price?.value).toBe(12_500_000);
    expect(result.intent).toBe("correct");
  });
});

describe("mergePropertyFacts", () => {
  it("applies user price correction over the old value and records correction evidence", () => {
    let record = createEmptyPropertyRecord();
    const first = extractPropertyFacts({
      text: "開價 1280 萬",
      messageId: "m1",
    });
    let merged = mergePropertyFacts(record, first.fields);
    record = merged.record;

    expect(record.fields.price?.value).toBe(12_800_000);

    const correction = extractPropertyFacts({
      text: "不是 1280，是 1250 萬",
      messageId: "m2",
    });
    merged = mergePropertyFacts(record, correction.fields, {
      evidence: merged.evidence,
    });

    expect(merged.record.fields.price?.value).toBe(12_500_000);
    expect(merged.record.fields.price?.status).toBe("corrected");
    expect(merged.conflicts.some((c) => c.kind === "correction")).toBe(true);
    const corr = merged.conflicts.find((c) => c.kind === "correction");
    expect(corr?.previousValue).toBe(12_800_000);
    expect(corr?.incomingValue).toBe(12_500_000);
  });

  it("does not silently overwrite conflicting confirmed values", () => {
    let record = createEmptyPropertyRecord();
    const a = extractPropertyFacts({ text: "開價 1280 萬", messageId: "a" });
    let merged = mergePropertyFacts(record, a.fields);
    record = merged.record;

    // Different confirmed price without correction phrasing
    const b = extractPropertyFacts({ text: "開價 1500 萬", messageId: "b" });
    merged = mergePropertyFacts(record, b.fields, { evidence: merged.evidence });

    expect(merged.record.fields.price?.value).toBe(12_800_000);
    expect(merged.record.fields.price?.hasConflict).toBe(true);
    expect(merged.conflicts.some((c) => c.kind === "conflict")).toBe(true);
  });

  it("merges sudden noise supplement without dropping prior layout", () => {
    let record = createEmptyPropertyRecord();
    const layout = extractPropertyFacts({
      text: "格局 2房1廳",
      messageId: "m1",
    });
    let merged = mergePropertyFacts(record, layout.fields);
    record = merged.record;

    const noise = extractPropertyFacts({
      text: "對了陽台外有高架很吵",
      messageId: "m2",
    });
    merged = mergePropertyFacts(record, noise.fields, {
      evidence: merged.evidence,
    });

    expect(merged.record.fields.layout?.value).toMatch(/2房1廳/);
    expect(merged.record.fields.noise?.rawText).toMatch(/高架|吵/);
  });
});

describe("getNextQuestions", () => {
  it("returns at most three questions ranked by importance and gaps", () => {
    const record = createEmptyPropertyRecord();
    const qs = getNextQuestions(record, [], []);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(3);
    expect(qs.every((q) => q.skippable)).toBe(true);
    // Highest importance among catalog gaps should lead
    expect(qs[0]?.fieldId).toBe("address");
    expect(qs[1]?.priority).toBeLessThanOrEqual(qs[0]!.priority);
  });

  it("omits skipped area and still returns other gaps", () => {
    const record = createEmptyPropertyRecord({
      fields: {
        address: {
          fieldId: "address",
          value: "台北市大安區信義路四段100號",
          status: "confirmed",
          confidence: 0.9,
          sourceMessageId: "m1",
          rawText: "地址：台北市大安區信義路四段100號",
          updatedAt: new Date().toISOString(),
        },
        price: {
          fieldId: "price",
          value: 12_800_000,
          status: "confirmed",
          confidence: 0.9,
          sourceMessageId: "m1",
          rawText: "1280萬",
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const qs = getNextQuestions(record, [], ["area"]);
    expect(qs.every((q) => q.fieldId !== "area")).toBe(true);
    expect(qs.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when user asks to wrap up (confirming mode)", () => {
    const extracted = extractPropertyFacts({ text: "整理一下" });
    expect(extracted.intent).toBe("request_summary");

    const record = createEmptyPropertyRecord({ mode: "confirming" });
    const qs = getNextQuestions(record, [], []);
    expect(qs).toEqual([]);
  });

  it("allows empty array when major fields are already filled", () => {
    const filled = createEmptyPropertyRecord({
      fields: Object.fromEntries(
        [
          "address",
          "price",
          "area",
          "layout",
          "floor",
          "noise",
          "odor",
          "water_damage",
          "transit",
          "pros",
          "cons",
          "light",
          "parking",
          "amenities",
        ].map((fieldId) => [
          fieldId,
          {
            fieldId,
            value: "ok",
            status: "confirmed" as const,
            confidence: 0.9,
            sourceMessageId: "m",
            rawText: "ok",
            updatedAt: new Date().toISOString(),
          },
        ]),
      ),
    });

    expect(getNextQuestions(filled, [], [])).toEqual([]);
  });

  it("still asks about noise when user filled area mid-turn with a noise note", () => {
    const extracted = extractPropertyFacts({
      text: "大概 28 坪，陽台外有高架很吵",
      messageId: "m",
    });
    const merged = mergePropertyFacts(createEmptyPropertyRecord(), extracted.fields);
    // Address/price still missing — noise should be filled so not re-asked
    const qs = getNextQuestions(merged.record, merged.evidence, []);
    expect(qs.every((q) => q.fieldId !== "noise")).toBe(true);
    expect(merged.record.fields.noise?.status).toBe("confirmed");
    expect(qs.length).toBeLessThanOrEqual(3);
  });
});

describe("pipeline integration", () => {
  it("runs extract → merge → next questions for a realistic turn sequence", () => {
    let record = createEmptyPropertyRecord();
    let evidence = mergePropertyFacts(record, []).evidence;

    const turn1 = extractPropertyFacts({
      text:
        "地址在台北市中山區南京東路一段 80 號，兩房一廳，開價 980 萬。" +
        "優點是近商場，缺點是公設偏舊。離捷運不遠。",
      messageId: "t1",
    });
    let merged = mergePropertyFacts(record, turn1.fields, { evidence });
    record = merged.record;
    evidence = merged.evidence;

    expect(record.fields.transit?.value).toMatch(/離捷運不遠/);
    expect(String(record.fields.transit?.value)).not.toMatch(/5\s*分鐘/);

    const skipArea = extractPropertyFacts({
      text: "坪數跳過，之後再補",
      messageId: "t2",
    });
    merged = mergePropertyFacts(record, skipArea.fields, { evidence });
    record = merged.record;
    evidence = merged.evidence;

    let qs = getNextQuestions(record, evidence, skipArea.skippedFieldIds);
    expect(qs.every((q) => q.fieldId !== "area")).toBe(true);

    const noiseAside = extractPropertyFacts({
      text: "對了窗邊車流很吵",
      messageId: "t3",
    });
    merged = mergePropertyFacts(record, noiseAside.fields, { evidence });
    record = merged.record;
    evidence = merged.evidence;
    expect(record.fields.noise?.rawText).toMatch(/吵/);

    const wrap = extractPropertyFacts({ text: "先這樣，整理一下" });
    expect(wrap.intent).toBe("request_summary");
    record = { ...record, mode: "confirming" };
    qs = getNextQuestions(record, evidence, skipArea.skippedFieldIds);
    expect(qs).toEqual([]);
  });
});
