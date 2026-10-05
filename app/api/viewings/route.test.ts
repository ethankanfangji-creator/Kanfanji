import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, insert, from, linkViewingToProperty } = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  linkViewingToProperty: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

vi.mock("@/lib/analytics/server", () => ({
  serverTrack: vi.fn(),
}));

vi.mock("@/lib/viewings/link-property.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/viewings/link-property.server")>(
    "@/lib/viewings/link-property.server",
  );
  return {
    ...actual,
    linkViewingToProperty,
  };
});

vi.mock("@/lib/properties/signals", () => ({
  schedulePropertySignalsRefresh: vi.fn(),
}));

import { POST } from "./route";

function post(body: unknown) {
  return new Request("https://example.test/api/viewings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  insert.mockReset();
  from.mockReset();
  linkViewingToProperty.mockReset();
  linkViewingToProperty.mockResolvedValue("property-linked");
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  from.mockImplementation((table: string) => {
    if (table === "subscriptions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { status: "active", manual_pro_until: null }, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: async () => ({ count: 0, error: null }),
      }),
      insert: (payload: unknown) => {
        insert(payload);
        const result = insert.mock.results.at(-1);
        const error = (result as { value?: { error?: { message: string } } } | undefined)?.value?.error;
        return {
          select: () => ({
            single: async () =>
              error
                ? { data: null, error }
                : { data: { id: "view-1", revision: 1 }, error: null },
          }),
        };
      },
    };
  });
});

describe("POST /api/viewings", () => {
  it("ignores client property_id and stores server-linked id", async () => {
    const response = await POST(
      post({ address: "Unit 5, 1 Main St", property_id: "not-a-real-property" }),
    );
    expect(response.status).toBe(200);
    expect(linkViewingToProperty).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0].property_id).toBe("property-linked");
  });

  it("still creates the viewing when property link soft-fails", async () => {
    linkViewingToProperty.mockResolvedValue(null);
    const response = await POST(post({ address: "1 Main St" }));
    expect(response.status).toBe(200);
    expect(insert.mock.calls[0][0].property_id).toBeNull();
  });

  it("returns the insert error without retrying", async () => {
    from.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({ count: 0, error: null }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: "check constraint" } }),
          }),
        }),
      };
    });
    const response = await POST(post({ address: "1 Main St", property_id: "x" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("viewings insert failed");
    expect(body.error).toContain("check constraint");
  });
});
