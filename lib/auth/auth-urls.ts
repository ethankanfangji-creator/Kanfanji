export function authRedirectUrl(path: "/auth/callback" | "/auth/reset"): string {
  return `${window.location.origin}${path}`;
}
