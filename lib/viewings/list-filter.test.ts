import { describe, expect, it } from "vitest";
import { filterAndSortViewings } from "./list-filter";
import type { ViewingListItem } from "./list-item";

function item(
  partial: Partial<ViewingListItem> & Pick<ViewingListItem, "id" | "address">,
): ViewingListItem {
  return {
    updated_at: "2026-10-02T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    photo_urls: [],
    video_urls: [],
    decisionStatus: null,
    tags: [],
    hasReport: false,
    lat: null,
    lng: null,
    ...partial,
  };
}

describe("filterAndSortViewings", () => {
  const pool = [
    item({
      id: "a",
      address: "1200 Westwood St",
      decisionStatus: "liked",
      hasReport: true,
      updated_at: "2026-10-03T00:00:00.000Z",
    }),
    item({
      id: "b",
      address: "88 Main Street",
      decisionStatus: "passed",
      updated_at: "2026-10-04T00:00:00.000Z",
    }),
    item({
      id: "c",
      address: "9 Oak Ave",
      decisionStatus: "shortlist",
      hasReport: true,
      updated_at: "2026-10-01T00:00:00.000Z",
    }),
  ];

  it("filters by address substring", () => {
    const result = filterAndSortViewings(pool, {
      query: "westwood",
      tag: "all",
      hasReportOnly: false,
      sort: "updated_desc",
    });
    expect(result.map((row) => row.id)).toEqual(["a"]);
  });

  it("filters by tag and hasReport", () => {
    const result = filterAndSortViewings(pool, {
      query: "",
      tag: "shortlist",
      hasReportOnly: true,
      sort: "updated_desc",
    });
    expect(result.map((row) => row.id)).toEqual(["c"]);
  });

  it("filters by freeform tag on tags[]", () => {
    const tagged = [
      item({ id: "t1", address: "A", tags: ["liked", "太吵"] }),
      item({ id: "t2", address: "B", tags: ["passed"] }),
    ];
    const result = filterAndSortViewings(tagged, {
      query: "",
      tag: "太吵",
      hasReportOnly: false,
      sort: "updated_desc",
    });
    expect(result.map((row) => row.id)).toEqual(["t1"]);
  });

  it("sorts by address ascending", () => {
    const result = filterAndSortViewings(pool, {
      query: "",
      tag: "all",
      hasReportOnly: false,
      sort: "address_asc",
    });
    expect(result.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by updated_at descending by default", () => {
    const result = filterAndSortViewings(pool, {
      query: "",
      tag: "all",
      hasReportOnly: false,
      sort: "updated_desc",
    });
    expect(result.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });
});
