import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("discussion share page", () => {
  it("only renders viewings owned by the room owner", () => {
    const page = readFileSync("app/d/[share_code]/page.tsx", "utf8");
    expect(page).toContain("discussionHousesForOwner");
    expect(page).toContain("room.owner_user_id");
    expect(page).toContain("ownedCards");
  });
});
