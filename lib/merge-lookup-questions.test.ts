import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeQuestionBankOnAddressLookup,
  shouldPreserveLookupQuestions,
  type LookupQuestion,
} from "./merge-lookup-questions.ts";

function q(
  id: number,
  text: string,
  extras: Partial<LookupQuestion> = {},
): LookupQuestion {
  return { id, text, checked: false, ...extras };
}

const caBank = [
  q(1, "屋頂何時更換？"),
  q(2, "有沒有漏水？"),
  q(3, "管理費多少？"),
];

test("same propertyId after an identified lookup must preserve answers", () => {
  assert.equal(
    shouldPreserveLookupQuestions({
      wasIdentified: true,
      previousPropertyId: "prop-1",
      nextPropertyId: "prop-1",
      previousAddress: "1200 Westwood St",
      nextAddress: "1200 Westwood Street, Coquitlam",
    }),
    true,
  );
});

test("a different propertyId must not preserve answers from the previous house", () => {
  assert.equal(
    shouldPreserveLookupQuestions({
      wasIdentified: true,
      previousPropertyId: "prop-1",
      nextPropertyId: "prop-2",
      previousAddress: "1200 Westwood St",
      nextAddress: "88 Kingsway",
    }),
    false,
  );
});

test("first lookup (not yet identified) refreshes the bank", () => {
  assert.equal(
    shouldPreserveLookupQuestions({
      wasIdentified: false,
      previousPropertyId: null,
      nextPropertyId: "prop-1",
      previousAddress: "1200 Westwood St",
      nextAddress: "1200 Westwood Street, Coquitlam",
    }),
    false,
  );
});

test("without property ids, a formatted-address match still counts as the same house", () => {
  assert.equal(
    shouldPreserveLookupQuestions({
      wasIdentified: true,
      previousPropertyId: null,
      nextPropertyId: null,
      previousAddress: "  1200 Westwood St ",
      nextAddress: "1200   Westwood St",
    }),
    true,
  );
});

test("re-looking-up the same property keeps recorded answers and follow-ups", () => {
  const current = [
    q(1, "屋頂何時更換？", { checked: true, answer: "2020 年換過" }),
    q(2, "有沒有漏水？"),
    q(10, "保固文件在哪？", { isFollowUp: true, answer: "待確認" }),
    q(11, "電箱安培數？", { isDynamic: true }),
  ];

  const merged = mergeQuestionBankOnAddressLookup(current, caBank, true);

  assert.equal(merged.find((item) => item.id === 1)?.answer, "2020 年換過");
  assert.equal(merged.find((item) => item.id === 1)?.checked, true);
  assert.equal(merged.find((item) => item.id === 10)?.text, "保固文件在哪？");
  assert.equal(merged.find((item) => item.id === 11)?.isDynamic, true);
  assert.equal(merged.find((item) => item.text === "管理費多少？")?.id, 3);
  assert.equal(merged.filter((item) => item.text === "屋頂何時更換？").length, 1);
});

test("looking up a different property drops answers but keeps photo questions", () => {
  const current = [
    q(1, "屋頂何時更換？", { checked: true, answer: "2020 年換過" }),
    q(10, "保固文件在哪？", { isFollowUp: true, answer: "待確認" }),
    q(11, "電箱安培數？", { isDynamic: true }),
  ];

  const merged = mergeQuestionBankOnAddressLookup(current, caBank, false);

  assert.equal(merged.find((item) => item.text === "屋頂何時更換？")?.answer, undefined);
  assert.equal(merged.some((item) => item.isFollowUp), false);
  assert.equal(merged.find((item) => item.id === 11)?.isDynamic, true);
  assert.equal(merged.find((item) => item.text === "有沒有漏水？")?.id, 2);
});

test("bank ids that collide with kept follow-ups are reassigned", () => {
  const current = [q(2, "現況跟照片一樣嗎？", { isFollowUp: true, answer: "待確認" })];
  const merged = mergeQuestionBankOnAddressLookup(current, caBank, true);
  const ids = merged.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(merged.find((item) => item.text === "現況跟照片一樣嗎？")?.id, 2);
  assert.ok(merged.find((item) => item.text === "有沒有漏水？")?.id !== 2);
});
