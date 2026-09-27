// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { authRedirectUrl } from "./auth-urls";

describe("authRedirectUrl", () => {
  it("keeps signup and password reset on the current origin", () => {
    expect(authRedirectUrl("/auth/callback")).toBe(`${window.location.origin}/auth/callback`);
    expect(authRedirectUrl("/auth/reset")).toBe(`${window.location.origin}/auth/reset`);
  });
});
