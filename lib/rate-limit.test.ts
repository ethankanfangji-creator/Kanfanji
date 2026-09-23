import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { consumeRateLimit, resetRateLimitForTests } from "./rate-limit.ts";

describe("consumeRateLimit", () => {
  beforeEach(() => resetRateLimitForTests());

  it("allows up to the limit then blocks", () => {
    assert.equal(consumeRateLimit("u", { limit: 2, windowMs: 60_000 }).ok, true);
    assert.equal(consumeRateLimit("u", { limit: 2, windowMs: 60_000 }).ok, true);
    const blocked = consumeRateLimit("u", { limit: 2, windowMs: 60_000 });
    assert.equal(blocked.ok, false);
  });
});
