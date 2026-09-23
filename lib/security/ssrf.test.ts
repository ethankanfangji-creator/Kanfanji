import { describe, expect, it } from "vitest";
import { assertSafeHttpUrl, isPrivateOrReservedIp } from "./ssrf";

describe("ssrf guards", () => {
  it("allows public https URLs", () => {
    const r = assertSafeHttpUrl("https://example.com/listing/123");
    expect(r.ok).toBe(true);
  });

  it("blocks non-http schemes and localhost", () => {
    expect(assertSafeHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(assertSafeHttpUrl("http://localhost/admin").ok).toBe(false);
    expect(assertSafeHttpUrl("http://127.0.0.1/").ok).toBe(false);
    expect(assertSafeHttpUrl("http://169.254.169.254/latest").ok).toBe(false);
    expect(assertSafeHttpUrl("http://192.168.1.1/").ok).toBe(false);
  });

  it("detects private IPs", () => {
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
  });
});
