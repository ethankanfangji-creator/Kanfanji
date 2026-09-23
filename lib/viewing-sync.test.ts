import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { saveViewingRecord, type ViewingSyncPayload } from "./viewing-sync";

const payload: ViewingSyncPayload = {
  address: "1200 Westwood",
  tags: [],
  market: "CA",
  questions: [],
  notes: [],
  pros: [],
  risks: [],
  property: {},
  propertyId: null,
  isPro: false,
  clientUpdatedAt: "2026-01-02T00:00:00.000Z",
  idempotencyKey: "local-session",
  expectedRevision: 3,
};

describe("saveViewingRecord idempotency and CAS", () => {
  it("returns the owner-scoped existing create after an idempotency collision", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: "remote-1", revision: 1 },
        error: null,
      });
    const builder = {
      upsert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle,
    };
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await saveViewingRecord(supabase, "user-1", payload, null);

    const writtenRow = (builder.upsert.mock.calls as unknown[][])[0]![0];
    expect(writtenRow).not.toHaveProperty("share_token");
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: "local-session" }),
      expect.anything(),
    );
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toMatchObject({
      id: "remote-1",
      revision: 1,
      conflict: false,
    });
  });

  it("reports a zero-row revision update as a conflict", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { client_updated_at: "2026-01-01T00:00:00.000Z", revision: 3 },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const builder = {
      select: vi.fn(() => builder),
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle,
    };
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await saveViewingRecord(supabase, "user-1", payload, "remote-1");

    const updatedRow = (builder.update.mock.calls as unknown[][])[0]![0];
    expect(updatedRow).not.toHaveProperty("share_token");
    expect(updatedRow).not.toHaveProperty("idempotency_key");
    expect(updatedRow).not.toHaveProperty("is_pro");
    expect(updatedRow).not.toHaveProperty("property_id");
    expect(builder.eq).toHaveBeenCalledWith("revision", 3);
    expect(result).toMatchObject({
      id: "remote-1",
      conflict: true,
      skippedAsStale: false,
      revision: 3,
    });
  });
});
