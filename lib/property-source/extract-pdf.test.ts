import { describe, expect, it, vi } from "vitest";
import { extractTextFromPdfBase64 } from "./extract-pdf";

vi.mock("unpdf", () => ({
  extractText: vi.fn(async (data: Uint8Array, opts?: { mergePages?: boolean }) => {
    const asText = Buffer.from(data).toString("utf8");
    if (asText.includes("__EMPTY_PDF__")) {
      return { totalPages: 1, text: opts?.mergePages ? "" : [""] };
    }
    if (asText.includes("__THROW__")) {
      throw new Error("parse boom");
    }
    const body = "管理費每月 4500 元 HOA $250\n3房2衛";
    return {
      totalPages: 2,
      text: opts?.mergePages ? body : [body],
    };
  }),
}));

describe("extractTextFromPdfBase64", () => {
  it("extracts text from a fake pdf buffer", async () => {
    const b64 = Buffer.from("fake-pdf-bytes").toString("base64");
    const result = await extractTextFromPdfBase64(b64);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extractedText).toMatch(/管理費|HOA/);
      expect(result.pageCount).toBe(2);
    }
  });

  it("returns pdf_no_text when extract is empty", async () => {
    const b64 = Buffer.from("__EMPTY_PDF__").toString("base64");
    const result = await extractTextFromPdfBase64(b64);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("pdf_no_text");
  });

  it("returns pdf_extract_failed on parser throw", async () => {
    const b64 = Buffer.from("__THROW__").toString("base64");
    const result = await extractTextFromPdfBase64(b64);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("pdf_extract_failed");
  });

  it("returns pdf_empty for blank input", async () => {
    const result = await extractTextFromPdfBase64("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("pdf_empty");
  });
});
