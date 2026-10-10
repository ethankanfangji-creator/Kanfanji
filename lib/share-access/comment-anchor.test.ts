import { describe, expect, it } from "vitest";
import {
  parseShareCommentFocusId,
  shareCommentDomId,
  shareCommentHash,
} from "./comment-anchor";

describe("share comment deep-link anchors", () => {
  it("builds stable DOM ids and hashes", () => {
    expect(shareCommentDomId("c1")).toBe("share-comment-c1");
    expect(shareCommentHash("c1")).toBe("#share-comment-c1");
  });

  it("parses focus ids from hash, prefixed id, or raw uuid", () => {
    expect(parseShareCommentFocusId("#share-comment-abc")).toBe("abc");
    expect(parseShareCommentFocusId("share-comment-abc")).toBe("abc");
    expect(parseShareCommentFocusId("abc")).toBe("abc");
    expect(parseShareCommentFocusId("")).toBeNull();
    expect(parseShareCommentFocusId(null)).toBeNull();
  });
});
