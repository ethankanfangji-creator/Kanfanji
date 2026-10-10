import { describe, expect, it } from "vitest";
import {
  filterShareViewingGroups,
  groupShareLinksByViewing,
  pickGeneralLink,
  recipientInitials,
} from "./group-links";
import type { OwnerShareLinkListItem } from "./types";

function link(
  partial: Partial<OwnerShareLinkListItem> &
    Pick<OwnerShareLinkListItem, "id" | "viewingId" | "status">,
): OwnerShareLinkListItem {
  return {
    address: "Sukhumvit 24",
    urlPath: `/s/${partial.id}`,
    needsRegenerate: false,
    lat: null,
    lng: null,
    capability: "read",
    expiresAt: null,
    passwordEnabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revokedAt: null,
    closedAt: null,
    lastResolvedAt: null,
    accessVersion: 1,
    recipientLabel: null,
    contentStale: false,
    ...partial,
  };
}

describe("recipientInitials", () => {
  it("uses one CJK character or two Latin letters", () => {
    expect(recipientInitials("媽媽", "一般")).toBe("媽");
    expect(recipientInitials("Mom", "General")).toBe("MO");
    expect(recipientInitials(null, "一般連結")).toBe("一");
  });
});

describe("groupShareLinksByViewing", () => {
  it("merges same viewing and prefers open general link", () => {
    const items = [
      link({
        id: "n1",
        viewingId: "v1",
        status: "active",
        recipientLabel: "媽媽",
      }),
      link({
        id: "g1",
        viewingId: "v1",
        status: "active",
        recipientLabel: null,
      }),
      link({
        id: "g2",
        viewingId: "v2",
        status: "closed",
        address: "Other",
        recipientLabel: null,
      }),
    ];
    const groups = groupShareLinksByViewing(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.viewingId).toBe("v1");
    expect(groups[0]!.status).toBe("active");
    expect(groups[0]!.generalLink?.id).toBe("g1");
    expect(groups[0]!.links.map((l) => l.id)).toEqual(["g1", "n1"]);
    expect(groups[0]!.contentStale).toBe(false);
    expect(groups[1]!.status).toBe("closed");
  });

  it("aggregates contentStale from open links", () => {
    const groups = groupShareLinksByViewing([
      link({
        id: "g1",
        viewingId: "v1",
        status: "active",
        contentStale: true,
      }),
      link({
        id: "n1",
        viewingId: "v1",
        status: "closed",
        contentStale: false,
        recipientLabel: "Mom",
      }),
    ]);
    expect(groups[0]!.contentStale).toBe(true);
  });

  it("pickGeneralLink prefers active unnamed", () => {
    const links = [
      link({ id: "closed", viewingId: "v", status: "closed", recipientLabel: null }),
      link({ id: "open", viewingId: "v", status: "active", recipientLabel: null }),
    ];
    expect(pickGeneralLink(links)?.id).toBe("open");
  });
});

describe("filterShareViewingGroups", () => {
  it("filters by aggregate status", () => {
    const groups = groupShareLinksByViewing([
      link({ id: "a", viewingId: "v1", status: "active" }),
      link({ id: "b", viewingId: "v2", status: "closed", address: "B" }),
    ]);
    expect(filterShareViewingGroups(groups, "open")).toHaveLength(1);
    expect(filterShareViewingGroups(groups, "closed")).toHaveLength(1);
    expect(filterShareViewingGroups(groups, "all")).toHaveLength(2);
  });

  it("filters groups that need public content republish", () => {
    const groups = groupShareLinksByViewing([
      link({ id: "a", viewingId: "v1", status: "active", contentStale: true }),
      link({ id: "b", viewingId: "v2", status: "active", contentStale: false, address: "B" }),
    ]);
    expect(filterShareViewingGroups(groups, "stale")).toHaveLength(1);
    expect(filterShareViewingGroups(groups, "stale")[0]!.viewingId).toBe("v1");
  });

  it("filters groups with unread comments", () => {
    const groups = groupShareLinksByViewing([
      link({ id: "a", viewingId: "v1", status: "active" }),
      link({ id: "b", viewingId: "v2", status: "active", address: "B" }),
    ]);
    expect(
      filterShareViewingGroups(groups, "unread", { a: 2 }),
    ).toHaveLength(1);
    expect(filterShareViewingGroups(groups, "unread", { a: 2 })[0]!.viewingId).toBe(
      "v1",
    );
  });
});
