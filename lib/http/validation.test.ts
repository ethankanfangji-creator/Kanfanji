import { describe, expect, it } from "vitest";
import {
  assertAllowedKeys,
  optionalString,
  optionalStringArray,
  readJsonObject,
  RequestValidationError,
} from "./validation";

describe("request validation", () => {
  it("rejects malformed and non-object JSON", async () => {
    await expect(
      readJsonObject(new Request("https://example.test", { method: "POST", body: "{" })),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
    await expect(
      readJsonObject(
        new Request("https://example.test", {
          method: "POST",
          body: "[]",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_JSON_OBJECT" });
  });

  it("normalizes bounded strings and arrays", () => {
    expect(optionalString({ address: "  Main  " }, "address", { max: 20 })).toBe("Main");
    expect(
      optionalStringArray({ pros: ["  Light ", "", "Quiet"] }, "pros", {
        maxItems: 3,
        maxLength: 10,
      }),
    ).toEqual(["Light", "Quiet"]);
  });

  it("rejects unknown keys and invalid types with a field name", () => {
    expect(() => assertAllowedKeys({ owner_id: "x" }, ["address"])).toThrow(
      RequestValidationError,
    );
    expect(() => optionalString({ address: 1 }, "address")).toThrowError(
      expect.objectContaining({ code: "INVALID_FIELD_TYPE", field: "address" }),
    );
  });
});
