import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeRecordingAnswers, type MergeableQuestion } from "./merge-recording-answers.ts";

function q(
  id: number,
  text: string,
  extras: Partial<MergeableQuestion> = {},
): MergeableQuestion {
  return { id, text, checked: false, ...extras };
}

test("a later pending clip does not wipe answers from an earlier recording", () => {
  const afterFirstClip = [
    q(1, "屋頂何時更換？", { checked: true, answer: "2020 年換過" }),
    q(2, "漏水嗎？", { checked: false }),
  ];

  const merged = mergeRecordingAnswers(
    afterFirstClip,
    [
      { id: 1, status: "pending", answer: "" },
      { id: 2, status: "answered", answer: "廚房水槽附近有滲水" },
    ],
    [],
  );

  assert.equal(merged[0]?.answer, "2020 年換過");
  assert.equal(merged[0]?.checked, true);
  assert.equal(merged[1]?.answer, "廚房水槽附近有滲水");
  assert.equal(merged[1]?.checked, true);
});

test("pending placeholders must not overwrite a filled answer", () => {
  const current = [q(1, "車位？", { checked: true, answer: "兩個地下車位" })];
  const merged = mergeRecordingAnswers(
    current,
    [{ id: 1, status: "pending", answer: "待確認" }],
    [],
  );
  assert.equal(merged[0]?.answer, "兩個地下車位");
  assert.equal(merged[0]?.checked, true);
});

test("a later answered clip updates the same question", () => {
  const current = [q(1, "屋齡？", { checked: true, answer: "大概十年" })];
  const merged = mergeRecordingAnswers(
    current,
    [{ id: 1, status: "answered", answer: "2014 年建成" }],
    [],
  );
  assert.equal(merged[0]?.answer, "2014 年建成");
  assert.equal(merged[0]?.checked, true);
});

test("empty answered payloads are ignored so they cannot blank a field", () => {
  const current = [q(1, "管理費？", { checked: true, answer: "每月 350" })];
  const merged = mergeRecordingAnswers(
    current,
    [{ id: 1, status: "answered", answer: "   " }],
    [],
  );
  assert.equal(merged[0]?.answer, "每月 350");
});

test("new follow-ups are appended without duplicating existing text", () => {
  const current = [q(1, "屋頂何時更換？", { checked: true, answer: "2020" })];
  const merged = mergeRecordingAnswers(current, [], [
    { text: "屋頂何時更換？", status: "pending", answer: "待確認" },
    { text: "有沒有保固文件？", status: "pending", answer: "", based_on: "提到保固" },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.text, "有沒有保固文件？");
  assert.equal(merged[1]?.isFollowUp, true);
  assert.equal(merged[1]?.basedOn, "提到保固");
  assert.equal(merged[1]?.checked, false);
});
