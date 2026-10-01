// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAddressPinDraft,
  readActiveThreadId,
  readAddressPinDraft,
  writeActiveThreadId,
  writeAddressPinDraft,
} from "./address-pin-session";

describe("address pin session", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the dropped pin so a refresh can reopen the map", () => {
    writeAddressPinDraft({
      queryAddress: "2143 Spring Port Moody",
      displayAddress: "2143 Spring Street, Port Moody",
      hintLat: 49.278,
      hintLng: -122.87,
      picked: { lat: 49.2815, lng: -122.8512 },
      propertyId: null,
      source: "photon",
      region: "CA",
    });
    expect(readAddressPinDraft()?.picked).toEqual({ lat: 49.2815, lng: -122.8512 });
    expect(readAddressPinDraft()?.queryAddress).toBe("2143 Spring Port Moody");
  });

  it("remembers which viewing was open", () => {
    writeActiveThreadId("thread-1");
    expect(readActiveThreadId()).toBe("thread-1");
    writeActiveThreadId(null);
    expect(readActiveThreadId()).toBeNull();
    clearAddressPinDraft();
    expect(readAddressPinDraft()).toBeNull();
  });
});