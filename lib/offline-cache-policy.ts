const PRIVATE_PAGE_PREFIXES = ["/s/", "/c/", "/invite/", "/viewings", "/compare/"];

function isAtOrBelow(pathname: string, prefix: string): boolean {
  const root = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isCacheableAppRequest(
  request: { method: string; url: string; destination: string },
  appOrigin: string,
): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return false;
  if (isAtOrBelow(url.pathname, "/api")) return false;
  if (PRIVATE_PAGE_PREFIXES.some((prefix) => isAtOrBelow(url.pathname, prefix))) return false;
  if (
    url.searchParams.has("token") ||
    url.searchParams.has("signature") ||
    url.searchParams.has("X-Amz-Signature")
  ) {
    return false;
  }
  return request.destination === "document" || url.pathname.startsWith("/_next/static/");
}
