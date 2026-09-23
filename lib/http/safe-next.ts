/** Allow only same-origin relative paths after auth redirects. */
export function safeInternalNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return "/";
  if (trimmed.includes("://") || trimmed.includes("\\")) return "/";
  try {
    const parsed = new URL(trimmed, "https://kanfangji.invalid");
    if (parsed.origin !== "https://kanfangji.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
