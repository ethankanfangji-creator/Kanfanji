import { tagsInclude } from "@/lib/portfolio/viewing-tags";
import type { ViewingListItem } from "./list-item";

/** `"all"` or a concrete tag string (freeform or legacy suggestion id). */
export type ViewingListTagFilter = "all" | string;
export type ViewingListSort = "updated_desc" | "address_asc";

export type ViewingListFilterInput = {
  query: string;
  tag: ViewingListTagFilter;
  hasReportOnly: boolean;
  sort: ViewingListSort;
};

/** @deprecated Use ViewingListTagFilter — kept for older imports. */
export type ViewingListDecisionFilter = ViewingListTagFilter;

export function filterAndSortViewings(
  items: ViewingListItem[],
  input: ViewingListFilterInput,
): ViewingListItem[] {
  const q = input.query.trim().toLowerCase();
  const tagFilter = input.tag;
  const filtered = items.filter((item) => {
    if (q && !item.address.toLowerCase().includes(q)) return false;
    if (tagFilter !== "all") {
      const tagged =
        tagsInclude(item.tags ?? [], tagFilter) ||
        item.decisionStatus === tagFilter;
      if (!tagged) return false;
    }
    if (input.hasReportOnly && !item.hasReport) return false;
    return true;
  });

  const sorted = [...filtered];
  if (input.sort === "address_asc") {
    sorted.sort((a, b) => a.address.localeCompare(b.address, undefined, { sensitivity: "base" }));
  } else {
    sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  return sorted;
}
