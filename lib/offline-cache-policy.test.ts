import { describe, expect, it } from "vitest";
import { isCacheableAppRequest } from "./offline-cache-policy";

const origin = "https://kanfangji.test";
const request = (path: string, method = "GET", destination = "document") => ({
  method,
  url: path.startsWith("http") ? path : `${origin}${path}`,
  destination,
});

describe("offline cache policy", () => {
  it("allows only the same-origin app shell and static assets", () => {
    expect(isCacheableAppRequest(request("/"), origin)).toBe(true);
    expect(
      isCacheableAppRequest(request("/_next/static/chunks/app.js", "GET", "script"), origin),
    ).toBe(true);
  });

  it.each([
    request("/api/share/public/token"),
    request("/api/share"),
    request("/api/viewings"),
    request("/s/public-token"),
    request("/s"),
    request("/c/public-token"),
    request("/viewings/private-id"),
    request("/?token=secret"),
    request("/api/share/links", "POST"),
    request("https://media.example.test/object.jpg?signature=secret", "GET", "image"),
  ])("excludes private, signed, cross-origin, and mutation requests", (candidate) => {
    expect(isCacheableAppRequest(candidate, origin)).toBe(false);
  });
});
