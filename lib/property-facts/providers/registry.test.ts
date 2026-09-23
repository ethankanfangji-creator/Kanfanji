import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { loadProviderDefs } from "./config";
import {
  gateProvider,
  resetProviderRegistryForTests,
  resolveProviderAvailability,
} from "./registry";
import { createProviderAudit } from "./types";
import type { PropertyProviderDef } from "@/config/property-providers";

describe("provider registry", () => {
  const prevAttom = process.env.ATTOM_API_KEY;
  const prevGoogle = process.env.GOOGLE_MAPS_API_KEY;
  const prevBing = process.env.BING_SEARCH_API_KEY;

  beforeEach(() => {
    resetProviderRegistryForTests();
    delete process.env.ATTOM_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.BING_SEARCH_API_KEY;
  });

  afterEach(() => {
    resetProviderRegistryForTests();
    if (prevAttom === undefined) delete process.env.ATTOM_API_KEY;
    else process.env.ATTOM_API_KEY = prevAttom;
    if (prevGoogle === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = prevGoogle;
    if (prevBing === undefined) delete process.env.BING_SEARCH_API_KEY;
    else process.env.BING_SEARCH_API_KEY = prevBing;
  });

  it("rejects providers that allow scraping at load time", () => {
    const bad = {
      id: "evil_scraper",
      kind: "search_api",
      label: "Evil",
      regions: ["US"],
      lanes: ["listing"],
      envKeyName: null,
      authScope: "none",
      rateLimit: { rpm: 1 },
      retentionHours: 1,
      allowsScraping: true,
      complianceTags: [],
      humanVerificationRequired: true,
      enabledByDefault: true,
    } as unknown as PropertyProviderDef;

    const loaded = loadProviderDefs([bad]);
    expect(loaded[0]?.loadError).toBe("scraping_forbidden");
    expect(loaded[0]?.enabledByDefault).toBe(false);
  });

  it("skips attom when API key missing", () => {
    const audit = createProviderAudit();
    expect(gateProvider("attom", { region: "US", audit })).toBe(false);
    expect(audit.snapshot().skipped.some((s) => s.id === "attom" && s.reason === "missing_key")).toBe(
      true,
    );
  });

  it("marks stub MLS as stub_only", () => {
    const status = resolveProviderAvailability("mls_crea_ddf", "CA");
    expect(status?.available).toBe(false);
    expect(status?.reason).toBe("stub_only");
  });

  it("allows metro open data without a key in CA", () => {
    const audit = createProviderAudit();
    expect(gateProvider("metro_vancouver_open", { region: "CA", audit })).toBe(true);
    expect(audit.snapshot().used.some((u) => u.id === "metro_vancouver_open")).toBe(true);
  });
});
