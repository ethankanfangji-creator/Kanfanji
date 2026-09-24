/**
 * Mobile chat focus mode: hide the bottom tab bar while the user is inside an
 * active viewing thread, so the composer is not lifted by a second chrome bar.
 *
 * Empty address / “start new viewing” keeps the tabs visible. Opening a mobile
 * overlay (history drawer, search, media, account) exits focus so those sheets
 * can share the normal shell chrome.
 */
export function isChatFocusMode(input: {
  hasActiveThread: boolean;
  historyOpen: boolean;
  searchOpen: boolean;
  mediaOpen: boolean;
  accountOpen: boolean;
  /** Desktop history rail stays open; only the mobile drawer breaks focus. */
  isMobileViewport: boolean;
}): boolean {
  if (!input.hasActiveThread) return false;
  if (input.searchOpen || input.mediaOpen || input.accountOpen) return false;
  if (input.isMobileViewport && input.historyOpen) return false;
  return true;
}
