import { describe, expect, it } from "vitest";
import { getMessages } from "./index";
import { DEFAULT_LOCALE } from "./config";

describe("brand subtitle locale", () => {
  it("defaults to zh-Hant and does not leave the English tagline there", () => {
    expect(DEFAULT_LOCALE).toBe("zh-Hant");
    const brand = getMessages("zh-Hant").brand;
    expect(brand.subtitle).toBe("現場速記");
    expect(brand.cardEyebrow).not.toMatch(/OPEN HOUSE RECORDER/);
  });

  it("localizes zh-Hans and th, and keeps English", () => {
    expect(getMessages("zh-Hans").brand.subtitle).toBe("现场速记");
    expect(getMessages("th").brand.subtitle).toBe("จดหน้างาน");
    expect(getMessages("en").brand.subtitle).toBe("OPEN HOUSE RECORDER");
    expect(getMessages("en").brand.cardEyebrow).toContain("OPEN HOUSE RECORDER");
  });
});
