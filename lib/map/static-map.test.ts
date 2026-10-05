import { describe, expect, it } from "vitest";
import {
  mapTilesForCenter,
  osmTileUrl,
  parseMapCoordinate,
} from "./static-map";

describe("osm tiles", () => {
  it("builds tile URLs", () => {
    expect(osmTileUrl(16, 10557, 22085)).toBe(
      "https://tile.openstreetmap.org/16/10557/22085.png",
    );
  });

  it("places the center near the middle of the tile mosaic", () => {
    const tiles = mapTilesForCenter({
      lat: 49.278436,
      lng: -122.8798442,
      zoom: 16,
      width: 320,
      height: 180,
    });
    expect(tiles.length).toBeGreaterThan(0);
    const covering = tiles.some(
      (tile) =>
        tile.left <= 160 &&
        tile.left + 256 >= 160 &&
        tile.top <= 90 &&
        tile.top + 256 >= 90,
    );
    expect(covering).toBe(true);
  });
});

describe("parseMapCoordinate", () => {
  it("parses finite numbers and numeric strings", () => {
    expect(parseMapCoordinate(49.2)).toBe(49.2);
    expect(parseMapCoordinate("-122.8")).toBe(-122.8);
    expect(parseMapCoordinate("x")).toBeNull();
  });
});
