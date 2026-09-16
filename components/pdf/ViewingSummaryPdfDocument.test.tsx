import { describe, expect, it } from "vitest";
import path from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import { buildDecisionSummary } from "@/lib/share-card";
import { buildPdfSummary, type PdfDocumentLabels } from "@/lib/pdf-export";
import { ViewingSummaryPdfDocument } from "./ViewingSummaryPdfDocument";

Font.register({
  family: "TestNotoTC",
  src: path.resolve("public/fonts/NotoSansTC-Regular.otf"),
});
Font.register({
  family: "TestNotoThai",
  src: path.resolve("public/fonts/NotoSansThai-Regular.ttf"),
});

const labels: PdfDocumentLabels = {
  title: "Viewing summary",
  viewingAt: "Viewing date",
  basics: "Basics",
  unit: "Unit",
  price: "Price",
  layout: "Layout",
  area: "Area",
  managementFee: "Management fee",
  listingUrl: "Listing URL",
  setupNotes: "Notes",
  rating: "Rating",
  ratingEmpty: "Not rated",
  pros: "Pros",
  risks: "Risks",
  photos: "Photos",
  photoNote: "Photo note",
  facts: "Facts",
  followUps: "Follow-ups",
  actionItems: "Actions",
  emptySection: "Not provided",
  generatedAt: "Generated",
  page: "Page",
};

describe("ViewingSummaryPdfDocument", () => {
  it("renders a multi-page long-text PDF without throwing", async () => {
    const longText = Array.from(
      { length: 30 },
      (_, index) => `Long inspection note ${index + 1}: ${"detail ".repeat(30)}`,
    );
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const photoInputs = Array.from({ length: 6 }, (_, index) => ({
      id: `photo-${index}`,
      url: tinyPng,
      tag: `Photo ${index + 1}`,
      note: `Long annotation ${"detail ".repeat(25)}`,
    }));
    const snapshot = buildDecisionSummary({
      address: "123 Test Street",
      viewingAt: "2026-09-15T18:30:00.000Z",
      unitLabel: "12A",
      priceLabel: "$900,000",
      layoutLabel: "2 bed",
      areaLabel: "850 sqft",
      managementFeeLabel: "$500/mo",
      setupNotes: "Setup ".repeat(120),
      overallRating: 4,
      pros: longText,
      risks: longText,
      facts: longText,
      followUps: longText,
      actionItems: longText,
      photos: photoInputs,
      disclaimer: "Preliminary AI output; verify with a qualified inspector.",
      defaultSelectedLimit: 40,
    });
    const model = buildPdfSummary(
      snapshot,
      photoInputs.map((photo) => ({
        id: photo.id,
        tag: photo.tag,
        note: photo.note,
        dataUrl: tinyPng,
      })),
    );
    const buffer = await renderToBuffer(
      <ViewingSummaryPdfDocument
        model={model}
        labels={labels}
        locale="en-CA"
        fontFamilyOverride="Helvetica"
      />,
    );

    expect(buffer.byteLength).toBeGreaterThan(5_000);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  }, 20_000);

  it.each([
    ["繁體中文與简体中文地址", "zh-Hant", "TestNotoTC"],
    ["สรุปการดูบ้านและที่อยู่", "th-TH", "TestNotoThai"],
  ])("embeds local language fonts for %s", async (address, locale, fontFamily) => {
    const snapshot = buildDecisionSummary({
      address,
      viewingAt: "2026-09-15T18:30:00.000Z",
      facts: [{ text: address, selected: true }],
      disclaimer: address,
    });
    const buffer = await renderToBuffer(
      <ViewingSummaryPdfDocument
        model={buildPdfSummary(snapshot, [])}
        labels={{ ...labels, title: address }}
        locale={locale}
        fontFamilyOverride={fontFamily}
      />,
    );
    expect(buffer.byteLength).toBeGreaterThan(2_000);
  }, 20_000);
});

