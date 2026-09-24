import { describe, expect, it } from "vitest";
import { mergeRecordingAnswers, type MergeableQuestion } from "./merge-recording-answers";

function q(
  id: number,
  text: string,
  extras: Partial<MergeableQuestion> = {},
): MergeableQuestion {
  return { id, text, checked: false, ...extras };
}

describe("mergeRecordingAnswers", () => {
  it("a later pending clip does not wipe answers from an earlier recording", () => {
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

    expect(merged[0]?.answer).toBe("2020 年換過");
    expect(merged[0]?.checked).toBe(true);
    expect(merged[1]?.answer).toBe("廚房水槽附近有滲水");
    expect(merged[1]?.checked).toBe(true);
  });

  it("pending placeholders must not overwrite a filled answer", () => {
    const current = [q(1, "車位？", { checked: true, answer: "兩個地下車位" })];
    const merged = mergeRecordingAnswers(
      current,
      [{ id: 1, status: "pending", answer: "待確認" }],
      [],
    );
    expect(merged[0]?.answer).toBe("兩個地下車位");
    expect(merged[0]?.checked).toBe(true);
  });

  it("a later answered clip updates the same question", () => {
    const current = [q(1, "屋齡？", { checked: true, answer: "大概十年" })];
    const merged = mergeRecordingAnswers(
      current,
      [{ id: 1, status: "answered", answer: "2014 年建成" }],
      [],
    );
    expect(merged[0]?.answer).toBe("2014 年建成");
    expect(merged[0]?.checked).toBe(true);
  });

  it("empty answered payloads are ignored so they cannot blank a field", () => {
    const current = [q(1, "管理費？", { checked: true, answer: "每月 350" })];
    const merged = mergeRecordingAnswers(
      current,
      [{ id: 1, status: "answered", answer: "   " }],
      [],
    );
    expect(merged[0]?.answer).toBe("每月 350");
  });

  it("new follow-ups are appended without duplicating existing text", () => {
    const current = [q(1, "屋頂何時更換？", { checked: true, answer: "2020" })];
    const merged = mergeRecordingAnswers(current, [], [
      { text: "屋頂何時更換？", status: "pending", answer: "待確認" },
      { text: "有沒有保固文件？", status: "pending", answer: "", based_on: "提到保固" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.text).toBe("有沒有保固文件？");
    expect(merged[1]?.isFollowUp).toBe(true);
    expect(merged[1]?.basedOn).toBe("提到保固");
    expect(merged[1]?.checked).toBe(false);
    expect(merged[1]?.isDynamic).toBe(true);
    expect(merged[1]?.source).toBe("audio");
  });
});
