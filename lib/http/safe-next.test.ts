import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeInternalNextPath } from "./safe-next.ts";

describe("safeInternalNextPath", () => {
  it("allows in-app relative paths", () => {
    assert.equal(safeInternalNextPath("/"), "/");
    assert.equal(safeInternalNextPath("/viewings"), "/viewings");
    assert.equal(safeInternalNextPath("/viewings/abc?tab=1"), "/viewings/abc?tab=1");
  });

  it("rejects open-redirect payloads that would leave the origin", () => {
    assert.equal(safeInternalNextPath("@evil.com"), "/");
    assert.equal(safeInternalNextPath("//evil.com"), "/");
    assert.equal(safeInternalNextPath("/\\evil.com"), "/");
    assert.equal(safeInternalNextPath("https://evil.com"), "/");
    assert.equal(safeInternalNextPath("\\evil.com"), "/");
    assert.equal(safeInternalNextPath("https://example.com@evil.com"), "/");
  });

  it("keeps post-login redirects on the same origin", () => {
    const origin = "https://kanfangji.example";
    assert.equal(`${origin}${safeInternalNextPath("@evil.com")}`, `${origin}/`);
    assert.equal(`${origin}${safeInternalNextPath("/viewings")}`, `${origin}/viewings`);
  });
});
