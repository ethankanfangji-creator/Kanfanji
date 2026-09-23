import { describe, expect, it } from "vitest";
import { shortenAddressLabel } from "./shorten-address";

describe("shortenAddressLabel", () => {
  it("drops country and ZIP noise for US Places-style strings", () => {
    expect(
      shortenAddressLabel("2436 S Leah St, Visalia, CA 93292, USA"),
    ).toBe("2436 S Leah St, Visalia, CA");
  });

  it("keeps street + city when already short", () => {
    expect(shortenAddressLabel("123 Main St, Burnaby, BC")).toBe(
      "123 Main St, Burnaby, BC",
    );
  });

  it("soft-truncates continuous Taiwan addresses", () => {
    const long = "台北市信義區信義路五段7號101大樓非常長的地址測試字串再加長";
    const short = shortenAddressLabel(long, 20);
    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(20);
  });

  it("returns empty for blank input", () => {
    expect(shortenAddressLabel("   ")).toBe("");
  });
});
