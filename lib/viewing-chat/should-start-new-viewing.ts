/**
 * Whether tapping “New viewing” should wipe setup state and open a fresh
 * address entry. False when the user is already on the empty address screen.
 */
export function shouldStartNewViewing(hasActiveThread: boolean): boolean {
  return hasActiveThread;
}
