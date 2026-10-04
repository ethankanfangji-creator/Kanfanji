import { describe, expect, it } from "vitest";
import {
  daysAgoIso,
  filterThreadsByScope,
  startOfLocalDayIso,
} from "./scope";

const base = [
  {
    id: "a",
    address: "1 Main",
    updatedAt: "2026-10-03T12:00:00.000Z",
    decisionStatus: "liked" as const,
  },
  {
    id: "b",
    address: "2 Oak",
    updatedAt: "2026-09-20T12:00:00.000Z",
    decisionStatus: "passed" as const,
  },
  {
    id: "c",
    address: "3 Pine",
    updatedAt: "2026-10-02T08:00:00.000Z",
    decisionStatus: null,
  },
];

describe("filterThreadsByScope", () => {
  it("returns all for mode all", () => {
    expect(filterThreadsByScope(base, { mode: "all" })).toHaveLength(3);
  });

  it("filters by ids", () => {
    expect(filterThreadsByScope(base, { mode: "ids", viewingIds: ["b", "c"] }).map((t) => t.id)).toEqual([
      "b",
      "c",
    ]);
  });

  it("filters by time since", () => {
    const since = "2026-10-01T00:00:00.000Z";
    expect(filterThreadsByScope(base, { mode: "time", since }).map((t) => t.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("filters by decision status", () => {
    expect(
      filterThreadsByScope(base, { mode: "status", statuses: ["liked", "shortlist"] }).map(
        (t) => t.id,
      ),
    ).toEqual(["a"]);
  });

  it("returns empty when ids mode has no ids", () => {
    expect(filterThreadsByScope(base, { mode: "ids", viewingIds: [] })).toEqual([]);
  });
});

describe("time helpers", () => {
  it("startOfLocalDayIso is at local midnight", () => {
    const iso = startOfLocalDayIso(new Date("2026-10-03T15:30:00"));
    const d = new Date(iso);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("daysAgoIso goes back N local midnights", () => {
    const now = new Date("2026-10-03T15:30:00");
    const ago = new Date(daysAgoIso(7, now));
    const today = new Date(startOfLocalDayIso(now));
    expect((today.getTime() - ago.getTime()) / 86_400_000).toBe(7);
  });
});
