/** DOM id / hash fragment for deep-linking a share-report comment. */
export function shareCommentDomId(commentId: string): string {
  return `share-comment-${commentId}`;
}

export function shareCommentHash(commentId: string): string {
  return `#${shareCommentDomId(commentId)}`;
}

/** Parse comment id from `#share-comment-<uuid>` or raw uuid. */
export function parseShareCommentFocusId(raw: string | null | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  const fromHash = value.startsWith("#")
    ? value.slice(1)
    : value.startsWith("share-comment-")
      ? value
      : "";
  const id = fromHash.startsWith("share-comment-")
    ? fromHash.slice("share-comment-".length)
    : value.replace(/^#/, "");
  return id || null;
}
