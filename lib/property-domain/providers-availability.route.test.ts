import { describe, expect, it } from "vitest";
import { GET as availabilityGet } from "@/app/api/providers/availability/route";
import { getProviderDefs } from "@/lib/property-facts/providers/registry";

describe("GET /api/providers/availability", () => {
  it("returns catalogue for US without secrets", async () => {
    const res = await availabilityGet(
      new Request("http://localhost/api/providers/availability?country=US"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const json = (await res.json()) as {
      country: string;
      providers: Array<{
        id: string;
        available: boolean;
        allowsScraping: boolean;
        reason: string | null;
      }>;
    };
    expect(json.country).toBe("US");
    expect(json.providers.length).toBe(getProviderDefs().length);
    expect(json.providers.every((p) => p.allowsScraping === false)).toBe(true);
    expect(json.providers.some((p) => p.id === "google_maps")).toBe(true);
    // Never leak env key names in response
    expect(JSON.stringify(json)).not.toMatch(/API_KEY|SECRET|envKey/i);
  });

  it("rejects invalid country", async () => {
    const res = await availabilityGet(
      new Request("http://localhost/api/providers/availability?country=ZZ"),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; retryable: boolean };
    expect(json.code).toBe("country_invalid");
    expect(json.retryable).toBe(false);
  });
});
