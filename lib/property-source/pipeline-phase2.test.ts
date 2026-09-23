import { describe, expect, it, vi, afterEach } from "vitest";
import { runPropertySourcePipeline } from "./pipeline";

vi.mock("./extract-pdf", () => ({
  extractTextFromPdfBase64: vi.fn(async () => ({
    ok: true as const,
    extractedText: "管理費每月 5200 元 Condo fee $180",
    pageCount: 1,
  })),
}));

describe("pipeline PDF + HOA + vision messaging", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("extracts PDF text into costs when present", async () => {
    const result = await runPropertySourcePipeline({
      sourceType: "pdf",
      fileBase64: Buffer.from("fake").toString("base64"),
      mimeType: "application/pdf",
      fileName: "fee.pdf",
      address: "台北市大安區忠孝東路四段1號",
    });
    expect(result.steps.find((s) => s.step === "extract")?.status).toBe(
      "completed",
    );
    expect(result.propertyData.costs.hoaOrManagementFee.value).toBeTruthy();
    expect(result.source.extractionErrors).toEqual([]);
  });

  it("marks hoa_doc role notes on fee field", async () => {
    const result = await runPropertySourcePipeline({
      sourceType: "pdf",
      sourceRole: "hoa_doc",
      fileBase64: Buffer.from("fake").toString("base64"),
      mimeType: "application/pdf",
      fileName: "hoa.pdf",
      address: "台北市大安區忠孝東路四段1號",
    });
    expect(result.source.sourceRole).toBe("hoa_doc");
    expect(result.propertyData.costs.hoaOrManagementFee.notes).toMatch(
      /HOA|management/i,
    );
  });

  it("reports vision_key_missing when OPENAI_API_KEY absent", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await runPropertySourcePipeline({
      sourceType: "image",
      fileBase64: Buffer.from("abc").toString("base64"),
      mimeType: "image/jpeg",
      fileName: "shot.jpg",
      address: "123 Main St, Seattle, WA 98101",
      visionExtract: async () => null,
    });
    expect(result.source.extractionErrors).toContain("vision_key_missing");
    expect(result.steps.find((s) => s.step === "extract")?.errorCode).toBe(
      "vision_key_missing",
    );
  });

  it("merges enrich patch into neighborhood", async () => {
    const { createEmptyPropertyData, sourcedField } = await import("./types");
    const patch = createEmptyPropertyData("addr");
    patch.neighborhood.grocery = sourcedField("Near Safeway", {
      sourceIds: ["enrich:poi"],
      confidence: 0.4,
      verificationStatus: "unverified",
    });
    const result = await runPropertySourcePipeline({
      sourceType: "user_text",
      text: "3 bed 2 bath asking $500,000",
      address: "100 Main St, Seattle, WA 98101",
      enrich: async () => ({
        notes: ["Google Maps：未設定金鑰"],
        patch,
      }),
    });
    expect(result.propertyData.neighborhood.grocery.value).toMatch(/Safeway/);
    expect(result.enrichNotes.join("")).toMatch(/未設定金鑰/);
  });
});
