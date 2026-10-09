/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  BROWSE_LAYOUT_KEY,
  coerceBrowseLayout,
  readBrowseLayout,
  writeBrowseLayout,
} from "./browse-layout";

describe("browse-layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults unknown values to grid", () => {
    expect(coerceBrowseLayout(null)).toBe("grid");
    expect(coerceBrowseLayout("list")).toBe("list");
  });

  it("persists and reads layout", () => {
    expect(readBrowseLayout()).toBe("grid");
    writeBrowseLayout("list");
    expect(window.localStorage.getItem(BROWSE_LAYOUT_KEY)).toBe("list");
    expect(readBrowseLayout()).toBe("list");
  });
});
