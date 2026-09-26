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

export function writeAnalyticsConsent(value: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
}

export function captureAllowed(): boolean {
  return readAnalyticsConsent() === "granted" && !hasGlobalPrivacyControl();
}

/** Value stored on the account so server events follow this device. */
export function mirroredAnalyticsConsent(): AnalyticsConsent {
  if (hasGlobalPrivacyControl()) return "denied";
  return readAnalyticsConsent() === "granted" ? "granted" : "denied";
}
