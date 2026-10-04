import type { DecisionStatus } from "@/lib/portfolio/types";
import type { ViewingListItem } from "./list-item";

export type ViewingListDecisionFilter = "all" | DecisionStatus;
export type ViewingListSort = "updated_desc" | "address_asc";

export type ViewingListFilterInput = {
  query: string;
  decision: ViewingListDecisionFilter;
  hasReportOnly: boolean;
  sort: ViewingListSort;
};

export function filterAndSortViewings(
  items: ViewingListItem[],
  input: ViewingListFilterInput,
): ViewingListItem[] {
  const q = input.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (q && !item.address.toLowerCase().includes(q)) return false;
    if (input.decision !== "all" && item.decisionStatus !== input.decision) return false;
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
