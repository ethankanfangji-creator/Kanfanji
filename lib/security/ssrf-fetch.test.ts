import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn(async () => [
  { address: "93.184.216.34", family: 4 as const },
]);

vi.mock("node:dns/promises", () => ({
  lookup: ((...args: unknown[]) =>
    lookupMock(...(args as Parameters<typeof lookupMock>))) as typeof lookupMock,
}));

import { DEFAULT_BROWSER_UA, safeFetchUserUrl } from "./ssrf";

describe("safeFetchUserUrl soft walls", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    lookupMock.mockReset();
  });

  it("uses a browser User-Agent by default", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        "<html><body>Hello listing content here ".repeat(20) + "</body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await safeFetchUserUrl("https://example.com/home");
    expect(result.ok).toBe(true);
    const call = fetchMock.mock.calls[0] as unknown as
      | [RequestInfo | URL, RequestInit?]
      | undefined;
    const headers = call?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toBe(DEFAULT_BROWSER_UA);
  });

  it("returns login_required on 401 without reading as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("login", { status: 401 })),
    );

    const result = await safeFetchUserUrl("https://example.com/private");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("login_required");
      expect(result.errorMessage).toMatch(/不是要你登入本 App/);
    }
  });

  it("extracts body on 403 when HTML is substantial", async () => {
    const html =
      "<html><body>" +
      "Listing price 899000 bedrooms baths square feet details ".repeat(30) +
      "</body></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(html, {
            status: 403,
            headers: { "content-type": "text/html" },
          }),
      ),
    );

    const result = await safeFetchUserUrl("https://example.com/soft-wall");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bodyText.length).toBeGreaterThan(400);
      expect(result.status).toBe(403);
    }
  });

  it("returns login_required on 403 with empty shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })),
    );

    const result = await safeFetchUserUrl("https://example.com/deny");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("login_required");
  });
});
