import { describe, expect, it } from "vitest";
import { extractFirstUrl, isListingPaste, pdfSourceRole } from "./detect-source";

describe("detect-source", () => {
  it("strips trailing fullwidth punctuation from the first url", () => {
    expect(extractFirstUrl("看這個 https://example.com/listing。")).toBe(
      "https://example.com/listing",
    );
  });

  it("requires a long listing-like paste", () => {
    const listing = `${"房".repeat(80)} 價格 1200萬 32坪 3房2衛 HOA ${"x".repeat(220)}`;
    expect(isListingPaste(listing)).toBe(true);
    expect(isListingPaste("價格 1200萬")).toBe(false);
  });

  it("classifies HOA pdf names without an extra model call", () => {
    expect(pdfSourceRole("strata minutes 2024.pdf")).toBe("hoa_doc");
    expect(pdfSourceRole("floorplan.pdf")).toBe("listing");
  });
});
