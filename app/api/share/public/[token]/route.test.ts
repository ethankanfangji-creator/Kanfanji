import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/share", () => ({
  resolvePublicShare: vi.fn(async () => ({
    version: 1,
    status: "revoked",
    message: "revoked",
  })),
}));

import { GET } from "./route";

describe("GET /api/share/public/:token", () => {
  it("returns gone for a revoked token", async () => {
    const response = await GET(
      new Request(`http://test/api/share/public/${"a".repeat(64)}`),
      { params: Promise.resolve({ token: "a".repeat(64) }) },
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ status: "revoked" });
  });
});
