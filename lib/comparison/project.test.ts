import { describe, expect, it } from "vitest";
import { buildComparisonDraft } from "./build";
import { projectCompareFields } from "./project";
import { parsePriceForSort, sortComparisonColumns } from "./sort";
import type { ComparisonColumn } from "./types";

describe("projectCompareFields", () => {
  it("never invents area or management fee", () => {
    const fields = projectCompareFields({
      id: "v1",
      address: "88 Main",
      updated_at: "2026-09-15T00:00:00.000Z",
      pros: ["Bright"],
      risks: [],
      property: {
        priceLabel: "899k",
        layoutLabel: "2B2B",
        decisionSummary: {
          version: 1,
          address: "88 Main",
          viewingAt: "",
          unitLabel: "",
          priceLabel: "899k",
          layoutLabel: "2B2B",
          listingUrl: "",
          setupNotes: "mentions 35坪 somehow",
          overallRating: 4,
          pros: [{ id: "p1", text: "Bright", selected: true }],
          risks: [{ id: "r1", text: "Panel", selected: true }],
          facts: [],
          followUps: [{ id: "f1", text: "HOA?", selected: true }],
          actionItems: [],
          photos: [],
          disclaimer: "d",
          generatedAt: "2026-09-15T00:00:00.000Z",
        },
      },
    });
    expect(fields.locationLabel).toBe("88 Main");
    expect(fields.priceLabel).toBe("899k");
    expect(fields.areaLabel).toBeNull();
    expect(fields.managementFeeLabel).toBeNull();
    expect(fields.overallRating).toBe(4);
    expect(fields.pros).toEqual(["Bright"]);
    expect(fields.risks).toEqual(["Panel"]);
    expect(fields.followUps).toEqual(["HOA?"]);
  });
});

describe("sortComparisonColumns", () => {
  const cols: ComparisonColumn[] = [
    {
      id: "a",
      source: { viewingId: "1", sourceUpdatedAt: "" },
      title: "A",
      notes: "",
      included: true,
      fields: {
        priceLabel: null,
        layoutLabel: null,
        locationLabel: "A",
        areaLabel: null,
        managementFeeLabel: null,
        overallRating: 3,
        pros: [],
        risks: ["x", "y"],
        followUps: [],
      },
    },
    {
      id: "b",
      source: { viewingId: "2", sourceUpdatedAt: "" },
      title: "B",
      notes: "",
      included: true,
      fields: {
        priceLabel: "$900k",
        layoutLabel: null,
        locationLabel: "B",
        areaLabel: null,
        managementFeeLabel: null,
        overallRating: null,
        pros: [],
        risks: ["x"],
        followUps: [],
      },
    },
    {
      id: "c",
      source: { viewingId: "3", sourceUpdatedAt: "" },
      title: "C",
      notes: "",
      included: true,
      fields: {
        priceLabel: "800k",
        layoutLabel: null,
        locationLabel: "C",
        areaLabel: null,
        managementFeeLabel: null,
        overallRating: 5,
        pros: [],
        risks: [],
        followUps: [],
      },
    },
  ];

  it("parses price labels", () => {
    expect(parsePriceForSort("$900k")).toBe(900000);
    expect(parsePriceForSort(null)).toBeNull();
  });

  it("sinks missing values when sorting by rating desc", () => {
    const sorted = sortComparisonColumns(cols, "rating", "desc");
    expect(sorted.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by risk count asc", () => {
    const sorted = sortComparisonColumns(cols, "riskCount", "asc");
    expect(sorted.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });
});

describe("buildComparisonDraft", () => {
  it("requires 2–3 viewings", () => {
    expect(() => buildComparisonDraft([])).toThrow(/COMPARE_COUNT_2_3/);
    expect(() =>
      buildComparisonDraft([
        { id: "1", address: "A", updated_at: "t", property: {} },
        { id: "2", address: "B", updated_at: "t", property: {} },
        { id: "3", address: "C", updated_at: "t", property: {} },
        { id: "4", address: "D", updated_at: "t", property: {} },
      ]),
    ).toThrow(/COMPARE_COUNT_2_3/);
    const draft = buildComparisonDraft([
      { id: "1", address: "A", updated_at: "t", property: {} },
      { id: "2", address: "B", updated_at: "t", property: {} },
    ]);
    expect(draft.columns).toHaveLength(2);
    expect(draft.version).toBe(1);
  });
});
