import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { throwOnSupabaseError } from "./supabase-write.ts";

describe("throwOnSupabaseError", () => {
  it("throws when a write returns an error object so callers cannot ACK success", () => {
    assert.throws(
      () => throwOnSupabaseError({ message: "duplicate key" }, "subscriptions upsert"),
      /subscriptions upsert failed: duplicate key/,
    );
  });

  it("does not throw when error is null", () => {
    assert.doesNotThrow(() => throwOnSupabaseError(null, "subscriptions upsert"));
  });
});
