export const ANALYTICS_CONSENT_KEY = "kanfangji.analytics.consent.v1";

export type AnalyticsConsent = "granted" | "denied";

export function hasGlobalPrivacyControl(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl ===
      true
  );
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/** Page-session arm. A leftover local "granted" does not send until this is set. */
let captureArmed = false;

export function writeAnalyticsConsent(value: AnalyticsConsent) {
  captureArmed = value === "granted";
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
}

export function disarmAnalyticsCapture() {
  captureArmed = false;
}

export function captureAllowed(): boolean {
  return captureArmed && readAnalyticsConsent() === "granted" && !hasGlobalPrivacyControl();
}
