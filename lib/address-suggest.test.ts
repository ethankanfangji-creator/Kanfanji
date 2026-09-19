import { describe, expect, it } from "vitest";
import { suggestAddresses } from "./address-suggest";

describe("suggestAddresses", () => {
  it("returns empty for short queries without calling upstream", async () => {
    await expect(suggestAddresses("ab")).resolves.toEqual([]);
    await expect(suggestAddresses("  ")).resolves.toEqual([]);
  });
});
