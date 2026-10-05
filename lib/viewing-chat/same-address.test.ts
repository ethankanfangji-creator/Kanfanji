import { describe, expect, it } from "vitest";
import { addressIdentity, sameViewingAddress } from "./same-address";

describe("sameViewingAddress", () => {
  it("matches street and city despite case and spacing", () => {
    expect(
      sameViewingAddress(
        "2143 Spring St, Port Moody, BC",
        "2143  spring street,  port moody",
      ),
    ).toBe(true);
  });

  it("does not match a different house number", () => {
    expect(
      sameViewingAddress("2143 Spring St, Port Moody", "2145 Spring Street, Port Moody"),
    ).toBe(false);
  });

  it("does not match different units at the same street", () => {
    expect(
      sameViewingAddress(
        "Unit 5, 2143 Spring St, Port Moody",
        "Unit 6, 2143 Spring St, Port Moody",
      ),
    ).toBe(false);
  });

  it("matches the same unit despite Unit vs # formatting", () => {
    expect(
      sameViewingAddress(
        "Unit 5, 2143 Spring St, Port Moody",
        "#5, 2143 Spring Street, Port Moody",
      ),
    ).toBe(true);
  });

  it("puts unit into the identity key", () => {
    expect(addressIdentity("Unit 5, 2143 Spring St, Port Moody")).toContain("|5|");
    expect(addressIdentity("2143 Spring St, Port Moody")).toContain("||");
  });
});
