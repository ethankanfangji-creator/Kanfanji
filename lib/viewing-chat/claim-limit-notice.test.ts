/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAIM_LIMIT_NOTICE_KEY,
  consumeClaimLimitNotice,
  hasBlockedLimitThreads,
} from "./claim-limit-notice";

vi.mock("./local-store", () => ({
  listLocalThreads: vi.fn(),
}));

import { listLocalThreads } from "./local-store";

const listMock = vi.mocked(listLocalThreads);

describe("claim-limit-notice", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    listMock.mockReset();
  });

  it("detects blocked_limit threads for the user", () => {
    listMock.mockReturnValue([
      {
        id: "a",
        ownerUserId: "u1",
        cloud: { state: "synced" },
      },
      {
        id: "b",
        ownerUserId: "u1",
        cloud: { state: "blocked_limit" },
      },
    ] as ReturnType<typeof listLocalThreads>);
    expect(hasBlockedLimitThreads("u1")).toBe(true);
    expect(hasBlockedLimitThreads("other")).toBe(false);
  });

  it("consumes the session notice only once", () => {
    expect(consumeClaimLimitNotice(true)).toBe(true);
    expect(window.sessionStorage.getItem(CLAIM_LIMIT_NOTICE_KEY)).toBe("1");
    expect(consumeClaimLimitNotice(true)).toBe(false);
  });

  it("does not consume when shouldShow is false", () => {
    expect(consumeClaimLimitNotice(false)).toBe(false);
    expect(window.sessionStorage.getItem(CLAIM_LIMIT_NOTICE_KEY)).toBeNull();
  });
});
