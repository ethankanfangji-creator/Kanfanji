import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_LOCALE,
  aiOutputLanguageInstruction,
  aiOutputLanguageName,
  aiWhisperLanguage,
  resolveAiLocale,
} from "./locale";

describe("resolveAiLocale", () => {
  it("defaults missing/empty to zh-Hant", () => {
    expect(resolveAiLocale(null)).toBe(DEFAULT_AI_LOCALE);
    expect(resolveAiLocale(undefined)).toBe("zh-Hant");
    expect(resolveAiLocale("")).toBe("zh-Hant");
    expect(resolveAiLocale("   ")).toBe("zh-Hant");
  });

  it("accepts allowlisted locales", () => {
    expect(resolveAiLocale("en")).toBe("en");
    expect(resolveAiLocale("th")).toBe("th");
    expect(resolveAiLocale("zh-Hans")).toBe("zh-Hans");
    expect(resolveAiLocale("zh-Hant")).toBe("zh-Hant");
  });
});

describe("aiOutputLanguageInstruction", () => {
  it("embeds Traditional Chinese for default locale", () => {
    const instruction = aiOutputLanguageInstruction("zh-Hant");
    expect(instruction).toMatch(/Output language \(mandatory\)/);
    expect(instruction).toMatch(/Traditional Chinese/);
    expect(instruction).toMatch(/繁體中文/);
  });

  it("embeds English when locale is en", () => {
    const instruction = aiOutputLanguageInstruction("en");
    expect(instruction).toMatch(/Output language \(mandatory\)/);
    expect(instruction).toMatch(/English/);
    expect(instruction).not.toMatch(/繁體中文/);
  });
});

describe("aiWhisperLanguage", () => {
  it("maps locales without changing model choice", () => {
    expect(aiWhisperLanguage("en")).toBe("en");
    expect(aiWhisperLanguage("th")).toBe("th");
    expect(aiWhisperLanguage("zh-Hant")).toBe("zh");
    expect(aiWhisperLanguage("")).toBe("zh");
  });
});

describe("aiOutputLanguageName", () => {
  it("names each supported locale", () => {
    expect(aiOutputLanguageName("en")).toContain("English");
    expect(aiOutputLanguageName("th")).toContain("Thai");
    expect(aiOutputLanguageName("zh-Hans")).toContain("Simplified");
    expect(aiOutputLanguageName("zh-Hant")).toContain("Traditional");
  });
});
