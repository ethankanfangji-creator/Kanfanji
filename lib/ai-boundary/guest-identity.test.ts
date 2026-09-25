import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_GUEST_COOKIE,
  createGuestIdentityCookie,
  guestCookieOptions,
  guestCookieSigningConfigured,
  verifyGuestIdentityCookie,
} from "./guest-identity";

const originalSecret = process.env.AI_GUEST_COOKIE_SECRET;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  process.env.AI_GUEST_COOKIE_SECRET = "test-only-guest-cookie-secret";
});

afterEach(() => {
  if (originalSecret == null) delete process.env.AI_GUEST_COOKIE_SECRET;
  else process.env.AI_GUEST_COOKIE_SECRET = originalSecret;
  if (originalServiceKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
});

describe("signed guest AI identity", () => {
  it("issues an opaque signed identity and rejects tampering", () => {
    const issued = createGuestIdentityCookie();
    expect(issued).not.toBeNull();
    expect(AI_GUEST_COOKIE).toBe("kf_ai_guest");
    expect(verifyGuestIdentityCookie(issued!.value)).toEqual(issued!.identity);
    expect(verifyGuestIdentityCookie(`${issued!.value}x`)).toBeNull();
    expect(issued!.value).not.toContain("test-only-guest-cookie-secret");
  });

  it("uses HTTP-only, same-site cookie options", () => {
    expect(guestCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("fails closed when no signing secret exists", () => {
    delete process.env.AI_GUEST_COOKIE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(guestCookieSigningConfigured()).toBe(false);
    expect(createGuestIdentityCookie()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("can fall back to the service role key but that is not a dedicated secret", () => {
    delete process.env.AI_GUEST_COOKIE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-fallback-only";
    const issued = createGuestIdentityCookie();
    expect(issued).not.toBeNull();
    expect(verifyGuestIdentityCookie(issued!.value)?.guestId).toBe(issued!.identity.guestId);
  });
});
