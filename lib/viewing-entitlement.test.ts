import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateViewing,
  FREE_VIEWING_LIMIT,
} from "./viewing-entitlement.ts";

describe("canCreateViewing", () => {
  it("allows Pro regardless of free count", () => {
    assert.deepEqual(
      canCreateViewing({ isPro: true, freeCount: FREE_VIEWING_LIMIT + 10 }),
      { ok: true },
    );
  });

  it("allows non-Pro under the free limit", () => {
    assert.deepEqual(
      canCreateViewing({ isPro: false, freeCount: FREE_VIEWING_LIMIT - 1 }),
      { ok: true },
    );
  });

  it("blocks non-Pro at or above the free limit", () => {
    assert.deepEqual(
      canCreateViewing({ isPro: false, freeCount: FREE_VIEWING_LIMIT }),
      { ok: false, code: "FREE_LIMIT_REACHED" },
    );
    assert.deepEqual(
      canCreateViewing({ isPro: false, freeCount: FREE_VIEWING_LIMIT + 1 }),
      { ok: false, code: "FREE_LIMIT_REACHED" },
    );
  });
});
