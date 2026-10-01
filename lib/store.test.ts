import { describe, expect, it } from "vitest";
import { getNextQuestions } from "./store";

describe("getNextQuestions", () => {
  const questions = [{ key: "roof_storage" }, { key: "water_damage" }, { key: "odor" }, { key: "noise" }];

  it("drops a key after it has been asked once", () => {
    const first = getNextQuestions(questions, {}, {});
    expect(first.map((question) => question.key)).toEqual(["roof_storage", "water_damage", "odor"]);
    const asked = { roof_storage: 1 };
    expect(getNextQuestions(questions, {}, asked).map((question) => question.key)).toEqual([
      "water_damage",
      "odor",
      "noise",
    ]);
    expect(getNextQuestions(questions, { roof_storage: "有閣樓" }, {}).some((question) => question.key === "roof_storage")).toBe(
      false,
    );
  });
});
