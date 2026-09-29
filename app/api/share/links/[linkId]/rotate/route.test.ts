import { beforeEach, describe, expect, it, vi } from "vitest";

const { revokeOwnerShareLink, rotateOwnerShareLink } = vi.hoisted(() => ({
  revokeOwnerShareLink: vi.fn(),
  rotateOwnerShareLink: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/share-access/server", () => ({ revokeOwnerShareLink, rotateOwnerShareLink }));

import { POST as revoke } from "../revoke/route";
import { POST as rotate } from "./route";

const ctx = { params: Promise.resolve({ linkId: "link-1" }) };

describe("share revoke and rotate routes", () => {
  beforeEach(() => {
    revokeOwnerShareLink.mockReset();
    rotateOwnerShareLink.mockReset();
  });

  it("revokes through the server helper", async () => {
    revokeOwnerShareLink.mockResolvedValue({ id: "link-1", status: "revoked", token: "" });
    const response = await revoke(new Request("http://test"), ctx);
    expect(response.status).toBe(200);
    expect(revokeOwnerShareLink).toHaveBeenCalled();
  });

  it("returns 409 when the new snapshot is not ready", async () => {
    rotateOwnerShareLink.mockRejectedValue(new Error("REPORT_NOT_READY"));
    const response = await rotate(new Request("http://test"), ctx);
    expect(response.status).toBe(409);
  });
});
