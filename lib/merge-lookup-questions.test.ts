import { describe, expect, it } from "vitest";
import {
  mergeQuestionBankOnAddressLookup,
  shouldPreserveLookupQuestions,
  type LookupQuestion,
} from "./merge-lookup-questions";

function q(id: number, text: string, extras: Partial<LookupQuestion> = {}): LookupQuestion {
  return { id, text, checked: false, ...extras };
}

const caBank = [
  q(1, "屋頂何時更換？"),
  q(2, "有沒有漏水？"),
  q(3, "管理費多少？"),
];

describe("shouldPreserveLookupQuestions", () => {
  it("same propertyId after an identified lookup must preserve answers", () => {
    expect(
      shouldPreserveLookupQuestions({
        wasIdentified: true,
        previousPropertyId: "prop-1",
        nextPropertyId: "prop-1",
        previousAddress: "1200 Westwood St",
        nextAddress: "1200 Westwood Street, Coquitlam",
      }),
    ).toBe(true);
  });

  it("a different propertyId must not preserve answers from the previous house", () => {
    expect(
      shouldPreserveLookupQuestions({
        wasIdentified: true,
        previousPropertyId: "prop-1",
        nextPropertyId: "prop-2",
        previousAddress: "1200 Westwood St",
        nextAddress: "88 Kingsway",
      }),
    ).toBe(false);
  });

  it("first lookup (not yet identified) refreshes the bank", () => {
    expect(
      shouldPreserveLookupQuestions({
        wasIdentified: false,
        previousPropertyId: null,
        nextPropertyId: "prop-1",
        previousAddress: "1200 Westwood St",
        nextAddress: "1200 Westwood Street, Coquitlam",
      }),
    ).toBe(false);
  });

  it("without property ids, a formatted-address match still counts as the same house", () => {
    expect(
      shouldPreserveLookupQuestions({
        wasIdentified: true,
        previousPropertyId: null,
        nextPropertyId: null,
        previousAddress: "  1200 Westwood St ",
        nextAddress: "1200   Westwood St",
      }),
    ).toBe(true);
  });

  it("re-search after the identified flag was cleared still preserves the committed address", () => {
    expect(
      shouldPreserveLookupQuestions({
        wasIdentified: false,
        previousPropertyId: null,
        nextPropertyId: null,
        previousAddress: "1200 Westwood St",
        nextAddress: "1200   Westwood St",
      }),
    ).toBe(true);
  });

  it("an empty committed address is a first lookup even if the query matches itself", () => {
    expect(
      shouldPreserveLookupQuestions({
        wasIdentified: false,
        previousPropertyId: null,
        nextPropertyId: null,
        previousAddress: "   ",
        nextAddress: "1200 Westwood St",
      }),
    ).toBe(false);
  });
});

describe("mergeQuestionBankOnAddressLookup", () => {
  it("re-looking-up the same property keeps recorded answers, checks, and follow-ups", () => {
    const current = [
      q(1, "屋頂何時更換？", { checked: true, answer: "2020 年換過" }),
      q(2, "有沒有漏水？", { checked: true }),
      q(10, "保固文件在哪？", { isFollowUp: true, answer: "待確認" }),
      q(11, "電箱安培數？", { isDynamic: true }),
    ];

    const merged = mergeQuestionBankOnAddressLookup(current, caBank, true);

    expect(merged.find((item) => item.id === 1)?.answer).toBe("2020 年換過");
    expect(merged.find((item) => item.id === 1)?.checked).toBe(true);
    expect(merged.find((item) => item.id === 2)?.checked).toBe(true);
    expect(merged.find((item) => item.id === 10)?.text).toBe("保固文件在哪？");
    expect(merged.find((item) => item.id === 11)?.isDynamic).toBe(true);
    expect(merged.find((item) => item.text === "管理費多少？")?.id).toBe(3);
    expect(merged.filter((item) => item.text === "屋頂何時更換？")).toHaveLength(1);
  });

  it("looking up a different property drops answers but keeps photo questions", () => {
    const current = [
      q(1, "屋頂何時更換？", { checked: true, answer: "2020 年換過" }),
      q(10, "保固文件在哪？", { isFollowUp: true, answer: "待確認" }),
      q(11, "電箱安培數？", { isDynamic: true }),
    ];

    const merged = mergeQuestionBankOnAddressLookup(current, caBank, false);

    expect(merged.find((item) => item.text === "屋頂何時更換？")?.answer).toBeUndefined();
    expect(merged.some((item) => item.isFollowUp)).toBe(false);
    expect(merged.find((item) => item.id === 11)?.isDynamic).toBe(true);
    expect(merged.find((item) => item.text === "有沒有漏水？")?.id).toBe(2);
  });

  it("bank ids that collide with kept follow-ups are reassigned", () => {
    const current = [q(2, "現況跟照片一樣嗎？", { isFollowUp: true, answer: "待確認" })];
    const merged = mergeQuestionBankOnAddressLookup(current, caBank, true);
    const ids = merged.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(merged.find((item) => item.text === "現況跟照片一樣嗎？")?.id).toBe(2);
    expect(merged.find((item) => item.text === "有沒有漏水？")?.id).not.toBe(2);
  });
});
