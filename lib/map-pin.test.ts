import { describe, expect, it } from "vitest";
import { latLngFromMapClick, worldPoint } from "./map-pin";

describe("latLngFromMapClick", () => {
  it("returns the center when the click is in the middle", () => {
    const pin = latLngFromMapClick({
      centerLat: 49.2815,
      centerLng: -122.8512,
      zoom: 17,
      offsetX: 0,
      offsetY: 0,
    });
    expect(pin.lat).toBeCloseTo(49.2815, 5);
    expect(pin.lng).toBeCloseTo(-122.8512, 5);
  });

  it("moves the pin east when the click is to the right of center", () => {
    const center = worldPoint(49.2815, -122.8512, 17);
    const next = latLngFromMapClick({
      centerLat: 49.2815,
      centerLng: -122.8512,
      zoom: 17,
      offsetX: 40,
      offsetY: 0,
    });
    expect(next.lng).toBeGreaterThan(-122.8512);
    expect(worldPoint(next.lat, next.lng, 17).x).toBeCloseTo(center.x + 40, 4);
  });
});
