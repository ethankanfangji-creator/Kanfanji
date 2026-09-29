import { describe, expect, it } from "vitest";
import { sameViewingAddress } from "./same-address";

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
});
