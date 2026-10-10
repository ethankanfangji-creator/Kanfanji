import { describe, expect, it } from "vitest";
import {
  CLOUD_THREAD_ID_RE,
  createCloudThreadId,
  isCloudThreadId,
} from "./thread-id";

describe("cloud thread ids", () => {
  it("accepts UUID v4 and rejects local_ fallbacks", () => {
    expect(isCloudThreadId("7fbd742e-a580-4798-83f9-cba445e0048b")).toBe(true);
    expect(isCloudThreadId("local_1791611244192")).toBe(false);
    expect(CLOUD_THREAD_ID_RE.test(createCloudThreadId())).toBe(true);
  });
});
