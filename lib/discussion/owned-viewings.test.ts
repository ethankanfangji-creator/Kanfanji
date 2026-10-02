import { describe, expect, it } from "vitest";
import { discussionHousesForOwner } from "./owned-viewings";

describe("discussionHousesForOwner", () => {
  it("drops viewings that do not belong to the room owner", () => {
    const houses = discussionHousesForOwner(
      ["own-1", "stolen", "own-2"],
      [
        { id: "own-1", address: "1 Main", user_id: "owner" },
        { id: "stolen", address: "9 Secret", user_id: "victim" },
        { id: "own-2", address: "2 Main", user_id: "owner" },
      ],
      "owner",
    );
    expect(houses).toEqual([
      { id: "own-1", address: "1 Main" },
      { id: "own-2", address: "2 Main" },
    ]);
  });

  it("keeps the room's order and ignores unknown ids", () => {
    expect(
      discussionHousesForOwner(
        ["missing", "own-1"],
        [{ id: "own-1", address: "1 Main", user_id: "owner" }],
        "owner",
      ),
    ).toEqual([{ id: "own-1", address: "1 Main" }]);
  });
});
