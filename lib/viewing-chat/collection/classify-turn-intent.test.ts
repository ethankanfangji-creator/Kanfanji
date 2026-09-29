import { describe, expect, it } from "vitest";
import { classifyTurnIntent } from "./classify-turn-intent";

describe("classifyTurnIntent finish words", () => {
  it("does not treat incidental 完成 as finish", () => {
    expect(
      classifyTurnIntent({
        message: { id: "m", text: "廚房剛裝修完成" },
        captures: [],
      }).intent,
    ).toBe("supplement");
  });

  it("treats a bare 完成 as a general note", () => {
    expect(
      classifyTurnIntent({ message: { id: "m", text: "完成" }, captures: [] }).intent,
    ).toBe("general");
  });

  it("does not treat 整理一下 as finish", () => {
    expect(
      classifyTurnIntent({
        message: { id: "m", text: "整理一下" },
        captures: [],
      }).intent,
    ).not.toBe("finish");
  });
});
