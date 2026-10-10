import type { OwnerShareLinkListItem } from "./types";

export type ShareViewingGroup = {
  viewingId: string;
  address: string;
  lat: number | null;
  lng: number | null;
  links: OwnerShareLinkListItem[];
  /** Aggregate: any active link → active; else expired if any; else closed. */
  status: OwnerShareLinkListItem["status"];
  generalLink: OwnerShareLinkListItem | null;
  /** Any open link is behind the current report — owner should republish. */
  contentStale: boolean;
};

export function isShareLinkOpen(link: OwnerShareLinkListItem): boolean {
  return link.status === "active";
}

export function recipientInitials(
  recipientLabel: string | null | undefined,
  generalFallback: string,
): string {
  const raw = (recipientLabel?.trim() || generalFallback).trim();
  if (!raw) return "?";
  if (/^[A-Za-z]/.test(raw)) {
    const letters = raw.replace(/[^A-Za-z]/g, "");
    return (letters.slice(0, 2) || raw.slice(0, 2)).toUpperCase();
  }
  return raw.slice(0, 1);
}

function aggregateStatus(
  links: OwnerShareLinkListItem[],
): OwnerShareLinkListItem["status"] {
  if (links.some(isShareLinkOpen)) return "active";
  if (links.some((link) => link.status === "expired")) return "expired";
  return "closed";
}

/** Pick general (unnamed) link — prefer open, else any general row. */
export function pickGeneralLink(
  links: OwnerShareLinkListItem[],
): OwnerShareLinkListItem | null {
  const generals = links.filter((link) => !link.recipientLabel?.trim());
  return generals.find(isShareLinkOpen) ?? generals[0] ?? null;
}

/**
 * Group flat link rows by viewing. Within a group, general link first, then
 * named codes A→Z; open links before stopped when labels tie.
 */
export function groupShareLinksByViewing(
  items: OwnerShareLinkListItem[],
): ShareViewingGroup[] {
  const map = new Map<string, OwnerShareLinkListItem[]>();
  for (const item of items) {
    const list = map.get(item.viewingId);
    if (list) list.push(item);
    else map.set(item.viewingId, [item]);
  }

  const groups: ShareViewingGroup[] = [];
  for (const [viewingId, links] of map) {
    const sorted = [...links].sort((a, b) => {
      const aGeneral = a.recipientLabel?.trim() ? 1 : 0;
      const bGeneral = b.recipientLabel?.trim() ? 1 : 0;
      if (aGeneral !== bGeneral) return aGeneral - bGeneral;
      const aOpen = isShareLinkOpen(a) ? 0 : 1;
      const bOpen = isShareLinkOpen(b) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return (a.recipientLabel ?? "").localeCompare(b.recipientLabel ?? "", "zh");
    });
    const head = sorted[0]!;
    groups.push({
      viewingId,
      address: head.address,
      lat: head.lat,
      lng: head.lng,
      links: sorted,
      status: aggregateStatus(sorted),
      generalLink: pickGeneralLink(sorted),
      contentStale: sorted.some(
        (row) => row.contentStale && isShareLinkOpen(row),
      ),
    });
  }

  groups.sort((a, b) => {
    const aOpen = a.status === "active" ? 0 : 1;
    const bOpen = b.status === "active" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return a.address.localeCompare(b.address, "zh");
  });
  return groups;
}

export type ShareViewingGroupFilter =
  | "open"
  | "closed"
  | "stale"
  | "unread"
  | "all";

/** Filter groups for hub open / closed / needs-update / unread / all chips. */
export function filterShareViewingGroups(
  groups: ShareViewingGroup[],
  filter: ShareViewingGroupFilter,
  unreadByLinkId?: Record<string, number>,
): ShareViewingGroup[] {
  if (filter === "all") return groups;
  if (filter === "open") return groups.filter((g) => g.status === "active");
  if (filter === "stale") return groups.filter((g) => g.contentStale);
  if (filter === "unread") {
    const counts = unreadByLinkId ?? {};
    return groups.filter((g) =>
      g.links.some((link) => (counts[link.id] ?? 0) > 0),
    );
  }
  return groups.filter((g) => g.status !== "active");
}
