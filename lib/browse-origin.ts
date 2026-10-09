/** Where a browse detail (viewing note / public share) was opened from. */
export type BrowseOrigin = "viewings" | "shares";

export function parseBrowseOrigin(value: string | null | undefined): BrowseOrigin | null {
  if (value === "viewings" || value === "shares") return value;
  return null;
}

/** Append or replace `from=` on a same-origin path (keeps other query + hash). */
export function withBrowseOrigin(href: string, from: BrowseOrigin): string {
  try {
    const url = new URL(href, "https://kanfangji.local");
    url.searchParams.set("from", from);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

export function browseOriginHome(from: BrowseOrigin | null): {
  href: string;
  /** i18n key namespace hint for callers */
  kind: "home" | BrowseOrigin;
} {
  if (from === "viewings") return { href: "/viewings", kind: "viewings" };
  if (from === "shares") return { href: "/shares", kind: "shares" };
  return { href: "/", kind: "home" };
}

/**
 * Public share chrome: show ← Back only when opened from a browse hub
 * or when the signed-in viewer owns the link.
 */
export function shouldShowShareBack(
  fromParam: string | null | undefined,
  isOwner: boolean,
): boolean {
  return parseBrowseOrigin(fromParam) != null || isOwner;
}
