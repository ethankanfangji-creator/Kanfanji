export type BrowseLayout = "list" | "grid";

export const BROWSE_LAYOUT_KEY = "kf.browse.layout";

export function coerceBrowseLayout(value: unknown): BrowseLayout {
  return value === "list" ? "list" : "grid";
}

export function readBrowseLayout(): BrowseLayout {
  if (typeof window === "undefined") return "grid";
  try {
    return coerceBrowseLayout(window.localStorage.getItem(BROWSE_LAYOUT_KEY));
  } catch {
    return "grid";
  }
}

export function writeBrowseLayout(layout: BrowseLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BROWSE_LAYOUT_KEY, layout);
  } catch {
    /* ignore quota / private mode */
  }
}
