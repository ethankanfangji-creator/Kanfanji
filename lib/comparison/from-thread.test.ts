import { describe, expect, it } from "vitest";
import type { ChatMessage, ViewingChatThread } from "@/lib/viewing-chat/types";
import type { PropertyFieldState } from "@/lib/viewing-chat/collection/types";
import { emptyIntel } from "@/lib/property-intel/types";
import {
  COMPARE_ROW_KEYS,
  parseCompareIds,
  projectThreadForCompare,
  rowDiffers,
  type CompareCell,
} from "./from-thread";

function field(
  fieldId: string,
  value: PropertyFieldState["value"],
  status: PropertyFieldState["status"] = "confirmed",
  rawText = "",
): PropertyFieldState {
  return {
    fieldId,
    value,
    status,
    confidence: status === "inferred" ? 0.4 : 1,
    sourceMessageId: null,
    rawText,
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function thread(partial: Partial<ViewingChatThread> = {}): ViewingChatThread {
  return {
    id: "thread-a",
    address: "台北市松山區一號",
    normalizedAddress: "台北市松山區一號",
    createdAt: "2026-09-01T02:30:00.000Z",
    updatedAt: "2026-09-01T02:30:00.000Z",
    messages: [],
    report: null,
    metadata: null,
    ...partial,
  };
}

describe("projectThreadForCompare", () => {
  it("projects an address-only thread without throwing", () => {
    const column = projectThreadForCompare(thread());
    expect(column.rows.address.text).toBe("台北市松山區一號");
    expect(column.rows.viewedAt.text).toEqual(expect.any(String));
    expect(column.rows.viewedAt.text).not.toBe("");
    for (const key of COMPARE_ROW_KEYS) {
      if (key === "address" || key === "viewedAt") continue;
      expect(column.rows[key].text).toBeNull();
      expect(column.rows[key].list ?? []).toEqual([]);
    }
  });

  it("prefers collection fields and marks intel fallbacks", () => {
    const intel = emptyIntel("台北市松山區一號");
    intel.basic.area = 999;
    intel.basic.year = 1991;
    intel.basic.beds = 3;
    intel.basic.baths = 2;
    intel.market.priceRange = "行情 2000 萬";

    const column = projectThreadForCompare(
      thread({
        metadata: intel,
        propertyRecord: {
          mode: "collecting",
          updatedAt: "2026-09-01T00:00:00.000Z",
          fields: {
            area: field("area", "88坪"),
            price: field("price", null, "unknown"),
          },
        },
      }),
    );

    expect(column.rows.area).toMatchObject({ text: "88坪", provenance: "confirmed" });
    expect(column.rows.yearBuilt).toMatchObject({ text: "1991", provenance: "intel" });
    expect(column.rows.layout).toMatchObject({
      text: "3 房 2 衛",
      provenance: "intel",
    });
    expect(column.rows.price.text).toBeNull();
    expect(JSON.stringify(column.rows.price)).not.toContain("行情");
  });

  it("marks inferred fields and skipped fields", () => {
    const column = projectThreadForCompare(
      thread({
        collectionSkippedFields: ["floor"],
        propertyRecord: {
          mode: "collecting",
          updatedAt: "2026-09-01T00:00:00.000Z",
          fields: {
            floor: field("floor", "8樓"),
            noise: field("noise", "臨路有車聲", "inferred", "臨路有車聲"),
          },
        },
      }),
    );

    expect(column.rows.floor).toMatchObject({ text: null, skipped: true });
    expect(column.rows.noise).toMatchObject({
      text: "臨路有車聲",
      provenance: "inferred",
    });
  });

  it("does not read chat messages for price", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "user",
      type: "text",
      timestamp: "2026-09-01T00:00:00.000Z",
      text: "價格 999 萬",
      transcript: "價格 999 萬",
    };
    const column = projectThreadForCompare(thread({ messages: [message] }));
    expect(column.rows.price.text).toBeNull();
    expect(JSON.stringify(column.rows)).not.toContain("999");
  });

  it("does not use market price range as the asking price", () => {
    const intel = emptyIntel("台北市松山區一號");
    intel.market.priceRange = "1800–2200萬";
    const column = projectThreadForCompare(thread({ metadata: intel }));
    expect(column.rows.price.text).toBeNull();
  });
});

describe("rowDiffers", () => {
  it("is false when every cell is empty or only one cell has a value", () => {
    const empty: CompareCell = { text: null };
    const one: CompareCell = { text: "3房2廳" };
    expect(rowDiffers([empty, empty, empty])).toBe(false);
    expect(rowDiffers([one, empty])).toBe(false);
  });

  it("treats spacing, width, and list order as the same value", () => {
    expect(rowDiffers([{ text: "3房2廳" }, { text: "3 房 2 廳" }])).toBe(false);
    expect(
      rowDiffers([
        { text: null, list: ["學區乙", "學區甲"] },
        { text: null, list: ["學區甲", "學區乙"] },
      ]),
    ).toBe(false);
  });

  it("is true when normalized values differ", () => {
    expect(rowDiffers([{ text: "8樓" }, { text: "12樓" }])).toBe(true);
  });
});

describe("parseCompareIds", () => {
  it("trims, dedupes, drops illegal tokens, and keeps at most 3", () => {
    expect(parseCompareIds(" a, a , b ")).toEqual(["a", "b"]);
    expect(parseCompareIds("a,b,c,d")).toEqual(["a", "b", "c"]);
    expect(parseCompareIds("ok,bad id,also-ok")).toEqual(["ok", "also-ok"]);
    expect(parseCompareIds("only-one")).toEqual(["only-one"]);
    expect(parseCompareIds(`a,${"x".repeat(65)},b`)).toEqual(["a", "b"]);
    expect(parseCompareIds("")).toEqual([]);
    expect(parseCompareIds(null)).toEqual([]);
  });
});
